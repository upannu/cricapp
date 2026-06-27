import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlayerById } from "@/lib/mock-data";
import { formatDate, getPlayerStatus } from "@/lib/utils";
import type { PlayerStatus } from "@/lib/types";

export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const player = getPlayerById(id);
  if (!player) notFound();

  const status = getPlayerStatus(player.subscription.endDate);
  const initials = player.name
    .split(" ")
    .map((n) => n[0] ?? "")
    .join("");

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Back */}
      <Link
        href="/players"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white mb-6 transition-colors"
      >
        ← Back to Players
      </Link>

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
          {/* Progress bar */}
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
          <InfoRow label="Age group" value={player.ageGroup} />
          <InfoRow label="Club" value={player.club} />
          <InfoRow label="Coach" value={player.coachAssigned} />
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

      {/* Footer actions */}
      <div className="flex flex-wrap gap-3">
        <ActionButton label="View All Reports" />
        <ActionButton label="Action Plans" />
        <ActionButton
          label="Manage Subscription"
          highlight={status !== "Active"}
        />
        <button
          type="button"
          className="px-5 py-2.5 bg-pace-green text-black rounded-xl text-sm font-bold hover:opacity-90 transition-opacity cursor-pointer"
        >
          + New Session
        </button>
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

function ActionButton({
  label,
  highlight,
}: {
  label: string;
  highlight?: boolean;
}) {
  return (
    <button
      type="button"
      className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-colors border cursor-pointer ${
        highlight
          ? "bg-fire/10 text-fire border-fire/30 hover:bg-fire/20"
          : "bg-surface text-white border-zinc-700 hover:bg-surface-hover"
      }`}
    >
      {label}
    </button>
  );
}
