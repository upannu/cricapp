"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  fetchSessionPack, fetchPlayer, fetchAcademies, fetchCoaches, fetchActivePlans,
  fetchGroupSessions, fetchBookings, fetchPackActivity, setGroupSessionRoster,
  updatePackAgreedDays, upsertSessionPack,
} from "@/lib/db";
import { formatDate, getCoachOrAcademyLabel, getPlatformFeePercent, isPackCreditExpired } from "@/lib/utils";
import { DEFAULT_CURRENCY, formatMoney } from "@/lib/currency";
import { DAY_TOKENS } from "@/lib/cron-time";
import type {
  SessionPack, Player, Academy, Coach, Plan, GroupSession, Booking, PackActivityEntry,
  BookingType, AttendanceRecordedBy,
} from "@/lib/types";

const TYPE_STYLES: Record<BookingType, string> = {
  "Net Session":            "bg-pace-green/15 text-pace-green",
  "Individual Coaching":    "bg-blue-500/15 text-blue-400",
  "Video Review":           "bg-purple-500/15 text-purple-400",
  "Fitness Assessment":     "bg-fire/15 text-fire",
  "Match Practice":         "bg-amber/15 text-amber",
  "Warm-up / Conditioning": "bg-white/10 text-hp-paper/70",
};

const RECORDED_BY_LABEL: Record<AttendanceRecordedBy | "unknown", string> = {
  manual: "Marked by coach",
  "csv-import": "CSV import",
  "auto-cron": "Auto (no-show)",
  unknown: "Unattributed",
};

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("");
}

const today = new Date().toISOString().split("T")[0];
const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

/** The Memberships list's per-player card, extracted onto its own route — step 2 of the
 * Memberships redesign (view page first, then edit, then the list itself converts to a table
 * and links out here instead of rendering all of this inline for every row). Fetches
 * independently rather than sharing SessionPacksClient's state, same as PlayerProfileClient does
 * relative to PlayersClient. */
