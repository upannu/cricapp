"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { fetchPlayer, fetchSessions, fetchReports } from "@/lib/db";
import { formatDate, getReportPdfUrl, getInitials } from "@/lib/utils";
import type { Player, Session, Report } from "@/lib/types";

export function PortalClient() {
  const { user } = useAuth();
  const [player, setPlayer] = useState<Player | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [consentError, setConsentError] = useState("");

  useEffect(() => {
    if (!user?.playerId) return;
    Promise.all([
      fetchPlayer(user.playerId),
      fetchSessions(undefined, [user.playerId]),
      fetchReports(user.playerId),
    ]).then(([p, s, r]) => {
      setPlayer(p);
      setSessions(s);
      setReports(r);
      setLoading(false);
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

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
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
          <div className="text-xs text-zinc-500">{player.subscription.plan}</div>
        </div>
      </div>

      {/* GDPR consent card — parent role only */}
      {user.role === "parent" && (
        <div className={`rounded-2xl p-5 border ${
          player.guardianConsentStatus === "Confirmed"
            ? "bg-pace-green/5 border-pace-green/30"
            : "bg-amber/5 border-amber/30"
        }`}>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Guardian Consent</p>
          {player.guardianConsentStatus === "Confirmed" ? (
            <div>
              <p className="text-pace-green text-sm font-semibold mb-1">✓ Consent confirmed</p>
              <p className="text-zinc-500 text-xs">
                By {player.guardianConsentConfirmedBy ?? "guardian"}
                {player.guardianConsentConfirmedAt && ` on ${formatDate(player.guardianConsentConfirmedAt)}`}
                {player.guardianConsentConfirmedEmail && ` (${player.guardianConsentConfirmedEmail})`}
              </p>
            </div>
          ) : (
            <div>
              <p className="text-zinc-300 text-sm mb-3">
                As {player.name}&apos;s guardian, please confirm you consent to PACE HQ collecting and analysing
                their session video and biomechanics data for coaching purposes.
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
          )}
        </div>
      )}

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
          </div>
        </div>
      </div>

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
          <div className="bg-surface rounded-2xl p-8 text-center text-zinc-500 text-sm">No reports yet.</div>
        ) : (
          <div className="space-y-3">
            {reports.slice(0, 10).map((r) => (
              <div key={r.id} className="bg-surface rounded-2xl p-4">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-pace-green/10 text-pace-green">{r.type}</span>
                  <span className="text-zinc-500 text-xs">{formatDate(r.date)}</span>
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
