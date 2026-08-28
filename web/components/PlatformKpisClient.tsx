"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { fetchAcademies, fetchCoaches, fetchAllPlans } from "@/lib/db";
import { formatMoney } from "@/lib/currency";
import type { Academy, Coach, Plan, AcademyStage } from "@/lib/types";

const STAGE_STYLES: Record<AcademyStage, string> = {
  Foundation: "bg-blue-500/20 text-blue-400",
  Mechanics:  "bg-amber/20 text-amber",
  Velocity:   "bg-fire/20 text-fire",
  Elite:      "bg-pace-green/20 text-pace-green",
};

function subStatusStyle(status: string | undefined): string {
  if (status === "active") return "bg-pace-green/20 text-pace-green";
  if (status === "trialing") return "bg-amber/20 text-amber";
  if (status === "past_due" || status === "unpaid") return "bg-fire/20 text-fire";
  if (status === "canceled") return "bg-zinc-700 text-zinc-400";
  return "bg-zinc-700 text-zinc-400";
}

function subStatusLabel(status: string | undefined): string {
  if (!status) return "No plan";
  if (status === "past_due") return "Past due";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function needsAttention(academy: Academy): boolean {
  if (academy.subscriptionStatus === "past_due" || academy.subscriptionStatus === "unpaid") return true;
  if (academy.status === "Active" && !academy.planId) return true;
  return false;
}

export function PlatformKpisClient() {
  const { user } = useAuth();
  const router = useRouter();
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && user.role !== "platform_admin") { router.replace("/players"); return; }
  }, [user, router]);

  useEffect(() => {
    Promise.all([fetchAcademies(), fetchCoaches(), fetchAllPlans()]).then(([a, c, p]) => {
      setAcademies(a); setCoaches(c); setPlans(p); setLoading(false);
    });
  }, []);

  if (!user || user.role !== "platform_admin") return null;

  const activeCount     = academies.filter((a) => a.status === "Active").length;
  const totalPlayers    = new Set(academies.flatMap((a) => a.playerIds)).size;
  const attentionCount  = academies.filter(needsAttention).length;

  const planCounts = plans
    .map((p) => ({ plan: p, count: academies.filter((a) => a.planId === p.id).length }))
    .filter((row) => row.count > 0 || row.plan.active)
    .sort((a, b) => b.count - a.count);
  const noPlanCount = academies.filter((a) => !a.planId).length;

  const sortedAcademies = [...academies].sort((a, b) => {
    const aFlag = needsAttention(a) ? 0 : 1;
    const bFlag = needsAttention(b) ? 0 : 1;
    if (aFlag !== bFlag) return aFlag - bFlag;
    return a.name.localeCompare(b.name);
  });

  const planName = (id: string | undefined) => plans.find((p) => p.id === id)?.name ?? "—";
  const coachCount = (a: Academy) => (a.coachIds ?? []).length;

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">Platform KPIs</h1>
        <p className="text-zinc-400 text-sm">Cross-academy overview — plans, subscription status, coaches</p>
      </div>

      {loading ? (
        <div className="text-zinc-500 text-sm">Loading…</div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
            <div className="bg-surface rounded-2xl p-5 text-center">
              <div className="text-2xl font-bold text-white mb-1">{academies.length}</div>
              <div className="text-xs text-zinc-400">Total academies</div>
            </div>
            <div className="bg-surface rounded-2xl p-5 text-center">
              <div className="text-2xl font-bold text-pace-green mb-1">{activeCount}</div>
              <div className="text-xs text-zinc-400">Active academies</div>
            </div>
            <div className="bg-surface rounded-2xl p-5 text-center">
              <div className="text-2xl font-bold text-blue-400 mb-1">{coaches.length}</div>
              <div className="text-xs text-zinc-400">Total coaches</div>
            </div>
            <div className="bg-surface rounded-2xl p-5 text-center">
              <div className="text-2xl font-bold text-amber mb-1">{totalPlayers}</div>
              <div className="text-xs text-zinc-400">Total players</div>
            </div>
            <div className="bg-surface rounded-2xl p-5 text-center">
              <div className={`text-2xl font-bold mb-1 ${attentionCount > 0 ? "text-fire" : "text-white"}`}>{attentionCount}</div>
              <div className="text-xs text-zinc-400">Needs attention</div>
            </div>
          </div>

          {/* Plan distribution */}
          <div className="bg-surface rounded-2xl p-5 mb-6">
            <h2 className="text-sm font-bold text-white mb-4">Plan distribution</h2>
            <div className="space-y-2">
              {planCounts.map(({ plan, count }) => (
                <div key={plan.id} className="flex items-center justify-between text-sm py-1.5 border-b border-zinc-800 last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-white font-medium truncate">{plan.name}</span>
                    <span className="text-zinc-500 text-xs flex-shrink-0">
                      {plan.billingType === "one_time" ? "one-time" : `/${plan.billingInterval}`} · {formatMoney(plan.priceAud, "aud")}
                    </span>
                  </div>
                  <span className="text-zinc-300 font-bold flex-shrink-0">{count}</span>
                </div>
              ))}
              {noPlanCount > 0 && (
                <div className="flex items-center justify-between text-sm py-1.5">
                  <span className="text-zinc-500">No plan assigned</span>
                  <span className="text-zinc-400 font-bold">{noPlanCount}</span>
                </div>
              )}
              {planCounts.length === 0 && noPlanCount === 0 && (
                <div className="text-zinc-500 text-sm">No academies yet.</div>
              )}
            </div>
          </div>

          {/* Per-academy table */}
          <div className="bg-surface rounded-2xl overflow-hidden">
            <h2 className="text-sm font-bold text-white px-5 pt-5 mb-3">Academies</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-zinc-500 text-xs border-b border-zinc-800">
                    <th className="px-5 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Stage</th>
                    <th className="px-3 py-2 font-medium">Plan</th>
                    <th className="px-3 py-2 font-medium">Subscription</th>
                    <th className="px-3 py-2 font-medium text-center">Coaches</th>
                    <th className="px-3 py-2 font-medium text-center">Players</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedAcademies.map((a) => (
                    <tr key={a.id} className="border-b border-zinc-800 last:border-0">
                      <td className="px-5 py-2.5 text-white font-medium">{a.name}</td>
                      <td className="px-3 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          a.status === "Active" ? "bg-pace-green/20 text-pace-green" : "bg-zinc-700 text-zinc-400"
                        }`}>{a.status}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STAGE_STYLES[a.stage]}`}>{a.stage}</span>
                      </td>
                      <td className="px-3 py-2.5 text-zinc-300">{planName(a.planId)}</td>
                      <td className="px-3 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${subStatusStyle(a.subscriptionStatus)}`}>
                          {subStatusLabel(a.subscriptionStatus)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center text-zinc-300">{coachCount(a)}</td>
                      <td className="px-3 py-2.5 text-center text-zinc-300">{a.playerIds.length}</td>
                    </tr>
                  ))}
                  {sortedAcademies.length === 0 && (
                    <tr><td colSpan={7} className="px-5 py-6 text-center text-zinc-500">No academies yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
