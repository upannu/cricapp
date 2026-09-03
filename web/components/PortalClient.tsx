"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import {
  fetchPlayer, fetchSessions, fetchReports, fetchTodaysTip, recordTipView, fetchSessionPacks,
  fetchActivePlans, fetchAcademies, fetchCoach, fetchBookings, fetchActionPlans,
} from "@/lib/db";
import { formatDate, getReportPdfUrl, getInitials } from "@/lib/utils";
import { formatMoney, type Currency } from "@/lib/currency";
import { aiReportsIncludedForPlayer } from "@/lib/plan-features";
import { BadgeStrip } from "@/components/BadgeStrip";
import { InvoiceHistoryList } from "@/components/InvoiceHistoryList";
import type { Player, Session, Report, DailyTip, SessionPack, Plan, Academy, Coach, Booking, ActionPlan } from "@/lib/types";

const PRIORITY_STYLES: Record<string, string> = {
  High: "bg-fire/10 text-fire border-fire/30",
  Medium: "bg-amber/10 text-amber border-amber/30",
  Low: "bg-zinc-700 text-zinc-400 border-zinc-600",
};

const CATEGORY_STYLES: Record<string, string> = {
  Biomechanical: "bg-pace-green/10 text-pace-green border-pace-green/30",
  Technical: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  Physical: "bg-amber/10 text-amber border-amber/30",
  Mental: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  "Data Insight": "bg-fire/10 text-fire border-fire/30",
};

