"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { Player, Report, Session } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { fetchPlayers, fetchReports, fetchSessions } from "@/lib/db";
import { getInitials } from "@/lib/utils";
import { computeInjuryRiskTrend, computeRpeSummary, type InjuryRiskTrend, type RpeSummary } from "@/lib/performance-trends";
import { Sparkline } from "@/components/Sparkline";

const RISK_STYLES: Record<string, string> = {
  Low: "bg-pace-green/10 text-pace-green border-pace-green/20",
  Moderate: "bg-amber/10 text-amber border-amber/20",
  High: "bg-red-500/10 text-red-400 border-red-500/20",
};

const DIRECTION_ICON: Record<InjuryRiskTrend["direction"], string> = {
  worsening: "↑",
  improving: "↓",
  stable: "→",
  unknown: "·",
};

const DIRECTION_STYLE: Record<InjuryRiskTrend["direction"], string> = {
  worsening: "text-red-400",
  improving: "text-pace-green",
  stable: "text-zinc-400",
  unknown: "text-zinc-600",
};

interface PlayerRow {
  player: Player;
  riskTrend: InjuryRiskTrend;
  rpe: RpeSummary;
}

export function PerformanceClient() {
  const { user } = useAuth();
  const [rows, setRows] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const coachId = user?.role === "coach" ? user.coachId : undefined;
    Promise.all([fetchPlayers(coachId), fetchReports(), fetchSessions()]).then(([players, reports, sessions]) => {
      const playerIds = new Set(players.map((p) => p.id));
      const reportsByPlayer = groupBy(reports.filter((r) => playerIds.has(r.playerId)), (r: Report) => r.playerId);
      const sessionsByPlayer = groupBy(sessions.filter((s) => playerIds.has(s.playerId)), (s: Session) => s.playerId);

      const computed = players.map((player) => ({
        player,
        riskTrend: computeInjuryRiskTrend(reportsByPlayer[player.id] ?? []),
        rpe: computeRpeSummary(sessionsByPlayer[player.id] ?? []),
      }));

      // Players needing attention float to the top
      computed.sort((a, b) => {
        if (a.riskTrend.alert !== b.riskTrend.alert) return a.riskTrend.alert ? -1 : 1;
        return a.player.name.localeCompare(b.player.name);
      });

      setRows(computed);
      setLoading(false);
    });
  }, [user]);

  const alerting = rows.filter((r) => r.riskTrend.alert);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">Performance Dashboard</h1>
        <p className="text-zinc-400 text-sm">Injury-risk trends and training load (RPE) across your squad</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 rounded-full border-2 border-pace-green border-t-transparent animate-spin" />
        </div>
      ) : (
        <>
          {alerting.length > 0 && (
            <div className="mb-8">
              <p className="text-xs font-bold uppercase tracking-wider text-red-400 mb-3">⚠ Needs Attention ({alerting.length})</p>
              <div className="space-y-3">
                {alerting.map(({ player, riskTrend }) => (
                  <div key={player.id} className="bg-red-500/5 border border-red-500/30 rounded-2xl p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center text-red-400 text-sm font-bold flex-shrink-0">
                      {getInitials(player.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold text-sm">{player.name}</p>
                      <p className="text-red-400 text-xs">{riskTrend.alertReason}</p>
                    </div>
                    <Link href={`/players/${player.id}`} className="px-3 py-1.5 text-xs font-semibold text-zinc-300 border border-zinc-600 rounded-lg hover:border-pace-green hover:text-pace-green transition-colors flex-shrink-0">
                      View Player
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            {rows.map(({ player, riskTrend, rpe }) => (
              <div key={player.id} className="bg-surface rounded-2xl p-5">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-pace-green/20 flex items-center justify-center text-pace-green text-sm font-bold flex-shrink-0">
                    {getInitials(player.name)}
                  </div>
                  <div className="flex-1 min-w-40">
                    <Link href={`/players/${player.id}`} className="text-white font-semibold text-sm hover:text-pace-green transition-colors">
                      {player.name}
                    </Link>
                    <div className="flex items-center gap-2 mt-1">
                      {riskTrend.current ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${RISK_STYLES[riskTrend.current]}`}>
                          {riskTrend.current} risk
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-600">No reports yet</span>
                      )}
                      {riskTrend.current && (
                        <span className={`text-xs font-bold ${DIRECTION_STYLE[riskTrend.direction]}`}>
                          {DIRECTION_ICON[riskTrend.direction]} {riskTrend.direction}
                        </span>
                      )}
                    </div>
                  </div>

                  {riskTrend.history.length > 1 && (
                    <div className="flex-shrink-0">
                      <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1 text-center">Overall Score Trend</p>
                      <Sparkline
                        values={riskTrend.history.map((h) => h.overallScore ?? 0)}
                        min={0} max={100}
                        color={riskTrend.direction === "worsening" ? "#FF4D4D" : "#00D4AA"}
                      />
                    </div>
                  )}

                  <div className="flex-shrink-0 text-right min-w-24">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-0.5">7-day RPE load</p>
                    <p className="text-sm font-bold font-mono text-white">{rpe.weeklyLoad || "—"}</p>
                  </div>

                  {rpe.history.length > 1 && (
                    <div className="flex-shrink-0">
                      <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1 text-center">RPE Trend</p>
                      <Sparkline values={rpe.history.map((h) => h.rpe)} min={1} max={10} color="#E8B93F" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {rows.length === 0 && (
            <div className="bg-surface rounded-2xl p-16 text-center">
              <p className="text-zinc-400 text-sm">No players to show yet.</p>
            </div>
          )}

          <p className="text-xs text-zinc-600 mt-6 text-center">
            Injury-risk trend is computed from each player&apos;s AI biomechanics reports (guideline-based, not a clinical assessment).
            7-day RPE load is a simple sum of logged perceived-exertion scores, not a validated training-load model.
          </p>
        </>
      )}
    </div>
  );
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of items) {
    const key = keyFn(item);
    (result[key] ??= []).push(item);
  }
  return result;
}
