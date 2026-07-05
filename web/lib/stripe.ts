import Stripe from "stripe";
import type { PlanTier } from "./types";
import { isPaidPlan, type PaidPlan } from "./stripe-client";

let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not configured.");
    _stripe = new Stripe(key, { apiVersion: "2026-06-24.dahlia" });
  }
  return _stripe;
}

/**
 * Proxy so existing `stripe.customers.create(...)` call sites don't need to change, but the
 * real client — and its env var check — is only constructed on first use inside a request,
 * not at module import time. Constructing it eagerly breaks the build in any environment
 * where STRIPE_SECRET_KEY isn't set yet, even for routes that never actually run.
 */
export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return (getStripe() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export { isPaidPlan, type PaidPlan };

export function priceIdForPlan(plan: PaidPlan): string {
  const priceId =
    plan === "Player Pro"
      ? process.env.STRIPE_PRICE_PLAYER_PRO
      : process.env.STRIPE_PRICE_COACH_PRO;
  if (!priceId) throw new Error(`No Stripe price configured for plan "${plan}".`);
  return priceId;
}

export function planForPriceId(priceId: string): PlanTier | null {
  if (priceId === process.env.STRIPE_PRICE_PLAYER_PRO) return "Player Pro";
  if (priceId === process.env.STRIPE_PRICE_COACH_PRO) return "Coach Pro";
  return null;
}