export function PortalClient() {
  const { user } = useAuth();
  const [player, setPlayer] = useState<Player | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [tip, setTip] = useState<DailyTip | null>(null);
  const [packs, setPacks] = useState<SessionPack[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [coach, setCoach] = useState<Coach | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [actionPlans, setActionPlans] = useState<ActionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [consentError, setConsentError] = useState("");

  useEffect(() => {
    if (!user?.playerId) return;
    Promise.all([
      fetchPlayer(user.playerId),
      fetchSessions(undefined, [user.playerId]),
      fetchReports(user.playerId),
      fetchTodaysTip(),
      fetchSessionPacks([user.playerId]),
      fetchActivePlans(),
      fetchAcademies(),
      fetchBookings(undefined, user.playerId),
      fetchActionPlans(user.playerId),
    ]).then(([p, s, r, t, pk, pl, ac, bk, aps]) => {
      setPlayer(p);
      setSessions(s);
      // A report only becomes visible to the player/parent once a coach has completed reviewing it.
      setReports(r.filter((rep) => rep.reviewStatus === "completed"));
      setTip(t);
      setPacks(pk);
      setPlans(pl);
      setAcademies(ac);
      setBookings(bk);
      setActionPlans(aps);
      setLoading(false);
      recordTipView(user.playerId!);
      // Separate from the batch above — we don't know which coach until the player itself loads.
      if (p?.coachId) fetchCoach(p.coachId).then(setCoach);
    });
  }, [user]);

  async function handleConfirmConsent() {
    setConfirming(true);
    setConsentError("");
    try {
      const res = await fetch("/api/confirm-consent", { method: "POST" });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed to confirm consent");
      if (user?.playerId) setPlayer(await fetchPlayer(user.playerId));
    } catch (err) {
      setConsentError((err as { message?: string })?.message ?? String(err));
    } finally {
      setConfirming(false);
    }
  }

  if (loading && user?.playerId) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 rounded-full border-2 border-pace-green border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user?.playerId || !player) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center">
        <p className="text-white font-semibold mb-2">No player linked to this account</p>
        <p className="text-zinc-400 text-sm">Contact your coach or academy admin to get this fixed.</p>
      </div>
    );
  }

  const initials = getInitials(player.name);
  // Any active pack still owing money — Overdue first, so the most urgent one leads. Shown as
  // soon as staff creates the pack (Pending), not just once it lapses into Overdue, so a
  // parent/player can pay proactively instead of only after the fact.
  const unpaidPacks = packs
    .filter((pk) => pk.status === "Active" && pk.paymentStatus !== "Paid")
    .sort((a, b) => (a.paymentStatus === b.paymentStatus ? 0 : a.paymentStatus === "Overdue" ? -1 : 1));

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      {/* Unpaid session pack(s) — not yet locked, just a nudge/way to pay */}
      {!player.loginDisabled && unpaidPacks.map((pk) => (
        <UnpaidPackCard key={pk.id} pack={pk} currency={player.currency} />
      ))}

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-pace-green flex items-center justify-center text-black font-bold text-2xl flex-shrink-0">
          {initials}
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">{player.name}</h1>
          <p className="text-zinc-400 text-sm">{player.bowlingStyle} · {player.ageGroup} · {player.club}</p>
        </div>
        <div className="ml-auto text-right">
          <div className="text-pace-green font-bold text-lg">⚡ {player.xp.toLocaleString()} XP</div>
          <Link href={`/players/${player.id}/subscription`} className="text-xs text-zinc-500 hover:text-pace-green hover:underline transition-colors">
            {player.subscription.plan} plan · Manage
          </Link>
        </div>
      </div>

      <div className="bg-surface rounded-2xl p-5">
        <BadgeStrip player={player} reportCount={reports.length} />
      </div>

      {/* Coach + next session — the two things a parent/player actually opens this page to check */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-surface rounded-2xl p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">Your Coach</p>
          {coach ? (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-pace-green/20 flex items-center justify-center text-pace-green text-sm font-bold flex-shrink-0">
                {getInitials(coach.name)}
              </div>
              <div className="min-w-0">
                <div className="text-white font-semibold text-sm truncate">{coach.name}</div>
                <div className="text-zinc-500 text-xs truncate">{coach.specialization || coach.certificationLevel}</div>
                {coach.email && <a href={`mailto:${coach.email}`} className="text-pace-green text-xs hover:underline">{coach.email}</a>}
                {coach.phone && <div className="text-zinc-500 text-xs">{coach.phone}</div>}
              </div>
            </div>
          ) : (
            <p className="text-zinc-500 text-sm">No coach assigned yet.</p>
          )}
        </div>
        <div className="bg-surface rounded-2xl p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">Next Session</p>
          {(() => {
            const upcoming = bookings
              .filter((b) => b.status !== "Cancelled" && b.date >= new Date().toISOString().split("T")[0])
              .sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)))[0];
            if (!upcoming) return <p className="text-zinc-500 text-sm">No upcoming sessions scheduled.</p>;
            return (
              <div className="text-sm">
                <div className="text-white font-semibold">{upcoming.type}</div>
                <div className="text-zinc-400 text-xs mt-0.5">{formatDate(upcoming.date)} · {upcoming.time}</div>
                {upcoming.location && <div className="text-zinc-500 text-xs mt-0.5">{upcoming.location}</div>}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Daily tip */}
      {tip && (
        <div className="bg-surface rounded-2xl p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Today&apos;s Academy Tip</p>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${CATEGORY_STYLES[tip.category] ?? ""}`}>
              {tip.category}
            </span>
          </div>
          <p className="text-zinc-300 text-sm leading-relaxed">{tip.body}</p>
          <Link href="/portal/learn" className="inline-block mt-3 text-xs font-semibold text-pace-green hover:opacity-80">
            Open the Academy →
          </Link>
        </div>
      )}

      {/* GDPR consent card — under-19 players need a guardian to confirm; 19+ (Senior) players
          confirm for themselves, so the same account role wouldn't be able to act here. */}
      {(() => {
        const isMinor = player.ageGroup !== "Senior";
        const canConfirmHere = (user.role === "parent" && isMinor) || (user.role === "player" && !isMinor);
        if (!canConfirmHere && player.guardianConsentStatus !== "Confirmed") return null;
        if (user.role === "player" && isMinor) return null;
        const cardLabel = isMinor ? "Guardian Consent" : "Player Consent";
        return (
          <div className={`rounded-2xl p-5 border ${
            player.guardianConsentStatus === "Confirmed"
              ? "bg-pace-green/5 border-pace-green/30"
              : "bg-amber/5 border-amber/30"
          }`}>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">{cardLabel}</p>
            {player.guardianConsentStatus === "Confirmed" ? (
              <div>
                <p className="text-pace-green text-sm font-semibold mb-1">✓ Consent confirmed</p>
                <p className="text-zinc-500 text-xs">
                  By {player.guardianConsentConfirmedBy ?? (isMinor ? "guardian" : "player")}
                  {player.guardianConsentConfirmedAt && ` on ${formatDate(player.guardianConsentConfirmedAt)}`}
                  {player.guardianConsentConfirmedEmail && ` (${player.guardianConsentConfirmedEmail})`}
                </p>
              </div>
            ) : canConfirmHere ? (
              <div>
                <p className="text-zinc-300 text-sm mb-3">
                  {isMinor
                    ? <>As {player.name}&apos;s guardian, please confirm you consent to CRIC HQ collecting and analysing their session video and biomechanics data for coaching purposes.</>
                    : <>Please confirm you consent to CRIC HQ collecting and analysing your session video and biomechanics data for coaching purposes.</>}
                </p>
                <button
                  type="button"
                  onClick={handleConfirmConsent}
                  disabled={confirming}
                  className="px-4 py-2.5 text-sm font-bold bg-pace-green text-black rounded-xl hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-60"
                >
                  {confirming ? "Confirming…" : "Confirm Consent"}
                </button>
                {consentError && <p className="text-red-400 text-xs mt-2">{consentError}</p>}
              </div>
            ) : (
              <p className="text-zinc-300 text-sm">Awaiting confirmation from {player.name}&apos;s guardian.</p>
            )}
          </div>
        );
      })()}

      {/* Biomechanics + Academy progress */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-surface rounded-2xl p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">Latest Biomechanics</p>
          <div className="space-y-2 text-sm">
            <Row label="Ball speed" value={`${player.biomechanics.ballSpeedKmh} km/h`} />
            <Row label="Front knee angle" value={`${player.biomechanics.frontKneeAngleDeg}°`} />
            <Row label="Action type" value={player.biomechanics.actionType} />
            <Row label="Injury risk" value={player.biomechanics.injuryRisk} />
            <Row label="Last session" value={formatDate(player.biomechanics.lastSession)} />
          </div>
        </div>
        <div className="bg-surface rounded-2xl p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">Academy Progress</p>
          <div className="space-y-2 text-sm">
            <Row label="Stage" value={player.academy.stage} />
            <Row label="Completion" value={`${player.academy.completionPercent}%`} />
            <Row label="Total sessions" value={String(player.academy.totalSessions)} />
            <Row label="Articles read" value={String(player.academy.articlesRead)} />
            <Row label="Tip streak" value={`🔥 ${player.tipStreakCount} day${player.tipStreakCount === 1 ? "" : "s"}${player.tipBestStreak > player.tipStreakCount ? ` (best ${player.tipBestStreak})` : ""}`} />
          </div>
          <Link href="/portal/learn" className="inline-block mt-3 text-xs font-semibold text-pace-green hover:opacity-80">
            Continue learning →
          </Link>
        </div>
      </div>

      {/* Action Plans — coach-assigned drills/priorities. Never plan-gated: this is coach labor,
          not AI-generated analysis, so blocking it behind a subscription would undermine the
          coaching relationship itself rather than protect anything the app spent compute on. */}
      {actionPlans.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">Action Plans</p>
          <div className="space-y-3">
            {actionPlans.map((ap) => (
              <div key={ap.id} className="bg-surface rounded-2xl p-4">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="text-white font-semibold text-sm">{ap.title}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${PRIORITY_STYLES[ap.priority] ?? ""}`}>
                    {ap.priority}
                  </span>
                  <span className="text-zinc-500 text-xs">{ap.status}</span>
                  {ap.dueDate && <span className="text-zinc-500 text-xs">· Due {formatDate(ap.dueDate)}</span>}
                </div>
                {ap.drills.length > 0 && (
                  <ul className="text-zinc-300 text-sm list-disc list-inside space-y-0.5 mb-1.5">
                    {ap.drills.map((d, i) => <li key={i}>{d}</li>)}
                  </ul>
                )}
                {ap.notes && <p className="text-zinc-500 text-xs">{ap.notes}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent sessions */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">Recent Sessions</p>
        {sessions.length === 0 ? (
          <div className="bg-surface rounded-2xl p-8 text-center text-zinc-500 text-sm">No sessions logged yet.</div>
        ) : (
          <div className="space-y-2">
            {sessions.slice(0, 10).map((s) => (
              <div key={s.id} className="bg-surface rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-white text-sm font-semibold">{s.type}</div>
                  <div className="text-zinc-500 text-xs">{formatDate(s.date)} · {s.videos.length} video{s.videos.length !== 1 ? "s" : ""}</div>
                </div>
                <div className="text-xs text-zinc-500">+{s.xpEarned} XP</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent reports */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">Reports</p>
        {reports.length === 0 ? (
          aiReportsIncludedForPlayer(player, plans, academies, coach ? [coach] : []) ? (
            <div className="bg-surface rounded-2xl p-8 text-center text-zinc-500 text-sm">
              No reports yet — one will appear here after your next session with video.
            </div>
          ) : (
            <div className="bg-surface rounded-2xl p-8 text-center">
              <p className="text-zinc-400 text-sm mb-3">🔒 AI biomechanics reports require Player Pro or higher.</p>
              <Link
                href={`/players/${player.id}/subscription`}
                className="inline-block px-4 py-2 text-xs font-bold bg-pace-green text-black rounded-xl hover:opacity-90 transition-opacity"
              >
                Upgrade to unlock
              </Link>
            </div>
          )
        ) : (
          <div className="space-y-3">
            {reports.slice(0, 10).map((r) => (
              <div key={r.id} className="bg-surface rounded-2xl p-4">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-pace-green/10 text-pace-green">{r.type}</span>
                  <span className="text-zinc-500 text-xs">{formatDate(r.date)}</span>
                  {r.overallScore !== null && r.overallScore !== undefined && (
                    <span className="text-xs font-mono text-white">{r.overallScore}/100</span>
                  )}
                  {r.injuryRisk && (
                    <span className={`px-2 py-0.5 rounded-md text-xs border ${
                      r.injuryRisk === "High" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                      r.injuryRisk === "Moderate" ? "bg-amber/10 text-amber border-amber/20" :
                      "bg-pace-green/10 text-pace-green border-pace-green/20"
                    }`}>
                      {r.injuryRisk} risk
                    </span>
                  )}
                </div>
                <p className="text-zinc-300 text-sm leading-relaxed">{r.summary}</p>
                {r.sessionId && (
                  <a
                    href={getReportPdfUrl(player.id, r.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-2 text-xs font-semibold text-pace-green hover:opacity-80"
                  >
                    Download PDF
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <InvoiceHistoryList scope="player" id={player.id} />
    </div>
  );
}

function UnpaidPackCard({ pack, currency }: { pack: SessionPack; currency: Currency }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const overdue = pack.paymentStatus === "Overdue";
  const total = pack.totalSessions * pack.feePerSession;

  async function handlePay() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/stripe/create-pack-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId: pack.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? "Could not start checkout.");
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError((err as { message?: string })?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`rounded-2xl p-4 flex items-center justify-between gap-4 flex-wrap border ${
      overdue ? "bg-red-500/10 border-red-500/30" : "bg-amber/10 border-amber/30"
    }`}>
      <div>
        <p className={`text-sm font-semibold ${overdue ? "text-red-400" : "text-amber"}`}>
          {overdue
            ? "Your session pack payment is overdue — pay now to avoid losing access to your account."
            : `Payment due for your ${pack.sessionType} pack — ${pack.totalSessions} sessions × ${formatMoney(pack.feePerSession, currency)}.`}
        </p>
        <p className={`text-xs mt-0.5 ${overdue ? "text-red-300" : "text-amber/80"}`}>
          {formatMoney(total, currency)} total · due {formatDate(pack.paymentDueDate)}
        </p>
        {error && <p className={`text-xs mt-1 ${overdue ? "text-red-300" : "text-amber/80"}`}>{error}</p>}
      </div>
      <button type="button" onClick={handlePay} disabled={loading}
        className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors flex-shrink-0 disabled:opacity-60 cursor-pointer border ${
          overdue ? "bg-red-500/20 text-red-300 border-red-500/30 hover:bg-red-500/30" : "bg-amber/20 text-amber border-amber/30 hover:bg-amber/30"
        }`}>
        {loading ? "Loading…" : "Pay Online"}
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-500">{label}</span>
      <span className="text-white font-semibold">{value}</span>
    </div>
  );
}
