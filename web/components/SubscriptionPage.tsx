"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Player, PlanTier } from "@/lib/types";
import { formatDate, getPlayerStatus } from "@/lib/utils";

const PLANS: { tier: PlanTier; price: string; sessions: number | null; features: string[] }[] = [
  {
    tier: "Free",
    price: "Free",
    sessions: 4,
    features: ["4 sessions total", "Basic video upload", "Manual analysis"],
  },
  {
    tier: "Player Pro",
    price: "$29 / month",
    sessions: null,
    features: ["Unlimited sessions", "AI biomechanics", "Progress reports", "Video library"],
  },
  {
    tier: "Coach Pro",
    price: "$79 / month",
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

const MOCK_HISTORY = [
  { date: "2026-01-15", description: "Player Pro — Monthly renewal", amount: "$29.00", status: "Paid" },
  { date: "2025-12-15", description: "Player Pro — Monthly renewal", amount: "$29.00", status: "Paid" },
  { date: "2025-11-15", description: "Player Pro — Monthly renewal", amount: "$29.00", status: "Paid" },
  { date: "2025-10-15", description: "Player Pro — First payment", amount: "$29.00", status: "Paid" },
];

export function SubscriptionPage({ player }: { player: Player }) {
  const router = useRouter();
  const status = getPlayerStatus(player.subscription.endDate);
  const [selectedPlan, setSelectedPlan] = useState<PlanTier>(player.subscription.plan);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const daysLeft = Math.ceil(
    (new Date(player.subscription.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  function handleSave() {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setSaved(true);
      setTimeout(() => router.push(`/players/${player.id}`), 1200);
    }, 900);
  }

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

      {/* Renewal / save actions */}
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || saved}
          className={`px-6 py-3 rounded-xl text-sm font-bold transition-all cursor-pointer ${
            saved
              ? "bg-pace-green/60 text-black"
              : saving
                ? "bg-pace-green/80 text-black"
                : "bg-pace-green text-black hover:opacity-90"
          }`}
        >
          {saved ? "✓ Saved" : saving ? "Saving…" : "Save Changes"}
        </button>
        {(status === "Expiring" || status === "Expired") && (
          <button
            type="button"
            className="px-6 py-3 rounded-xl text-sm font-bold bg-fire text-white hover:opacity-90 transition-opacity cursor-pointer"
          >
            Renew Now
          </button>
        )}
        <Link
          href={`/players/${player.id}`}
          className="px-6 py-3 rounded-xl text-sm font-medium text-zinc-400 border border-zinc-700 hover:text-white hover:border-zinc-500 transition-colors"
        >
          Cancel
        </Link>
      </div>

      {/* Payment history */}
      <div className="bg-surface rounded-2xl p-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-5">
          Payment History
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-zinc-700">
                <th className="pb-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider pr-6">
                  Date
                </th>
                <th className="pb-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider pr-6">
                  Description
                </th>
                <th className="pb-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider pr-6">
                  Amount
                </th>
                <th className="pb-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {MOCK_HISTORY.map((row, i) => (
                <tr key={i}>
                  <td className="py-3 text-zinc-300 pr-6">{formatDate(row.date)}</td>
                  <td className="py-3 text-white pr-6">{row.description}</td>
                  <td className="py-3 text-zinc-300 font-mono pr-6">{row.amount}</td>
                  <td className="py-3">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-pace-green/20 text-pace-green">
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
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
