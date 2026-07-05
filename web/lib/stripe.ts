import Stripe from "stripe";
import type { PlanTier } from "./types";
import { isPaidPlan, type PaidPlan } from "./stripe-client";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-06-24.dahlia",
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