export function MembershipProfileClient({ packId }: { packId: string }) {
  const [pack, setPack] = useState<SessionPack | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [groupSessions, setGroupSessions] = useState<GroupSession[]>([]);
  const [upcoming, setUpcoming] = useState<Booking[]>([]);
  const [packActivity, setPackActivity] = useState<PackActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFoundState, setNotFoundState] = useState(false);
  const [editingSquadSessions, setEditingSquadSessions] = useState(false);

  useEffect(() => {
    fetchSessionPack(packId).then(async (pk) => {
      if (!pk) { setNotFoundState(true); setLoading(false); return; }
      setPack(pk);
      const [p, ac, co, pl, gs, bk, act] = await Promise.all([
        fetchPlayer(pk.playerId), fetchAcademies(), fetchCoaches(), fetchActivePlans(),
        fetchGroupSessions(pk.academyId), fetchBookings(undefined, pk.playerId), fetchPackActivity([pk.id]),
      ]);
      setPlayer(p);
      setAcademies(ac);
      setCoaches(co);
      setPlans(pl);
      setGroupSessions(gs);
      setUpcoming(bk.filter((b) => b.date >= today && b.status !== "Cancelled").sort((a, b) => a.date.localeCompare(b.date)));
      setPackActivity(act);
      setLoading(false);
    });
  }, [packId]);

  function academyWaivesFees(academyId: string): boolean {
    const academy = academies.find((a) => a.id === academyId);
    const plan = academy?.planId ? plans.find((p) => p.id === academy.planId) : undefined;
    return !!plan?.waivesSessionFees;
  }

  async function handleToggleGroupSession(gs: GroupSession) {
    if (!pack || !player) return;
    const onRoster = gs.playerIds.includes(player.id);
    const updatedRoster = onRoster ? gs.playerIds.filter((id) => id !== player.id) : [...gs.playerIds, player.id];
    await setGroupSessionRoster(gs.id, updatedRoster);
    const updatedGroupSessions = groupSessions.map((g) => (g.id === gs.id ? { ...g, playerIds: updatedRoster } : g));
    setGroupSessions(updatedGroupSessions);

    const stillRostered = updatedGroupSessions.filter((g) => g.active && g.sessionType === "Net Session" && g.playerIds.includes(player.id));
    const agreedDays = Array.from(new Set(stillRostered.map((g) => DAY_TOKENS[g.dayOfWeek])));
    await updatePackAgreedDays(pack.id, agreedDays);
    setPack((prev) => (prev ? { ...prev, agreedDays } : prev));
  }

  async function handleCredit() {
    if (!pack) return;
    const updated = { ...pack, sessionCredits: pack.sessionCredits + 1 };
    setPack(updated);
    await upsertSessionPack({
      id: updated.id, player_id: updated.playerId, academy_id: updated.academyId,
      session_type: updated.sessionType, purchase_date: updated.purchaseDate,
      total_sessions: updated.totalSessions, sessions_used: updated.sessionsUsed,
      session_credits: updated.sessionCredits, fee_per_session: updated.feePerSession,
      status: updated.status, payment_status: updated.paymentStatus,
      payment_due_date: updated.paymentDueDate,
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 rounded-full border-2 border-pace-green border-t-transparent animate-spin" />
      </div>
    );
  }

  if (notFoundState || !pack || !player) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <p className="text-hp-paper font-semibold mb-2">Membership not found</p>
        <Link href="/session-packs" className="text-pace-green text-sm font-semibold hover:underline">← Back to Memberships</Link>
      </div>
    );
  }

  const academy = academies.find((a) => a.id === pack.academyId);
  const remaining = (isPackCreditExpired(pack) ? 0 : pack.sessionCredits) + pack.totalSessions - pack.sessionsUsed;
  const pct = Math.max(0, Math.min(100, (pack.sessionsUsed / pack.totalSessions) * 100));
  const relevantGroupSessions = groupSessions.filter((g) => g.active && g.sessionType === "Net Session");
  const enrolledSessions = relevantGroupSessions.filter((g) => g.playerIds.includes(player.id));
  const hasBookingOn = (g: GroupSession) => upcoming.some((b) => {
    const d = new Date(b.date);
    return d.toLocaleDateString("en-GB", { weekday: "short" }) === DAY_TOKENS[g.dayOfWeek];
  });

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <Link href="/session-packs" className="text-xs text-hp-paper/45 hover:text-hp-paper transition-colors mb-4 inline-block">
        ← Back to Memberships
      </Link>

      <div className="bg-hp-surface p-6 border border-transparent">
        {/* Player header */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-hp-cg/15 flex items-center justify-center text-hp-cg text-sm font-bold flex-shrink-0">
              {initials(player.name)}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <span className="font-display font-black uppercase text-hp-paper text-lg tracking-wide">{player.name}</span>
                <span className="text-hp-paper/45 text-xs">·</span>
                <span className="text-hp-paper/45 text-xs">{player.ageGroup} · {getCoachOrAcademyLabel(player, coaches, academies)}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  pack.status === "Active" ? "bg-pace-green/20 text-pace-green" : "bg-white/10 text-hp-paper/45"
                }`}>
                  {pack.status}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${TYPE_STYLES[pack.sessionType]}`}>
                  {pack.sessionType}
                </span>
                {pack.paymentStatus !== "Paid" && (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${
                    pack.paymentStatus === "Overdue"
                      ? "bg-red-500/15 text-red-400 border-red-500/30"
                      : "bg-amber/15 text-amber border-amber/30"
                  }`}>
                    Fee {pack.paymentStatus}
                  </span>
                )}
                <span className="text-hp-paper/45 text-xs">Purchased {formatDate(pack.purchaseDate)}</span>
                {pack.paidDate && <span className="text-pace-green text-xs">· Paid {formatDate(pack.paidDate)}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link href={`/session-packs/${pack.id}/edit`}
              className="px-3 py-1.5 text-xs font-semibold text-hp-paper/70 border border-white/15 hover:border-white/30 hover:text-hp-paper transition-colors">
              Edit
            </Link>
            <Link href={`/players/${player.id}`}
              className="px-3 py-1.5 text-xs font-semibold text-hp-paper/70 border border-white/15 hover:border-hp-cg hover:text-hp-cg transition-colors">
              View Profile
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Sessions breakdown */}
          <div className="lg:col-span-2">
            <div className="mb-3">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-hp-paper/45">Sessions used</span>
                <span className="text-hp-paper font-semibold">{pack.sessionsUsed} / {pack.totalSessions}</span>
              </div>
              <div className="h-2 bg-hp-ink rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    remaining === 0 ? "bg-white/15" : pct >= 80 ? "bg-amber" : "bg-pace-green"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {pack.agreedDays.length > 0 && (
                <p className="text-xs text-hp-paper/45 mt-1.5">
                  ≈{Math.ceil(pack.totalSessions / pack.agreedDays.length)} weeks at {pack.agreedDays.length} day{pack.agreedDays.length > 1 ? "s" : ""}/week
                </p>
              )}
            </div>

            <div className="grid grid-cols-4 gap-3 mb-4">
              <PackStat label="Paid" value={String(pack.totalSessions)} sub="sessions" color="text-hp-paper" />
              <PackStat label="Used" value={String(pack.sessionsUsed)} sub="sessions" color="text-hp-paper/70" />
              <PackStat label="Credits" value={String(pack.sessionCredits)} sub="returned" color={pack.sessionCredits > 0 ? "text-blue-400" : "text-hp-paper/35"} />
              <PackStat label="Remaining" value={String(remaining)} sub="available" color={remaining === 0 ? "text-red-400" : remaining <= 2 ? "text-amber" : "text-pace-green"} />
            </div>

            {pack.feePerSession === 0 && academyWaivesFees(pack.academyId) ? (
              <div className="bg-hp-ink p-4 mb-4">
                <p className="text-sm text-pace-green font-semibold">✓ Covered by the academy&apos;s plan — no session fee</p>
              </div>
            ) : (
              <div className="bg-hp-ink p-4 grid grid-cols-3 gap-3 text-center mb-4">
                <div>
                  <div className="text-sm font-bold text-hp-paper">{formatMoney(pack.feePerSession, academy?.currency ?? DEFAULT_CURRENCY)}/session</div>
                  <div className="text-xs text-hp-paper/45 mt-0.5">Session rate</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-amber">{formatMoney(pack.feePerSession * (getPlatformFeePercent(pack.academyId, academies, plans) / 100), academy?.currency ?? DEFAULT_CURRENCY)}/session</div>
                  <div className="text-xs text-hp-paper/45 mt-0.5">Platform ({getPlatformFeePercent(pack.academyId, academies, plans)}%)</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-pace-green">{formatMoney(pack.feePerSession * pack.totalSessions * (1 - getPlatformFeePercent(pack.academyId, academies, plans) / 100), academy?.currency ?? DEFAULT_CURRENCY)} total</div>
                  <div className="text-xs text-hp-paper/45 mt-0.5">Academy receives</div>
                </div>
              </div>
            )}

            {pack.status === "Active" && (
              <CreditButton remaining={remaining} expired={isPackCreditExpired(pack)} onCredit={handleCredit} />
            )}
          </div>

          {/* Agreed sessions + squad training sessions */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-hp-paper/45 mb-3">
              Agreed sessions ({upcoming.length})
            </p>

            {/* Read-only by default — see SessionPacksClient's groupSessionsForAcademy doc comment
                for why a bare checkbox here is a footgun. */}
            <div className="bg-hp-ink px-4 py-3 mb-3">
              <div className="flex items-center justify-between mb-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-hp-paper/45">Squad training sessions</p>
                {relevantGroupSessions.length > 0 && (
                  <button type="button" onClick={() => setEditingSquadSessions((v) => !v)}
                    className="text-[10px] font-semibold text-pace-green hover:opacity-80 transition-opacity cursor-pointer">
                    {editingSquadSessions ? "Done" : "Edit"}
                  </button>
                )}
              </div>
              {relevantGroupSessions.length === 0 ? (
                <p className="text-xs text-hp-paper/35">No active squad training sessions at this academy yet.</p>
              ) : editingSquadSessions ? (
                <div className="space-y-1.5">
                  {relevantGroupSessions.map((g) => {
                    const checked = g.playerIds.includes(player.id);
                    return (
                      <label key={g.id} className={`flex items-center gap-2.5 px-2.5 py-1.5 cursor-pointer transition-colors ${
                        checked ? "bg-pace-green/10" : "hover:bg-hp-surface"
                      }`}>
                        <input type="checkbox" checked={checked} onChange={() => handleToggleGroupSession(g)} className="accent-hp-cg" />
                        <span className={`text-xs font-semibold flex-1 truncate ${checked ? "text-pace-green" : "text-hp-paper/70"}`}>{g.name}</span>
                        <span className="text-[10px] text-hp-paper/45 flex-shrink-0">{DAY_TOKENS[g.dayOfWeek]} {g.time}</span>
                        {hasBookingOn(g) && <span className="w-1.5 h-1.5 rounded-full bg-pace-green flex-shrink-0" />}
                      </label>
                    );
                  })}
                </div>
              ) : enrolledSessions.length === 0 ? (
                <p className="text-xs text-hp-paper/35">Not enrolled in any squad training session yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {enrolledSessions.map((g) => (
                    <div key={g.id} className="flex items-center gap-2.5 px-2.5 py-1.5 bg-pace-green/10">
                      <span className="text-pace-green text-xs flex-shrink-0">✓</span>
                      <span className="text-xs font-semibold flex-1 truncate text-pace-green">{g.name}</span>
                      <span className="text-[10px] text-hp-paper/45 flex-shrink-0">{DAY_TOKENS[g.dayOfWeek]} {g.time}</span>
                      {hasBookingOn(g) && <span className="w-1.5 h-1.5 rounded-full bg-pace-green flex-shrink-0" />}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {upcoming.length === 0 ? (
              <div className="bg-hp-ink p-4 text-center">
                <p className="text-hp-paper/45 text-xs mb-2">No upcoming sessions booked</p>
                <Link href="/bookings" className="text-xs text-pace-green font-semibold hover:underline">
                  + Schedule session
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {upcoming.slice(0, 5).map((b) => {
                  const isToday = b.date === today;
                  const isTomorrow = b.date === tomorrow;
                  const weekday = new Date(b.date).toLocaleDateString("en-GB", { weekday: "short" });
                  const label = isToday ? "Today" : isTomorrow ? "Tomorrow" : formatDate(b.date);
                  return (
                    <div key={b.id} className="bg-hp-ink px-4 py-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-hp-paper/45 text-[10px] font-bold uppercase w-7">{weekday}</span>
                          <span className={`text-xs font-bold ${isToday ? "text-amber" : "text-hp-paper"}`}>{label}</span>
                          <span className="text-hp-paper/35 text-xs">·</span>
                          <span className="text-hp-paper/45 text-xs">{b.time}</span>
                        </div>
                        <span className="text-hp-paper/45 text-xs">{b.type}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        b.status === "Confirmed" ? "bg-pace-green/15 text-pace-green" : "bg-amber/15 text-amber"
                      }`}>
                        {b.status}
                      </span>
                    </div>
                  );
                })}
                {upcoming.length > 5 && (
                  <p className="text-xs text-hp-paper/45 text-center pt-1">+{upcoming.length - 5} more</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Membership Activity */}
        <div className="mt-4 pt-4 border-t border-white/8">
          <p className="text-xs font-semibold uppercase tracking-wider text-hp-paper/45 mb-3">Membership Activity</p>
          {packActivity.length === 0 ? (
            <p className="text-hp-paper/35 text-xs">No sessions drawn from this membership yet.</p>
          ) : (
            <div className="space-y-1.5">
              {packActivity.slice(0, 5).map((a) => (
                <div key={a.id} className="flex items-center justify-between text-xs bg-hp-ink px-3 py-2">
                  <span className="text-hp-paper/70">{formatDate(a.date)} · {a.status}</span>
                  <span className="text-hp-paper/45">{RECORDED_BY_LABEL[a.recordedBy ?? "unknown"]}</span>
                </div>
              ))}
              {packActivity.length > 5 && (
                <p className="text-xs text-hp-paper/45 text-center pt-1">+{packActivity.length - 5} more</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PackStat({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="bg-hp-ink p-3 text-center">
      <div className={`text-xl font-bold font-mono mb-0.5 ${color}`}>{value}</div>
      <div className="text-[10px] text-hp-paper/45 font-semibold uppercase tracking-wide leading-tight">{label}</div>
      <div className="text-[10px] text-hp-paper/35">{sub}</div>
    </div>
  );
}

function CreditButton({ remaining, expired, onCredit }: { remaining: number; expired: boolean; onCredit: () => void }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [done, setDone] = useState(false);

  if (remaining === 0) return null;
  if (expired) {
    return (
      <p className="text-xs text-hp-paper/45">
        This membership&apos;s agreed weekly window has passed — credits can no longer be issued.
      </p>
    );
  }

  function confirm() {
    onCredit();
    setDone(true);
    setShowConfirm(false);
    setTimeout(() => setDone(false), 3000);
  }

  if (done) {
    return (
      <div className="flex items-center gap-2 text-blue-400 text-xs font-semibold">
        <span>✓</span>
        <span>Session credited — player can use it for a future booking</span>
      </div>
    );
  }

  if (showConfirm) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-hp-paper/70 text-xs">Credit 1 session back to this player&apos;s membership?</span>
        <button type="button" onClick={confirm}
          className="px-3 py-1.5 text-xs font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 cursor-pointer transition-colors">
          Yes, credit it
        </button>
        <button type="button" onClick={() => setShowConfirm(false)}
          className="text-xs text-hp-paper/45 hover:text-hp-paper cursor-pointer">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button type="button" onClick={() => setShowConfirm(true)}
      className="px-4 py-2 text-xs font-semibold text-blue-400 border border-blue-500/30 hover:bg-blue-500/10 transition-colors cursor-pointer">
      Credit a Session (player no-show / cancellation)
    </button>
  );
}
