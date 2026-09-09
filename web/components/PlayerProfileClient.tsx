"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { fetchPlayer, fetchAcademies, fetchCoaches, fetchReports, fetchSessions, fetchSCWorkouts, fetchActivePlans, updatePlayer } from "@/lib/db";
import { formatDate, getPlayerStatus, getCoachOrAcademyLabel } from "@/lib/utils";
import { sessionsLimitForPlan } from "@/lib/plan-features";
import { PlayerMessages } from "@/components/PlayerMessages";
import { computeInjuryRiskTrend, computeRpeSummary, computeSCLoadSummary, type InjuryRiskTrend, type RpeSummary, type SCLoadSummary } from "@/lib/performance-trends";
import { Sparkline } from "@/components/Sparkline";
import { BadgeStrip } from "@/components/BadgeStrip";
import { InvoiceHistoryList } from "@/components/InvoiceHistoryList";
import { InfoCard, InfoRow } from "@/components/InfoCard";
import { RowActionsMenu } from "@/components/RowActionsMenu";
import { ConfirmModal } from "@/components/ConfirmModal";
import { MessageModal } from "@/components/MessageModal";
import { MessageIcon, RepeatIcon, TrashIcon } from "@/components/icons";
import type { Academy, Coach, Player, PlayerStatus, Plan } from "@/lib/types";

const PLAYER_REMOVED_REASON = "Removed by staff";

const DIRECTION_LABEL: Record<InjuryRiskTrend["direction"], string> = {
  worsening: "↑ Worsening",
  improving: "↓ Improving",
  stable: "→ Stable",
  unknown: "Not enough history yet",
};

