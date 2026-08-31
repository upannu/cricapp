"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import type { Coach, PlanTier, Plan } from "@/lib/types";
import { isPaidPlan } from "@/lib/stripe-client";
import { coachPlanFeatureLines } from "@/lib/plan-features";
import { fetchActivePlans } from "@/lib/db";
import { InvoiceHistoryList } from "@/components/InvoiceHistoryList";
import { DEFAULT_CURRENCY, formatMoney, resolvePlanPrice, type Currency } from "@/lib/currency";

const TIER_SLUGS: Record<"Free" | "Coach Pro", string> = { Free: "free", "Coach Pro": "coach-pro" };

function buildPlanCards(plans: Plan[], currency: Currency): { tier: "Free" | "Coach Pro"; price: string; features: string[] }[] {
  return (["Free", "Coach Pro"] as const).map((tier) => {
    const row = plans.find((p) => p.slug === TIER_SLUGS[tier]);
    if (!row) return { tier, price: "…", features: coachPlanFeatureLines(tier, plans) };
    if (row.priceAud === 0) return { tier, price: "Free", features: coachPlanFeatureLines(tier, plans) };
    const { amount, currency: billCurrency } = resolvePlanPrice(row.priceAud, row.pricesByCurrency, currency);
    return {
      tier,
      price: `${formatMoney(amount, billCurrency)} / ${row.billingInterval ?? "month"}`,
      features: coachPlanFeatureLines(tier, plans),
    };
  });
}

/** A coach's own plan — only meaningful for an independent coach (no academyId); one employed by
 * an academy has no reason to pay for this themselves, but nothing here checks that specifically
 * since an academy coach just never has a reason to visit this page. */
export function CoachSubscriptionPage({ coach }: { coach: Coach }) {
  const [selectedPlan, setSelectedPlan] = useState<"Free" | "Coach Pro">(coach.subPlan === "Coach Pro" ? "Coach Pro" : "Free");
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState("");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [currency] = useState<Currency>(coach.currency ?? DEFAULT_CURRENCY);

  useEffect(() => {
    fetchActivePlans().then(setPlans).catch(() => {});
  }, []);

  const PLANS = useMemo(() => buildPlanCards(plans, currency), [plans, currency]);

  const hasActiveSub =
    coach.subscriptionStatus === "active" || coach.subscriptionStatus === "trialing";
  const hasBillingAccount = !!coach.stripeCustomerId;
  const planChanged = selectedPlan !== coach.subPlan;

  async function handleCheckout() {
    if (!isPaidPlan(selectedPlan as PlanTier)) return;
    setError("");
    setRedirecting(true);
    try {
      const res = await fetch("/api/stripe/create-coach-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coachId: coach.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? "Could not start checkout.");
      window.location.href = data.url;
    } catch (err) {
      setError((err as { message?: string })?.message ?? String(err));
      setRedirecting(false);
    }
  }

  async function handleManageBilling() {
    setError("");
    setRedirecting(true);
    try {
      const res = await fetch("/api/stripe/create-coach-portal-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coachId: coach.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? "Could not open billing portal.");
      window.location.href = data.url;
    } catch (err) {
      setError((err as { message?: string })?.message ?? String(err));
      setRedirecting(false);
    }
  }

  const initials = coach.name.split(" ").map((n) => n[0] ?? "").join("");

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <Link href="/coaches" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors">
          ← Back to Coaches
        </Link>
      </div>

      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-full bg-pace-green flex items-center justify-center text-black font-bold text-xl flex-shrink-0">
          {initials}
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Manage Subscription</h1>
          <p className="text-zinc-400 text-sm">{coach.name}</p>
        </div>
      </div>

      <div className="rounded-2xl p-6 mb-6 border bg-pace-green/10 border-pace-green/30">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-pace-green/20 text-pace-green">
            {hasActiveSub ? "Active" : "Free"}
          </span>
          <span className="text-white font-semibold">{coach.subPlan === "Coach Pro" ? "Coach Pro" : "Free"}</span>
        </div>
      </div>

      <div className="bg-surface rounded-2xl p-6 mb-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-5">Choose Plan</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {PLANS.map((p) => {
            const isActive = selectedPlan === p.tier;
            return (
              <button
                key={p.tier}
                type="button"
                onClick={() => setSelectedPlan(p.tier)}
                className={`text-left p-5 rounded-xl border-2 transition-all cursor-pointer ${
                  isActive ? "border-pace-green bg-pace-green/10" : "border-zinc-700 hover:border-zinc-500 bg-ink"
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className={`text-sm font-bold ${isActive ? "text-pace-green" : "text-white"}`}>{p.tier}</span>
                  {isActive && <span className="text-pace-green text-sm font-bold flex-shrink-0">✓</span>}
                </div>
                <div className="text-lg font-bold text-white mb-3">{p.price}</div>
                <ul className="space-y-1.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-xs text-zinc-400">
                      <span className="text-pace-green mt-0.5 flex-shrink-0">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-8">
        {hasActiveSub ? (
          <button type="button" onClick={handleManageBilling} disabled={redirecting}
            className="px-6 py-3 rounded-xl text-sm font-bold bg-pace-green text-black hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-60">
            {redirecting ? "Redirecting…" : "Manage Billing"}
          </button>
        ) : (
          <button type="button" onClick={handleCheckout} disabled={redirecting || !isPaidPlan(selectedPlan as PlanTier) || !planChanged}
            className="px-6 py-3 rounded-xl text-sm font-bold bg-pace-green text-black hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-60">
            {redirecting ? "Redirecting…" : `Subscribe to ${selectedPlan}`}
          </button>
        )}
        {hasBillingAccount && !hasActiveSub && (
          <button type="button" onClick={handleManageBilling} disabled={redirecting}
            className="px-6 py-3 rounded-xl text-sm font-medium text-zinc-400 border border-zinc-700 hover:text-white hover:border-zinc-500 transition-colors cursor-pointer">
            View billing history
          </button>
        )}
        <Link href="/coaches" className="px-6 py-3 rounded-xl text-sm font-medium text-zinc-400 border border-zinc-700 hover:text-white hover:border-zinc-500 transition-colors">
          Cancel
        </Link>
      </div>

      {hasActiveSub && (
        <p className="text-zinc-500 text-xs -mt-4 mb-8">
          To switch plans, update your payment method, or cancel, use Manage Billing above — it opens Stripe&apos;s secure billing portal.
        </p>
      )}

      <InvoiceHistoryList scope="coach" id={coach.id} />
    </div>
  );
}
