"use client";

import { useState } from "react";
import Link from "next/link";
import type { Player, PlanTier } from "@/lib/types";
import { formatDate, getPlayerStatus } from "@/lib/utils";
import { isPaidPlan } from "@/lib/stripe-client";

const PLANS: { tier: PlanTier; price: string; sessions: number | null; features: string[] }[] = [
  {
    tier: "Free",
    price: "Free",
    sessions: 4,
    features: ["4 sessions total", "Basic video upload", "Manual analysis"],
  },
  {
    tier: "Player Pro",
    price: "$9.99 / month",
    sessions: null,
    features: ["Unlimited sessions", "AI biomechanics", "Progress reports", "Video library"],
  },
  {
    tier: "Coach Pro",
    price: "$29.99 / month",
    sessions: null,
    features: [
      "Everything in Player Pro",
      "Unlimited players",
      "Academy management",
      "Bulk reports",
      "Priority support",
    ],
  },
];

export function SubscriptionPage({ player }: { player: Player }) {
  const status = getPlayerStatus(player.subscription.endDate);
  const [selectedPlan, setSelectedPlan] = useState<PlanTier>(player.subscription.plan);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState("");

  const daysLeft = Math.ceil(
    (new Date(player.subscription.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  async function handleCheckout() {
    if (!isPaidPlan(selectedPlan)) return;
    setError("");
    setRedirecting(true);
    try {
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: player.id, plan: selectedPlan }),
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
      const res = await fetch("/api/stripe/create-portal-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: player.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? "Could not open billing portal.");
      window.location.href = data.url;
    } catch (err) {
      setError((err as { message?: string })?.message ?? String(err));
      setRedirecting(false);
    }
  }

  const hasBillingAccount = !!player.subscription.stripeCustomerId;
  const hasActiveSub =
    player.subscription.subscriptionStatus === "active" ||
    player.subscription.subscriptionStatus === "trialing";
  const planChanged = selectedPlan !== player.subscription.plan;

  const initials = player.name
    .split(" ")
    .map((n) => n[0] ?? "")
    .join("");

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Back */}
      <div className="flex items-center justify-between mb-6">
        <Link
          href={`/players/${player.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
        >
          ← Back to Profile
        </Link>
      </div>

      {/* Player identity */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-full bg-pace-green flex items-center justify-center text-black font-bold text-xl flex-shrink-0">
          {initials}
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Manage Subscription</h1>
          <p className="text-zinc-400 text-sm">{player.name}</p>
        </div>
      </div>

      {/* Current subscription status card */}
      <div
        className={`rounded-2xl p-6 mb-6 border ${
          status === "Expired"
            ? "bg-red-500/10 border-red-500/30"
            : status === "Expiring"
              ? "bg-amber/10 border-amber/30"
              : "bg-pace-green/10 border-pace-green/30"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                  status === "Active"
                    ? "bg-pace-green/20 text-pace-green"
                    : status === "Expiring"
                      ? "bg-amber/20 text-amber"
                      : "bg-red-500/20 text-red-400"
                }`}
              >
                {status}
              </span>
              <span className="text-white font-semibold">{player.subscription.plan}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-2 mt-3">
              <Stat label="Start date" value={formatDate(player.subscription.startDate)} />
              <Stat label="Renewal date" value={formatDate(player.subscription.endDate)} />
              <Stat
                label="Sessions used"
                value={
                  player.subscription.sessionsLimit
                    ? `${player.subscription.sessionsUsed} / ${player.subscription.sessionsLimit}`
                    : `${player.subscription.sessionsUsed} (unlimited)`
                }
              />
            </div>
          </div>
          {/* Days left pill */}
          <div className="text-center flex-shrink-0">
            {status === "Expired" ? (
              <div className="text-red-400">
                <div className="text-3xl font-bold">{Math.abs(daysLeft)}</div>
                <div className="text-xs text-zinc-400">days overdue</div>
              </div>
            ) : (
              <div className={status === "Expiring" ? "text-amber" : "text-pace-green"}>
                <div className="text-3xl font-bold">{daysLeft}</div>
                <div className="text-xs text-zinc-400">days remaining</div>
              </div>
            )}
          </div>
        </div>

        {/* Sessions progress bar */}
        {player.subscription.sessionsLimit && (
          <div className="mt-5">
            <div className="flex justify-between text-xs text-zinc-400 mb-1.5">
              <span>Sessions used</span>
              <span>
                {player.subscription.sessionsUsed} / {player.subscription.sessionsLimit}
              </span>
            </div>
            <div className="h-2 bg-ink rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  player.subscription.sessionsUsed / player.subscription.sessionsLimit > 0.85
                    ? "bg-fire"
                    : "bg-pace-green"
                }`}
                style={{
                  width: `${Math.min(
                    (player.subscription.sessionsUsed / player.subscription.sessionsLimit) * 100,
                    100
                  )}%`,
                }}
              />
            </div>
          </div>
        )}

        {status !== "Active" && (
          <div
            className={`mt-4 text-sm font-medium ${
              status === "Expiring" ? "text-amber" : "text-red-400"
            }`}
          >
            {status === "Expiring"
              ? `⚠ Subscription expires in ${daysLeft} day${daysLeft !== 1 ? "s" : ""} — renew to keep access.`
              : "⛔ Subscription has expired. Renew to restore access."}
          </div>
        )}
      </div>

      {/* Plan selection */}
      <div className="bg-surface rounded-2xl p-6 mb-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-5">
          Choose Plan
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {PLANS.map((p) => {
            const isActive = selectedPlan === p.tier;
            return (
              <button
                key={p.tier}
                type="button"
                onClick={() => setSelectedPlan(p.tier)}
                className={`text-left p-5 rounded-xl border-2 transition-all cursor-pointer ${
                  isActive
                    ? "border-pace-green bg-pace-green/10"
                    : "border-zinc-700 hover:border-zinc-500 bg-ink"
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span
                    className={`text-sm font-bold ${isActive ? "text-pace-green" : "text-white"}`}
                  >
                    {p.tier}
                  </span>
                  {isActive && (
                    <span className="text-pace-green text-sm font-bold flex-shrink-0">✓</span>
                  )}
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

      {/* Billing actions */}
      <div className="flex flex-wrap items-center gap-3 mb-8">
        {hasActiveSub ? (
          <button
            type="button"
            onClick={handleManageBilling}
            disabled={redirecting}
            className="px-6 py-3 rounded-xl text-sm font-bold bg-pace-green text-black hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-60"
          >
            {redirecting ? "Redirecting…" : "Manage Billing"}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleCheckout}
            disabled={redirecting || !isPaidPlan(selectedPlan) || !planChanged}
            className="px-6 py-3 rounded-xl text-sm font-bold bg-pace-green text-black hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-60"
          >
            {redirecting ? "Redirecting…" : `Subscribe to ${selectedPlan}`}
          </button>
        )}
        {hasBillingAccount && !hasActiveSub && (
          <button
            type="button"
            onClick={handleManageBilling}
            disabled={redirecting}
            className="px-6 py-3 rounded-xl text-sm font-medium text-zinc-400 border border-zinc-700 hover:text-white hover:border-zinc-500 transition-colors cursor-pointer"
          >
            View billing history
          </button>
        )}
        <Link
          href={`/players/${player.id}`}
          className="px-6 py-3 rounded-xl text-sm font-medium text-zinc-400 border border-zinc-700 hover:text-white hover:border-zinc-500 transition-colors"
        >
          Cancel
        </Link>
      </div>

      {hasActiveSub && (
        <p className="text-zinc-500 text-xs -mt-4 mb-8">
          To switch plans, update your payment method, view invoices, or cancel, use Manage Billing above — it opens Stripe&apos;s secure billing portal.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-zinc-400 mb-0.5">{label}</div>
      <div className="text-sm font-semibold text-white">{value}</div>
    </div>
  );
}