export function PlayerProfileClient({ playerId }: { playerId: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const [player, setPlayer] = useState<Player | null>(null);
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [riskTrend, setRiskTrend] = useState<InjuryRiskTrend | null>(null);
  const [rpeSummary, setRpeSummary] = useState<RpeSummary | null>(null);
  const [scLoadSummary, setSCLoadSummary] = useState<SCLoadSummary | null>(null);
  const [reportCount, setReportCount] = useState(0);
  const [lastPayment, setLastPayment] = useState<{ date: string; source: "manual" | "pack" | "stripe" } | null | undefined>(undefined);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [confirmReassign, setConfirmReassign] = useState(false);
  const [reassignToCoachId, setReassignToCoachId] = useState("");
  const [reassigning, setReassigning] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmReinstate, setConfirmReinstate] = useState(false);
  const [reinstating, setReinstating] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    const academyId = user?.role === "academy_admin" ? user.academyId : undefined;
    Promise.all([fetchPlayer(playerId), fetchAcademies(), fetchCoaches(academyId), fetchReports(playerId), fetchSessions(undefined, [playerId]), fetchSCWorkouts(playerId), fetchActivePlans()]).then(([p, a, c, reports, sessions, scWorkouts, pl]) => {
      if (!p) setNotFound(true);
      else setPlayer(p);
      setAcademies(a);
      setCoaches(c);
      setRiskTrend(computeInjuryRiskTrend(reports));
      setRpeSummary(computeRpeSummary(sessions));
      setSCLoadSummary(computeSCLoadSummary(scWorkouts));
      setReportCount(reports.length);
      setPlans(pl);
    });
  }, [playerId, user]); // eslint-disable-line react-hooks/exhaustive-deps

  // The Plan Catalog's own session cap for this player's tier, read live rather than the
  // possibly-stale sub_sessions_limit snapshotted onto the player's own row at creation time
  // (see lib/plan-features.ts) — this is the same source NewSessionForm already uses to actually
  // enforce the cap, so what's displayed here can never drift from what's really being enforced.
  const liveSessionsLimit = player ? sessionsLimitForPlan(player.subscription.plan, plans) : null;

  // Staff-only, same as the field it replaces — pulls whichever of (manually recorded date, a
  // pack's own paid_date, Stripe's payment history) is most recent, so this doesn't just reflect
  // whatever staff last typed in even when a real payment record exists. undefined = still
  // loading, null = nothing found on any source.
  useEffect(() => {
    if (user?.role === "player" || user?.role === "parent") return;
    setLastPayment(undefined);
    fetch(`/api/players/${playerId}/last-payment`)
      .then((res) => res.json())
      .then((data) => setLastPayment(data.lastPaymentDate ? { date: data.lastPaymentDate, source: data.source } : null))
      .catch(() => setLastPayment(null));
  }, [playerId, user]);

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
  const isAcademyPlayer = academies.some((a) => a.playerIds.includes(player.id));
  const initials = player.name
    .split(" ")
    .map((n) => n[0] ?? "")
    .join("");

  // Same eligibility Players' own list page uses for Remove/Reinstate — a coach can only remove
  // players off their own independent roster, an academy_admin/platform_admin always can.
  const ownCoach = user?.role === "coach" ? coaches.find((c) => c.id === user.coachId) : undefined;
  const isIndependentCoach = user?.role === "coach" && !!user.coachId && !ownCoach?.academyId;
  const canAddPlayers = isIndependentCoach || (user?.role === "academy_admin" && !!user.academyId) || user?.role === "platform_admin";

  async function handleConfirmReassign() {
    setReassigning(true);
    try {
      const newCoachId = reassignToCoachId || null;
      await updatePlayer(playerId, { coach_id: newCoachId });
      setPlayer((prev) => (prev ? { ...prev, coachId: newCoachId ?? "" } : prev));
      setConfirmReassign(false);
      setReassignToCoachId("");
    } catch (err) {
      setFormError((err as { message?: string })?.message ?? String(err));
    } finally {
      setReassigning(false);
    }
  }

  async function handleConfirmRemove() {
    setRemoving(true);
    const disabledAt = new Date().toISOString();
    try {
      await updatePlayer(playerId, { login_disabled: true, disabled_at: disabledAt, disabled_reason: PLAYER_REMOVED_REASON });
      setPlayer((prev) => (prev ? { ...prev, loginDisabled: true, disabledAt, disabledReason: PLAYER_REMOVED_REASON } : prev));
      setConfirmRemove(false);
    } catch (err) {
      setFormError((err as { message?: string })?.message ?? String(err));
    } finally {
      setRemoving(false);
    }
  }

  async function handleConfirmReinstate() {
    setReinstating(true);
    try {
      await updatePlayer(playerId, { login_disabled: false, disabled_at: null, disabled_reason: null });
      setPlayer((prev) => (prev ? { ...prev, loginDisabled: false, disabledAt: null, disabledReason: null } : prev));
      setConfirmReinstate(false);
    } catch (err) {
      setFormError((err as { message?: string })?.message ?? String(err));
    } finally {
      setReinstating(false);
    }
  }

  // Action Plans/S&C Log moved in here (out of the visible row) to keep that row down to one line
  // — Edit/View All Reports/Manage Subscription/+New Session stay direct buttons since they're the
  // ones reached most often; these two, Send Message, Reassign Coach, and Remove/Reinstate live
  // behind the ⋮ instead, same idea as Coaches' own profile page keeping just Edit/Payouts visible.
  // View/Edit/Manage Subscription themselves are still deliberately absent from this menu — already
  // dedicated buttons right above it, so repeating them here would just be a second way to do the
  // same thing rather than a new capability.
  const menuItems = player.loginDisabled
    ? (canAddPlayers ? [{
        label: "Reinstate Player", variant: "success" as const,
        onClick: () => { setFormError(""); setConfirmReinstate(true); },
      }] : [])
    : [
        { label: "Action Plans", onClick: () => router.push(`/players/${playerId}/action-plans`) },
        { label: "S&C Log", onClick: () => router.push(`/players/${playerId}/sc-log`) },
        { label: "Send Message", icon: <MessageIcon />, onClick: () => setShowMessageModal(true) },
        // Only makes sense for someone who manages more than one coach — a coach viewing their
        // own single-coach roster has nobody else to pick, same gate the list page uses.
        ...(user?.role !== "coach" ? [{
          label: "Reassign Coach", icon: <RepeatIcon />,
          onClick: () => { setFormError(""); setConfirmReassign(true); setReassignToCoachId(""); },
        }] : []),
        ...(canAddPlayers ? [{
          label: "Remove Player", variant: "danger" as const, dividerBefore: true, icon: <TrashIcon />,
          onClick: () => { setFormError(""); setConfirmRemove(true); },
        }] : []),
      ];

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Back — Edit now lives in the identity card's own action row below, next to the other
          per-player actions, matching Coaches' profile page layout (Edit Coach sits beside View
          Payouts there rather than up in this top bar on its own). */}
      <div className="mb-6">
        <Link
          href="/players"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
        >
          ← Back to Players
        </Link>
      </div>

      {/* Header card + quick actions — merged into one row (avatar/identity on the left, every
          action button on the right) rather than the identity card sitting in its own band below
          a separate, unlabeled button row; wraps beneath the identity block on a narrow viewport
          rather than overflowing, same as every other button/nav row in this app. */}
      <div className="bg-surface rounded-2xl p-6 mb-4 flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-start gap-5">
          <div className="w-20 h-20 rounded-full bg-pace-green flex items-center justify-center text-black font-bold text-2xl flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
              <h1 className="text-2xl font-bold text-white">{player.name}</h1>
              {player.loginDisabled && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/20 text-red-400">Removed</span>
              )}
              {!isAcademyPlayer && (
                <>
                  <PlanBadge plan={player.subscription.plan} />
                  <StatusBadge status={status} />
                </>
              )}
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
            {player.loginDisabled && (
              <p className="text-zinc-500 text-xs mt-1">
                {player.disabledReason || "Removed by staff"}
                {player.disabledAt && ` · ${formatDate(player.disabledAt)}`}
              </p>
            )}
          </div>
        </div>

        {/* bg-ink (not bg-surface, unlike when this row lived directly on the page) — nested
            inside this same-colored card, a bg-surface button would have no visible fill of its
            own, same convention the search input inside the Players filter bar already follows. */}
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/players/${playerId}/edit`}
            className="px-5 py-2.5 text-sm font-semibold text-pace-green border border-pace-green/40 rounded-xl hover:bg-pace-green/10 transition-colors"
          >
            Edit Player
          </Link>
          <Link
            href={`/players/${playerId}/reports`}
            className="px-5 py-2.5 rounded-xl text-sm font-medium transition-colors border bg-ink text-white border-zinc-700 hover:bg-surface-hover"
          >
            View All Reports
          </Link>
          {!isAcademyPlayer && (
            <Link
              href={`/players/${playerId}/subscription`}
              className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-colors border ${
                status !== "Active"
                  ? "bg-fire/10 text-fire border-fire/30 hover:bg-fire/20"
                  : "bg-ink text-white border-zinc-700 hover:bg-surface-hover"
              }`}
            >
              Manage Subscription
            </Link>
          )}
          <Link
            href={`/players/${playerId}/new-session`}
            className="px-5 py-2.5 text-sm font-semibold text-pace-green border border-pace-green/40 rounded-xl hover:bg-pace-green/10 transition-colors"
          >
            + New Session
          </Link>
          {/* Send Message/Reassign Coach/Remove or Reinstate — same actions the list row's own ⋮
              menu offers, minus View/Edit/Manage Subscription (already dedicated buttons on this
              exact page), so staff never has to go back to the list to act on the player they're
              already looking at. Matches Coaches' own profile page treatment. */}
          <RowActionsMenu items={menuItems} />
        </div>
      </div>
      {formError && !confirmReassign && !confirmRemove && !confirmReinstate && (
        <div className="mb-4 px-5 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold">
          {formError}
        </div>
      )}

      {/* 2×2 info grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Subscription — irrelevant for academy players, whose access comes from the academy's own plan */}
        {!isAcademyPlayer && (
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
                liveSessionsLimit
                  ? `${player.subscription.sessionsUsed} / ${liveSessionsLimit}`
                  : `${player.subscription.sessionsUsed} (unlimited)`
              }
            />
          </InfoCard>
        )}

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
          <Link
            href={`/players/${player.id}/academy`}
            className="inline-block mt-1 text-xs font-semibold text-pace-green hover:opacity-80"
          >
            View curriculum →
          </Link>
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
          <InfoRow label="Playing level" value={player.playingLevel} />
          <InfoRow label="Batting hand" value={player.battingHand} />
          <InfoRow
            label="Height / Weight"
            value={
              player.heightCm || player.weightKg
                ? [
                    player.heightCm ? `${player.heightCm} cm` : null,
                    player.weightKg ? `${player.weightKg} kg` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : <span className="text-zinc-600">Not set</span>
            }
          />
          <InfoRow label="Coach" value={getCoachOrAcademyLabel(player, coaches, academies)} />
          <InfoRow
            label={player.ageGroup === "Senior" ? "Player consent" : "Parent consent"}
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
          {user?.role !== "player" && user?.role !== "parent" && (
            <InfoRow
              label="Last payment date"
              value={
                lastPayment === undefined
                  ? <span className="text-zinc-600">Loading…</span>
                  : lastPayment
                    ? <>
                        {formatDate(lastPayment.date)}{" "}
                        <span className="text-zinc-600 text-xs">
                          ({lastPayment.source === "stripe" ? "via Stripe" : lastPayment.source === "pack" ? "pack payment" : "manual"})
                        </span>
                      </>
                    : <span className="text-zinc-600">Not recorded</span>
              }
            />
          )}
        </InfoCard>
      </div>

      {/* Academy players never reach the Subscription page (no personal subscription to manage
          there), but can still independently pay for a one-off booking/pack — this is the only
          place they'd see a record of those payments. */}
      {isAcademyPlayer && <InvoiceHistoryList scope="player" id={playerId} />}

      {/* Performance trends */}
      {(riskTrend?.history.length || rpeSummary?.history.length || scLoadSummary?.history.length) ? (
        <div className="bg-surface rounded-2xl p-5 mb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-4">Performance Trends</p>

          {riskTrend?.alert && (
            <div className="bg-red-500/5 border border-red-500/30 rounded-xl px-4 py-3 mb-4">
              <p className="text-red-400 text-sm font-semibold">⚠ {riskTrend.alertReason}</p>
            </div>
          )}
          {scLoadSummary?.alert && (
            <div className="bg-red-500/5 border border-red-500/30 rounded-xl px-4 py-3 mb-4">
              <p className="text-red-400 text-sm font-semibold">⚠ {scLoadSummary.alertReason}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
            {scLoadSummary && scLoadSummary.history.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-zinc-400">S&C Weekly Load</span>
                  <span className="text-xs font-mono text-white">{scLoadSummary.currentWeekLoad.toLocaleString()} AU</span>
                </div>
                <Sparkline
                  values={scLoadSummary.history.map((h) => h.totalLoad)}
                  color={scLoadSummary.alert ? "#FF4D4D" : "#00D4AA"}
                />
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

      {showMessageModal && (
        <MessageModal
          playerId={player.id}
          playerName={player.name}
          playerEmail={player.email}
          playerPhone={player.phone}
          onClose={() => setShowMessageModal(false)}
        />
      )}

      {confirmReassign && (
        <ConfirmModal
          icon={<RepeatIcon width={22} height={22} className="text-blue-400" />}
          iconBg="bg-blue-500/20"
          title="Reassign Coach?"
          message={`"${player.name}" will move to whoever you pick below.`}
          confirmLabel="Reassign"
          confirmBusyLabel="Reassigning…"
          loading={reassigning}
          error={formError}
          onConfirm={handleConfirmReassign}
          onCancel={() => { setConfirmReassign(false); setFormError(""); }}
        >
          <select
            value={reassignToCoachId}
            onChange={(e) => setReassignToCoachId(e.target.value)}
            className="w-full bg-ink text-white text-sm rounded-xl px-3 py-2.5 border border-zinc-700 focus:border-pace-green focus:outline-none cursor-pointer"
            aria-label="New coach"
          >
            <option value="">— No Coach Assigned —</option>
            {coaches.filter((c) => c.id !== player.coachId).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </ConfirmModal>
      )}

      {confirmRemove && (
        <ConfirmModal
          icon={<TrashIcon width={22} height={22} className="text-red-400" />}
          iconBg="bg-red-500/20"
          title="Remove Player?"
          message={`"${player.name}" will be locked out and hidden from the roster's active use — their history and data are all preserved, and this can be undone any time with Reinstate.`}
          confirmLabel="Yes, Remove"
          confirmBusyLabel="Removing…"
          confirmVariant="danger"
          loading={removing}
          error={formError}
          onConfirm={handleConfirmRemove}
          onCancel={() => { setConfirmRemove(false); setFormError(""); }}
        />
      )}

      {confirmReinstate && (
        <ConfirmModal
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          }
          iconBg="bg-pace-green/20"
          title="Reinstate Player?"
          message={`Restores "${player.name}"'s login and brings them back into normal view — nothing else about their profile changes.`}
          confirmLabel="Yes, Reinstate"
          confirmBusyLabel="Reinstating…"
          loading={reinstating}
          error={formError}
          onConfirm={handleConfirmReinstate}
          onCancel={() => { setConfirmReinstate(false); setFormError(""); }}
        />
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

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
