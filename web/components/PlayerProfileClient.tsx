"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { fetchPlayer, fetchAcademies, fetchCoaches, fetchReports, fetchSessions } from "@/lib/db";
import { formatDate, getPlayerStatus, getCoachOrAcademyLabel } from "@/lib/utils";
import { PlayerMessages } from "@/components/PlayerMessages";
import { computeInjuryRiskTrend, computeRpeSummary, type InjuryRiskTrend, type RpeSummary } from "@/lib/performance-trends";
import { Sparkline } from "@/components/Sparkline";
import { BadgeStrip } from "@/components/BadgeStrip";
import type { Academy, Coach, Player, PlayerStatus } from "@/lib/types";

const DIRECTION_LABEL: Record<InjuryRiskTrend["direction"], string> = {
  worsening: "↑ Worsening",
  improving: "↓ Improving",
  stable: "→ Stable",
  unknown: "Not enough history yet",
};

export function PlayerProfileClient({ playerId }: { playerId: string }) {
  const [player, setPlayer] = useState<Player | null>(null);
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [riskTrend, setRiskTrend] = useState<InjuryRiskTrend | null>(null);
  const [rpeSummary, setRpeSummary] = useState<RpeSummary | null>(null);
  const [reportCount, setReportCount] = useState(0);

  useEffect(() => {
    Promise.all([fetchPlayer(playerId), fetchAcademies(), fetchCoaches(), fetchReports(playerId), fetchSessions(undefined, [playerId])]).then(([p, a, c, reports, sessions]) => {
      if (!p) setNotFound(true);
      else setPlayer(p);
      setAcademies(a);
      setCoaches(c);
      setRiskTrend(computeInjuryRiskTrend(reports));
      setRpeSummary(computeRpeSummary(sessions));
      setReportCount(reports.length);
    });
  }, [playerId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (notFound) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-16 text-center text-zinc-400">
        Player not found.{" "}
        <Link href="/players" className="text-pace-green hover:underline">
          Back to Players
        </Link>
      </div>
    );
  }

  if (!player) return null;

  const status = getPlayerStatus(player.subscription.endDate);
  const initials = player.name
    .split(" ")
    .map((n) => n[0] ?? "")
    .join("");

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Back + Edit */}
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/players"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
        >
          ← Back to Players
        </Link>
        <Link
          href={`/players/${playerId}/edit`}
          className="px-4 py-2 text-sm font-semibold text-black bg-pace-green rounded-xl hover:opacity-90 transition-opacity"
        >
          Edit Player
        </Link>
      </div>

      {/* Header card */}
      <div className="bg-surface rounded-2xl p-6 mb-4 flex items-start gap-5">
        <div className="w-20 h-20 rounded-full bg-pace-green flex items-center justify-center text-black font-bold text-2xl flex-shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
            <h1 className="text-2xl font-bold text-white">{player.name}</h1>
            <PlanBadge plan={player.subscription.plan} />
            <StatusBadge status={status} />
            {player.biomechanics.injuryRisk !== "Low" && (
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  player.biomechanics.injuryRisk === "High"
                    ? "bg-fire/20 text-fire"
                    : "bg-amber/20 text-amber"
                }`}
              >
                ⚠ {player.biomechanics.injuryRisk} Injury Risk
              </span>
            )}
          </div>
          <p className="text-zinc-400 text-sm mb-2">
            {player.bowlingStyle} · Added {formatDate(player.addedDate)}
          </p>
          <span className="text-pace-green font-mono font-bold text-sm">
            ⚡ {player.xp.toLocaleString()} XP
          </span>
        </div>
      </div>

      {/* 2×2 info grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Subscription */}
        <InfoCard title="Subscription">
          <InfoRow label="Plan" value={player.subscription.plan} />
          <InfoRow
            label="Status"
            value={
              <span
                className={
                  status === "Active"
                    ? "text-pace-green font-semibold"
                    : status === "Expiring"
                      ? "text-amber font-semibold"
                      : "text-red-400 font-semibold"
                }
              >
                {status}
              </span>
            }
          />
          <InfoRow
            label="Start date"
            value={formatDate(player.subscription.startDate)}
          />
          <InfoRow
            label="Renewal date"
            value={
              <span
                className={
                  status === "Expiring"
                    ? "text-amber font-semibold"
                    : status === "Expired"
                      ? "text-red-400 font-semibold"
                      : ""
                }
              >
                {formatDate(player.subscription.endDate)}
                {status === "Expiring" && (
                  <span className="text-amber"> — Renew now</span>
                )}
              </span>
            }
          />
          <InfoRow
            label="Sessions used"
            value={
              player.subscription.sessionsLimit
                ? `${player.subscription.sessionsUsed} / ${player.subscription.sessionsLimit}`
                : `${player.subscription.sessionsUsed} (unlimited)`
            }
          />
        </InfoCard>

        {/* Biomechanics */}
        <InfoCard title="Latest Biomechanics">
          <InfoRow
            label="Ball speed"
            value={
              <span className="font-mono font-semibold">
                {player.biomechanics.ballSpeedKmh.toFixed(1)} km/h
              </span>
            }
          />
          <InfoRow
            label="Front knee angle"
            value={
              <span className="font-mono">
                {player.biomechanics.frontKneeAngleDeg}°
              </span>
            }
          />
          <InfoRow label="Action type" value={player.biomechanics.actionType} />
          <InfoRow
            label="Injury risk"
            value={
              <span
                className={
                  player.biomechanics.injuryRisk === "High"
                    ? "text-fire font-semibold"
                    : player.biomechanics.injuryRisk === "Moderate"
                      ? "text-amber font-semibold"
                      : "text-pace-green"
                }
              >
                {player.biomechanics.injuryRisk}
              </span>
            }
          />
          <InfoRow
            label="Last session"
            value={formatDate(player.biomechanics.lastSession)}
          />
        </InfoCard>

        {/* Academy progress */}
        <InfoCard title="Academy Progress">
          <InfoRow
            label="Stage"
            value={
              <span className="text-pace-green font-semibold">
                {player.academy.stage}
              </span>
            }
          />
          <div className="py-1">
            <div className="flex justify-between text-xs text-zinc-400 mb-1.5">
              <span>Completion</span>
              <span>{player.academy.completionPercent}%</span>
            </div>
            <div className="h-1.5 bg-ink rounded-full overflow-hidden">
              <div
                className="h-full bg-pace-green rounded-full"
                style={{ width: `${player.academy.completionPercent}%` }}
              />
            </div>
          </div>
          <InfoRow label="Sessions" value={player.academy.totalSessions} />
          <InfoRow
            label="XP earned"
            value={
              <span className="font-mono">
                ⚡ {player.academy.xp.toLocaleString()}
              </span>
            }
          />
          <InfoRow
            label="Articles read"
            value={`${player.academy.articlesRead} / 29`}
          />
        </InfoCard>

        {/* Badges */}
        <InfoCard title="Badges & Milestones">
          <BadgeStrip player={player} reportCount={reportCount} />
        </InfoCard>

        {/* Contact & profile */}
        <InfoCard title="Contact & Profile">
          <InfoRow
            label="Email"
            value={
              <span className="text-zinc-300 text-sm break-all">
                {player.email}
              </span>
            }
          />
          <InfoRow
            label="Mobile"
            value={
              <span className="text-zinc-300 text-sm">
                {player.phone || <span className="text-zinc-600">Not set</span>}
              </span>
            }
          />
          <InfoRow label="Age group" value={player.ageGroup} />
          <InfoRow label="Club" value={player.club} />
          <InfoRow label="Coach" value={getCoachOrAcademyLabel(player, coaches, academies)} />
          <InfoRow
            label="Guardian consent"
            value={
              <span
                className={
                  player.guardianConsentStatus === "Confirmed"
                    ? "text-pace-green"
                    : player.guardianConsentStatus === "Pending"
                      ? "text-amber"
                      : "text-zinc-400"
                }
              >
                {player.guardianConsentStatus}
              </span>
            }
          />
        </InfoCard>
      </div>

      {/* Performance trends */}
      {(riskTrend?.history.length || rpeSummary?.history.length) ? (
        <div className="bg-surface rounded-2xl p-5 mb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-4">Performance Trends</p>

          {riskTrend?.alert && (
            <div className="bg-red-500/5 border border-red-500/30 rounded-xl px-4 py-3 mb-4">
              <p className="text-red-400 text-sm font-semibold">⚠ {riskTrend.alertReason}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {riskTrend && riskTrend.history.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-zinc-400">Injury Risk Trend</span>
                  <span className={`text-xs font-semibold ${riskTrend.direction === "worsening" ? "text-red-400" : riskTrend.direction === "improving" ? "text-pace-green" : "text-zinc-400"}`}>
                    {DIRECTION_LABEL[riskTrend.direction]}
                  </span>
                </div>
                <Sparkline
                  values={riskTrend.history.map((h) => h.overallScore ?? 0)}
                  min={0} max={100}
                  color={riskTrend.direction === "worsening" ? "#FF4D4D" : "#00D4AA"}
                />
              </div>
            )}
            {rpeSummary && rpeSummary.history.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-zinc-400">RPE Trend</span>
                  <span className="text-xs font-mono text-white">7-day load: {rpeSummary.weeklyLoad}</span>
                </div>
                <Sparkline values={rpeSummary.history.map((h) => h.rpe)} min={1} max={10} color="#E8B93F" />
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Message history */}
      <PlayerMessages
        playerId={playerId}
        playerName={player.name}
        playerEmail={player.email}
        playerPhone={player.phone}
      />

      {/* Footer actions */}
      <div className="flex flex-wrap gap-3">
        <Link
          href={`/players/${playerId}/reports`}
          className="px-5 py-2.5 rounded-xl text-sm font-medium transition-colors border bg-surface text-white border-zinc-700 hover:bg-surface-hover"
        >
          View All Reports
        </Link>
        <Link
          href={`/players/${playerId}/action-plans`}
          className="px-5 py-2.5 rounded-xl text-sm font-medium transition-colors border bg-surface text-white border-zinc-700 hover:bg-surface-hover"
        >
          Action Plans
        </Link>
        <Link
          href={`/players/${playerId}/subscription`}
          className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-colors border ${
            status !== "Active"
              ? "bg-fire/10 text-fire border-fire/30 hover:bg-fire/20"
              : "bg-surface text-white border-zinc-700 hover:bg-surface-hover"
          }`}
        >
          Manage Subscription
        </Link>
        <Link
          href={`/players/${playerId}/new-session`}
          className="px-5 py-2.5 bg-pace-green text-black rounded-xl text-sm font-bold hover:opacity-90 transition-opacity"
        >
          + New Session
        </Link>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function InfoCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface rounded-2xl p-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-4">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-zinc-400 text-sm flex-shrink-0">{label}</span>
      <span className="text-white text-sm text-right">{value}</span>
    </div>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  const styles: Record<string, string> = {
    "Coach Pro": "border-pace-green text-pace-green",
    "Player Pro": "border-blue-400 text-blue-400",
    Free: "border-zinc-500 text-zinc-500",
  };
  return (
    <span
      className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
        styles[plan] ?? styles["Free"]
      }`}
    >
      {plan}
    </span>
  );
}

function StatusBadge({ status }: { status: PlayerStatus }) {
  const styles: Record<PlayerStatus, string> = {
    Active: "bg-pace-green/20 text-pace-green",
    Expiring: "bg-amber/20 text-amber",
    Expired: "bg-red-500/20 text-red-400",
  };
  return (
    <span
      className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${styles[status]}`}
    >
      {status}
    </span>
  );
}
