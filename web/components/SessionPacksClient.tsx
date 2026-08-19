"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import type { SessionPack, BookingType, Player, Coach, Academy, Booking, PaymentStatus, Plan } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { fetchSessionPacks, fetchPlayers, fetchAcademies, fetchCoaches, fetchBookings, fetchActivePlans, upsertSessionPack, updatePackPaymentStatus, updatePackAgreedDays } from "@/lib/db";
import { formatDate, getCoachOrAcademyLabel, getPlatformFeePercent, isPackCreditExpired } from "@/lib/utils";
import { DateInput } from "@/components/DateInput";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const TYPE_STYLES: Record<BookingType, string> = {
  "Net Session":            "bg-pace-green/15 text-pace-green",
  "Individual Coaching":    "bg-blue-500/15 text-blue-400",
  "Video Review":           "bg-purple-500/15 text-purple-400",
  "Fitness Assessment":     "bg-fire/15 text-fire",
  "Match Practice":         "bg-amber/15 text-amber",
  "Warm-up / Conditioning": "bg-zinc-700 text-zinc-300",
};

let _packPlayers: Player[] = [];
let _packAcademies: Academy[] = [];
let _packCoaches: Coach[] = [];
let _packBookings: Booking[] = [];
let _packPlans: Plan[] = [];

function academyWaivesFees(academyId: string): boolean {
  const academy = _packAcademies.find((a) => a.id === academyId);
  const plan = academy?.planId ? _packPlans.find((p) => p.id === academy.planId) : undefined;
  return !!plan?.waivesSessionFees;
}

function feeForAcademyAndType(academyId: string, type: BookingType, playerId?: string): number {
  const academy = _packAcademies.find((a) => a.id === academyId);
  if (!academy) return 0;
  if (academyWaivesFees(academyId)) return 0;
  // Age-group fee → session-type fee → academy default
  const player = playerId ? _packPlayers.find((p) => p.id === playerId) : undefined;
  const ageFee = player ? (academy.ageFees[player.ageGroup] ?? 0) : 0;
  if (ageFee > 0) return ageFee;
  return academy.sessionTypeFees[type] ?? academy.sessionFeeAud ?? 0;
}

const today = new Date().toISOString().split("T")[0];

function playerById(id: string) { return _packPlayers.find((p) => p.id === id); }
function academyById(id: string) { return _packAcademies.find((a) => a.id === id); }

function upcomingBookings(playerId: string) {
  return _packBookings
    .filter((b) => b.playerId === playerId && b.date >= today && b.status !== "Cancelled")
    .sort((a, b) => a.date.localeCompare(b.date));
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("");
}

type DraftPack = Omit<SessionPack, "id" | "status" | "sessionsUsed" | "sessionCredits">;

const EMPTY_DRAFT: DraftPack = {
  playerId: "",
  academyId: "",
  sessionType: "Net Session",
  purchaseDate: today,
  totalSessions: 10,
  feePerSession: 0,
  paymentStatus: "Pending",
  paymentDueDate: new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
  agreedDays: [],
};

type FilterType = "All" | "Active" | "Exhausted" | "No Pack";
type PageTab = "Packs" | "Fees Due";

export function SessionPacksClient() {
  const { user } = useAuth();
  const formRef = useRef<HTMLDivElement>(null);

  const [packs, setPacks] = useState<SessionPack[]>([]);
  const [pageTab, setPageTab] = useState<PageTab>("Packs");
  const [filter, setFilter] = useState<FilterType>("All");
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<DraftPack>(EMPTY_DRAFT);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    const coachId = user?.role === "coach" ? user.coachId : undefined;
    const academyId = user?.role === "academy_admin" ? user.academyId : undefined;
    Promise.all([
      fetchPlayers(coachId, academyId),
      fetchAcademies(),
      fetchCoaches(academyId),
      fetchActivePlans(),
    ]).then(([pl, ac, co, plans]) => {
      _packPlayers = pl; _packAcademies = ac; _packCoaches = co; _packPlans = plans;
      const scopedPlayerIds = (coachId || academyId) ? pl.map((p) => p.id) : undefined;
      return Promise.all([fetchSessionPacks(scopedPlayerIds), fetchBookings(undefined, undefined, scopedPlayerIds)]);
    }).then(([pk, bk]) => {
      setPacks(pk); _packBookings = bk;
    });
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  function resolvedPaymentStatus(pk: SessionPack): PaymentStatus {
    return pk.paymentStatus;
  }

  function handleMarkPaid(packId: string) {
    updatePackPaymentStatus(packId, "Paid");
    setPacks((prev) => prev.map((pk) => pk.id === packId ? { ...pk, paymentStatus: "Paid" } : pk));
  }

  function handleReactivate(playerId: string) {
    // _packPlayers is a module-level cache, not React state — mutate it in place, then force a
    // re-render by touching `packs` so the scopedPlayers memo (keyed on [packs]) re-reads it.
    _packPlayers = _packPlayers.map((p) => p.id === playerId ? { ...p, loginDisabled: false, disabledAt: null, disabledReason: null } : p);
    setPacks((prev) => [...prev]);
  }

  function handleToggleDay(pack: SessionPack, day: string) {
    const updated = pack.agreedDays.includes(day)
      ? pack.agreedDays.filter((d) => d !== day)
      : [...pack.agreedDays, day];
    updatePackAgreedDays(pack.id, updated);
    setPacks((prev) => prev.map((pk) => pk.id === pack.id ? { ...pk, agreedDays: updated } : pk));
  }

  const scopedPlayers = useMemo(() => _packPlayers, [packs]);
  const scopedPacks = packs;

  function sessionsRemaining(pk: SessionPack) {
    const usableCredits = isPackCreditExpired(pk) ? 0 : pk.sessionCredits;
    return pk.totalSessions - pk.sessionsUsed + usableCredits;
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  const activePacks  = scopedPacks.filter((pk) => pk.status === "Active");
  const totalSold    = scopedPacks.reduce((s, pk) => s + pk.totalSessions, 0);
  const totalRemain  = scopedPacks.filter((pk) => pk.status === "Active").reduce((s, pk) => s + sessionsRemaining(pk), 0);
  const grossRevenue = scopedPacks.reduce((s, pk) => s + pk.totalSessions * pk.feePerSession, 0);

  // ── Fees Due ──────────────────────────────────────────────────────────────
  const feesDuePacks = scopedPacks.filter((pk) => {
    const ps = resolvedPaymentStatus(pk);
    return ps === "Pending" || ps === "Overdue";
  });
  const totalOutstanding = feesDuePacks.reduce((s, pk) => s + pk.totalSessions * pk.feePerSession, 0);
  const overduePacks = feesDuePacks.filter((pk) => resolvedPaymentStatus(pk) === "Overdue");

  // ── Filtered view ─────────────────────────────────────────────────────────
  const playersWithPack = new Set(scopedPacks.map((pk) => pk.playerId));

  const filteredPlayers = useMemo(() => {
    return scopedPlayers.filter((p) => {
      const pack = scopedPacks.find((pk) => pk.playerId === p.id);
      if (filter === "Active")   return pack?.status === "Active";
      if (filter === "Exhausted") return pack?.status === "Exhausted";
      if (filter === "No Pack")  return !pack;
      return true;
    });
  }, [filter, scopedPlayers, scopedPacks]);

  // ── Form helpers ──────────────────────────────────────────────────────────
  function openAdd() {
    const defaultAcademy = user?.role === "academy_admin" ? (user.academyId ?? "") : "";
    const fee = defaultAcademy ? feeForAcademyAndType(defaultAcademy, "Net Session") : 0;
    setDraft({ ...EMPTY_DRAFT, purchaseDate: today, academyId: defaultAcademy, sessionType: "Net Session", feePerSession: fee });
    setFormError("");
    setShowForm(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function handleAcademyChange(academyId: string) {
    const fee = feeForAcademyAndType(academyId, draft.sessionType, draft.playerId);
    setDraft({ ...draft, academyId, feePerSession: fee });
  }

  function handleToggleDraftDay(day: string) {
    const agreedDays = draft.agreedDays.includes(day)
      ? draft.agreedDays.filter((d) => d !== day)
      : [...draft.agreedDays, day];
    setDraft({ ...draft, agreedDays });
  }

  function handlePlayerChange(playerId: string) {
    const fee = draft.academyId ? feeForAcademyAndType(draft.academyId, draft.sessionType, playerId) : 0;
    // Default the pack's payout coach to the player's own assigned coach — only meaningful once
    // the academy is in split-payout mode, but harmless (and useful) to populate regardless.
    const player = playerById(playerId);
    setDraft({ ...draft, playerId, feePerSession: fee || draft.feePerSession, coachId: player?.coachId ?? draft.coachId });
  }

  function handleSave() {
    if (!draft.playerId) { setFormError("Please select a player."); return; }
    if (!draft.academyId) { setFormError("Please select an academy."); return; }
    if (draft.feePerSession <= 0 && !academyWaivesFees(draft.academyId)) {
      setFormError("Session fee must be greater than $0.");
      return;
    }
    if (draft.agreedDays.length === 0) {
      setFormError("Please select at least one session day.");
      return;
    }
    setFormError("");

    // A fee-waived pack has nothing to pay — mark it settled immediately rather than leaving it
    // sitting as "Pending" forever, which would otherwise show a misleading payment-due badge.
    const waived = academyWaivesFees(draft.academyId);
    const paymentStatus: PaymentStatus = waived ? "Paid" : "Pending";
    const newPack: SessionPack = {
      id: `sp_${Date.now()}`,
      playerId: draft.playerId,
      academyId: draft.academyId,
      coachId: draft.coachId,
      sessionType: draft.sessionType,
      purchaseDate: draft.purchaseDate,
      totalSessions: draft.totalSessions,
      sessionsUsed: 0,
      sessionCredits: 0,
      feePerSession: draft.feePerSession,
      status: "Active",
      paymentStatus,
      paymentDueDate: new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
      agreedDays: draft.agreedDays,
    };

    upsertSessionPack({
      id: newPack.id, player_id: newPack.playerId, academy_id: newPack.academyId,
      coach_id: newPack.coachId ?? null,
      session_type: newPack.sessionType, purchase_date: newPack.purchaseDate,
      total_sessions: newPack.totalSessions, sessions_used: 0, session_credits: 0,
      fee_per_session: newPack.feePerSession, status: "Active",
      payment_status: paymentStatus, payment_due_date: newPack.paymentDueDate,
      agreed_days: newPack.agreedDays,
    });

    setPacks((prev) => {
      const existing = prev.findIndex((pk) => pk.playerId === draft.playerId);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = newPack;
        return updated;
      }
      return [newPack, ...prev];
    });
    setShowForm(false);
  }

  function handleCredit(packId: string) {
    setPacks((prev) => prev.map((pk) => {
      if (pk.id !== packId) return pk;
      const updated = { ...pk, sessionCredits: pk.sessionCredits + 1 };
      upsertSessionPack({
        id: updated.id, player_id: updated.playerId, academy_id: updated.academyId,
        session_type: updated.sessionType, purchase_date: updated.purchaseDate,
        total_sessions: updated.totalSessions, sessions_used: updated.sessionsUsed,
        session_credits: updated.sessionCredits, fee_per_session: updated.feePerSession,
        status: updated.status, payment_status: updated.paymentStatus,
        payment_due_date: updated.paymentDueDate,
      });
      return updated;
    }));
  }

  const canAddPack = user?.role !== "coach";

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Session Packs</h1>
          <p className="text-zinc-400 text-sm">Track upfront session purchases, scheduled dates, and credits</p>
        </div>
        {canAddPack && (
          <button type="button" onClick={openAdd}
            className="px-5 py-2.5 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 transition-opacity cursor-pointer">
            + New Pack
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <StatCard label="Active packs" value={String(activePacks.length)} color="text-pace-green" />
        <StatCard label="Sessions remaining" value={String(totalRemain)} color="text-white" />
        <StatCard label="Fees outstanding" value={`$${totalOutstanding.toLocaleString()}`} color={totalOutstanding > 0 ? "text-red-400" : "text-zinc-500"} />
        <StatCard label="Gross revenue" value={`$${grossRevenue.toLocaleString()}`} color="text-amber" />
      </div>

      {/* Page tabs */}
      <div className="flex gap-2 mb-6">
        {(["Packs", "Fees Due"] as PageTab[]).map((t) => {
          const isActive = pageTab === t;
          const badge = t === "Fees Due" && feesDuePacks.length > 0 ? feesDuePacks.length : null;
          return (
            <button key={t} type="button" onClick={() => setPageTab(t)}
              className={`px-5 py-2 rounded-xl text-sm font-semibold transition-colors cursor-pointer flex items-center gap-2 ${
                isActive ? "bg-pace-green text-black" : "bg-surface text-zinc-400 hover:text-white"
              }`}>
              {t}
              {badge && (
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${isActive ? "bg-black/20 text-black" : "bg-red-500 text-white"}`}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Form anchor */}
      <div ref={formRef} />

      {/* New pack form */}
      {showForm && (
        <div className="bg-surface rounded-2xl p-6 border border-pace-green/30 mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-pace-green mb-6">New Session Pack</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
            <div className="sm:col-span-2">
              <label className={lbl}>Player *</label>
              <select
                value={draft.playerId}
                onChange={(e) => handlePlayerChange(e.target.value)}
                className={sel}
              >
                <option value="">— Select player —</option>
                {scopedPlayers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} · {p.ageGroup}</option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${TYPE_STYLES["Net Session"]}`}>
                Net Session
              </span>
              <p className="text-xs text-zinc-500 mt-1.5">Packs are only used for group net sessions — individual bookings are paid per session.</p>
            </div>

            <div>
              <label className={lbl}>Academy *</label>
              <select
                value={draft.academyId}
                onChange={(e) => handleAcademyChange(e.target.value)}
                className={sel}
                disabled={user?.role === "academy_admin"}
              >
                <option value="">— Select academy —</option>
                {_packAcademies.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={lbl}>Coach</label>
              <select
                value={draft.coachId ?? ""}
                onChange={(e) => setDraft({ ...draft, coachId: e.target.value || undefined })}
                className={sel}
              >
                <option value="">— Unassigned —</option>
                {_packCoaches.filter((c) => !draft.academyId || c.academyId === draft.academyId).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <p className="text-xs text-zinc-500 mt-1">Who this pack's revenue pays out to, if the academy splits payouts by coach.</p>
            </div>

            <div>
              <label className={lbl}>Purchase Date</label>
              <DateInput
                value={draft.purchaseDate}
                onChange={(v) => setDraft({ ...draft, purchaseDate: v })}
                className={inp}
              />
            </div>

            <div>
              <label className={lbl}>Sessions in Pack</label>
              <select
                value={draft.totalSessions}
                onChange={(e) => setDraft({ ...draft, totalSessions: parseInt(e.target.value) })}
                className={sel}
              >
                {[5, 10, 15, 20].map((n) => <option key={n} value={n}>{n} sessions</option>)}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className={lbl}>Session Days *</label>
              <div className="flex gap-1.5 flex-wrap">
                {DAYS.map((day) => {
                  const checked = draft.agreedDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => handleToggleDraftDay(day)}
                      className={`w-11 py-2 rounded-lg text-[11px] font-bold transition-colors cursor-pointer border ${
                        checked
                          ? "bg-pace-green text-black border-pace-green"
                          : "bg-ink text-zinc-500 border-zinc-700 hover:border-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
              {draft.agreedDays.length > 0 && (
                <p className="text-xs text-zinc-500 mt-1.5">
                  ≈{Math.ceil(draft.totalSessions / draft.agreedDays.length)} weeks at {draft.agreedDays.length} day{draft.agreedDays.length > 1 ? "s" : ""}/week
                </p>
              )}
            </div>

            <div>
              <label className={lbl}>Fee per Session (AUD)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 text-sm font-semibold">$</span>
                <input
                  type="number"
                  min={0}
                  step={5}
                  value={draft.feePerSession === 0 ? "" : draft.feePerSession}
                  onChange={(e) => setDraft({ ...draft, feePerSession: parseFloat(e.target.value) || 0 })}
                  className={`${inp} pl-8`}
                  placeholder="0.00"
                  disabled={!!draft.academyId && academyWaivesFees(draft.academyId)}
                />
              </div>
              {draft.academyId && academyWaivesFees(draft.academyId) ? (
                <p className="text-xs text-pace-green mt-1.5">✓ Covered by the academy's plan — no session fee</p>
              ) : (() => {
                if (!draft.playerId || !draft.academyId) return null;
                const player = _packPlayers.find((p) => p.id === draft.playerId);
                const academy = _packAcademies.find((a) => a.id === draft.academyId);
                if (!player || !academy) return null;
                const ageFee = academy.ageFees[player.ageGroup] ?? 0;
                if (ageFee > 0) {
                  return <p className="text-xs text-pace-green mt-1.5">Age-group rate for {player.ageGroup} · override by editing below</p>;
                }
                return null;
              })()}
            </div>
          </div>

          {/* Fee breakdown */}
          {draft.feePerSession > 0 && draft.totalSessions > 0 && (() => {
            const feePct = getPlatformFeePercent(draft.academyId, _packAcademies, _packPlans);
            return (
              <div className="mb-5 bg-ink rounded-xl p-4 grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-lg font-bold text-white">${(draft.feePerSession * draft.totalSessions).toLocaleString()}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">Total collected</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-amber">${(draft.feePerSession * draft.totalSessions * (feePct / 100)).toFixed(0)}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">Platform fee ({feePct}%)</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-pace-green">${(draft.feePerSession * draft.totalSessions * (1 - feePct / 100)).toFixed(0)}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">Academy receives ({100 - feePct}%)</div>
                </div>
              </div>
            );
          })()}

          {formError && <p className="text-red-400 text-sm mb-3">{formError}</p>}

          <div className="flex items-center gap-3">
            <button type="button" onClick={handleSave}
              className="px-6 py-2.5 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 cursor-pointer">
              Create Pack
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="px-6 py-2.5 text-sm font-medium text-zinc-400 border border-zinc-700 rounded-xl hover:text-white hover:border-zinc-500 transition-colors cursor-pointer">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── FEES DUE TAB ────────────────────────────────────────────────────── */}
      {pageTab === "Fees Due" && (
        <div className="space-y-4">
          {feesDuePacks.length === 0 ? (
            <div className="bg-surface rounded-2xl p-16 text-center">
              <p className="text-pace-green text-2xl mb-2">✓</p>
              <p className="text-white font-semibold mb-1">All fees collected</p>
              <p className="text-zinc-400 text-sm">No outstanding payments across your packs.</p>
            </div>
          ) : (
            <>
              {/* Outstanding summary */}
              <div className="grid grid-cols-3 gap-4 mb-2">
                <div className="bg-surface rounded-2xl p-5 text-center">
                  <div className="text-2xl font-bold text-red-400 mb-1">${totalOutstanding.toLocaleString()}</div>
                  <div className="text-xs text-zinc-400">Total outstanding</div>
                </div>
                <div className="bg-surface rounded-2xl p-5 text-center">
                  <div className="text-2xl font-bold text-amber mb-1">{feesDuePacks.filter(pk => resolvedPaymentStatus(pk) === "Pending").length}</div>
                  <div className="text-xs text-zinc-400">Pending</div>
                </div>
                <div className="bg-surface rounded-2xl p-5 text-center">
                  <div className="text-2xl font-bold text-red-500 mb-1">{overduePacks.length}</div>
                  <div className="text-xs text-zinc-400">Overdue</div>
                </div>
              </div>

              {/* Overdue first, then pending */}
              {(["Overdue", "Pending"] as PaymentStatus[]).map((status) => {
                const group = feesDuePacks.filter((pk) => resolvedPaymentStatus(pk) === status);
                if (group.length === 0) return null;
                return (
                  <div key={status}>
                    <div className="flex items-center gap-3 mb-3">
                      <span className={`text-xs font-bold uppercase tracking-wider ${status === "Overdue" ? "text-red-400" : "text-amber"}`}>
                        {status}
                      </span>
                      <div className="flex-1 h-px bg-zinc-800" />
                    </div>
                    <div className="space-y-3">
                      {group.map((pk) => {
                        const player = playerById(pk.playerId);
                        if (!player) return null;
                        const total = pk.totalSessions * pk.feePerSession;
                        const academy = academyById(pk.academyId);
                        const daysOverdue = Math.round((Date.now() - new Date(pk.paymentDueDate).getTime()) / 86400000);
                        const ini = initials(player.name);
                        return (
                          <div key={pk.id} className={`bg-surface rounded-2xl p-5 border ${status === "Overdue" ? "border-red-500/20" : "border-amber/20"}`}>
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-full bg-pace-green/15 flex items-center justify-center text-pace-green text-sm font-bold flex-shrink-0">
                                {ini}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                  <span className="text-white font-bold text-sm">{player.name}</span>
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${TYPE_STYLES[pk.sessionType]}`}>
                                    {pk.sessionType}
                                  </span>
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${
                                    status === "Overdue"
                                      ? "bg-red-500/15 text-red-400 border-red-500/30"
                                      : "bg-amber/15 text-amber border-amber/30"
                                  }`}>
                                    {status}
                                  </span>
                                  {player.loginDisabled && (
                                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-300 border border-red-500/40">
                                      🔒 Login locked
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 text-xs text-zinc-400 flex-wrap">
                                  <span>{academy?.name}</span>
                                  <span>·</span>
                                  <span>{pk.totalSessions} sessions × ${pk.feePerSession}</span>
                                  <span>·</span>
                                  <span className={`font-semibold ${status === "Overdue" ? "text-red-400" : "text-amber"}`}>
                                    Due {formatDate(pk.paymentDueDate)}
                                    {status === "Overdue" && daysOverdue > 0 && ` (${daysOverdue}d ago)`}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-4 flex-shrink-0">
                                <div className="text-right">
                                  <div className="text-lg font-bold text-white">${total.toLocaleString()}</div>
                                  <div className="text-[10px] text-zinc-500">total due</div>
                                </div>
                                <PayOnlineButton packId={pk.id} />
                                <MarkPaidButton packId={pk.id} onPaid={() => handleMarkPaid(pk.id)} />
                                {player.loginDisabled && canAddPack && (
                                  <ReactivateButton playerId={player.id} onReactivated={() => handleReactivate(player.id)} />
                                )}
                              </div>
                            </div>
                            {/* Fee split */}
                            <div className="mt-4 pt-4 border-t border-zinc-700/50 grid grid-cols-3 gap-3 text-center">
                              <div>
                                <div className="text-sm font-bold text-white">${total.toLocaleString()}</div>
                                <div className="text-[10px] text-zinc-500 mt-0.5">Collect from player</div>
                              </div>
                              <div>
                                <div className="text-sm font-bold text-amber">${(total * (getPlatformFeePercent(pk.academyId, _packAcademies, _packPlans) / 100)).toFixed(0)}</div>
                                <div className="text-[10px] text-zinc-500 mt-0.5">Platform ({getPlatformFeePercent(pk.academyId, _packAcademies, _packPlans)}%)</div>
                              </div>
                              <div>
                                <div className="text-sm font-bold text-pace-green">${(total * (1 - getPlatformFeePercent(pk.academyId, _packAcademies, _packPlans) / 100)).toFixed(0)}</div>
                                <div className="text-[10px] text-zinc-500 mt-0.5">Academy keeps ({100 - getPlatformFeePercent(pk.academyId, _packAcademies, _packPlans)}%)</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* ── PACKS TAB ───────────────────────────────────────────────────────── */}
      {pageTab === "Packs" && <>
      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {(["All", "Active", "Exhausted", "No Pack"] as FilterType[]).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              filter === f ? "bg-pace-green text-black" : "bg-surface text-zinc-400 hover:text-white"
            }`}>
            {f}
          </button>
        ))}
      </div>

      {/* Player pack cards */}
      <div className="space-y-4">
        {filteredPlayers.length === 0 && (
          <div className="bg-surface rounded-2xl p-16 text-center text-zinc-400 text-sm">
            No players found for this filter.
          </div>
        )}
        {filteredPlayers.map((player) => {
          const pack = scopedPacks.find((pk) => pk.playerId === player.id);
          const upcoming = upcomingBookings(player.id);
          const totalCredits = pack ? pack.sessionCredits : 0;
          const remaining = pack ? sessionsRemaining(pack) : 0;
          const pct = pack ? Math.max(0, Math.min(100, (pack.sessionsUsed / pack.totalSessions) * 100)) : 0;
          const ini = initials(player.name);

          return (
            <div key={player.id} className="bg-surface rounded-2xl p-6 border border-transparent">
              {/* Player header */}
              <div className="flex items-start justify-between gap-4 mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-pace-green/15 flex items-center justify-center text-pace-green text-sm font-bold flex-shrink-0">
                    {ini}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="text-white font-bold text-sm">{player.name}</span>
                      <span className="text-zinc-500 text-xs">·</span>
                      <span className="text-zinc-400 text-xs">{player.ageGroup} · {getCoachOrAcademyLabel(player, _packCoaches, _packAcademies)}</span>
                    </div>
                    {pack ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          pack.status === "Active" ? "bg-pace-green/20 text-pace-green" : "bg-zinc-700 text-zinc-400"
                        }`}>
                          {pack.status}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${TYPE_STYLES[pack.sessionType]}`}>
                          {pack.sessionType}
                        </span>
                        {(() => {
                          const ps = resolvedPaymentStatus(pack);
                          if (ps === "Paid") return null;
                          return (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${
                              ps === "Overdue"
                                ? "bg-red-500/15 text-red-400 border-red-500/30"
                                : "bg-amber/15 text-amber border-amber/30"
                            }`}>
                              Fee {ps}
                            </span>
                          );
                        })()}
                        <span className="text-zinc-500 text-xs">Purchased {formatDate(pack.purchaseDate)}</span>
                      </div>
                    ) : (
                      <span className="text-zinc-600 text-xs">No pack purchased</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!pack && canAddPack && (
                    <button type="button" onClick={() => {
                      setDraft({ ...EMPTY_DRAFT, playerId: player.id, purchaseDate: today,
                        academyId: user?.role === "academy_admin" ? (user.academyId ?? "") : "",
                        feePerSession: 0,
                      });
                      setFormError(""); setShowForm(true);
                      setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
                    }}
                      className="px-3 py-1.5 text-xs font-semibold text-pace-green border border-pace-green/40 rounded-lg hover:bg-pace-green/10 transition-colors cursor-pointer">
                      + New Pack
                    </button>
                  )}
                  {pack?.status === "Exhausted" && canAddPack && (
                    <button type="button" onClick={() => {
                      setDraft({ playerId: player.id, academyId: pack.academyId, sessionType: "Net Session", purchaseDate: today,
                        totalSessions: 10, feePerSession: pack.feePerSession, paymentStatus: "Pending",
                        paymentDueDate: new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
                        agreedDays: pack.agreedDays,
                      });
                      setFormError(""); setShowForm(true);
                      setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
                    }}
                      className="px-3 py-1.5 text-xs font-semibold text-amber border border-amber/40 rounded-lg hover:bg-amber/10 transition-colors cursor-pointer">
                      Renew Pack
                    </button>
                  )}
                  <Link href={`/players/${player.id}`}
                    className="px-3 py-1.5 text-xs font-semibold text-zinc-300 border border-zinc-600 rounded-lg hover:border-pace-green hover:text-pace-green transition-colors">
                    View Profile
                  </Link>
                </div>
              </div>

              {pack ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  {/* Sessions breakdown */}
                  <div className="lg:col-span-2">
                    <div className="mb-3">
                      <div className="flex items-center justify-between text-xs mb-2">
                        <span className="text-zinc-400">Sessions used</span>
                        <span className="text-white font-semibold">{pack.sessionsUsed} / {pack.totalSessions}</span>
                      </div>
                      <div className="h-2 bg-ink rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            remaining === 0 ? "bg-zinc-600" : pct >= 80 ? "bg-amber" : "bg-pace-green"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      {pack.agreedDays.length > 0 && (
                        <p className="text-xs text-zinc-500 mt-1.5">
                          ≈{Math.ceil(pack.totalSessions / pack.agreedDays.length)} weeks at {pack.agreedDays.length} day{pack.agreedDays.length > 1 ? "s" : ""}/week
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-4 gap-3 mb-4">
                      <PackStat label="Paid" value={String(pack.totalSessions)} sub="sessions" color="text-white" />
                      <PackStat label="Used" value={String(pack.sessionsUsed)} sub="sessions" color="text-zinc-300" />
                      <PackStat label="Credits" value={String(totalCredits)} sub="returned" color={totalCredits > 0 ? "text-blue-400" : "text-zinc-600"} />
                      <PackStat label="Remaining" value={String(remaining)} sub="available" color={remaining === 0 ? "text-red-400" : remaining <= 2 ? "text-amber" : "text-pace-green"} />
                    </div>

                    {/* Pricing */}
                    {pack.feePerSession === 0 && academyWaivesFees(pack.academyId) ? (
                      <div className="bg-ink rounded-xl p-4 mb-4">
                        <p className="text-sm text-pace-green font-semibold">✓ Covered by the academy's plan — no session fee</p>
                      </div>
                    ) : (
                    <div className="bg-ink rounded-xl p-4 grid grid-cols-3 gap-3 text-center mb-4">
                      <div>
                        <div className="text-sm font-bold text-white">${pack.feePerSession}/session</div>
                        <div className="text-xs text-zinc-500 mt-0.5">Session rate</div>
                      </div>
                      <div>
                        <div className="text-sm font-bold text-amber">${(pack.feePerSession * (getPlatformFeePercent(pack.academyId, _packAcademies, _packPlans) / 100)).toFixed(0)}/session</div>
                        <div className="text-xs text-zinc-500 mt-0.5">Platform ({getPlatformFeePercent(pack.academyId, _packAcademies, _packPlans)}%)</div>
                      </div>
                      <div>
                        <div className="text-sm font-bold text-pace-green">${(pack.feePerSession * pack.totalSessions * (1 - getPlatformFeePercent(pack.academyId, _packAcademies, _packPlans) / 100)).toFixed(0)} total</div>
                        <div className="text-xs text-zinc-500 mt-0.5">Academy receives</div>
                      </div>
                    </div>
                    )}

                    {/* Credit button */}
                    {pack.status === "Active" && (
                      <CreditButton packId={pack.id} remaining={remaining} expired={isPackCreditExpired(pack)} onCredit={() => handleCredit(pack.id)} />
                    )}
                  </div>

                  {/* Agreed sessions + weekday picker */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">
                      Agreed sessions ({upcoming.length})
                    </p>

                    {/* Weekday checkboxes */}
                    <div className="bg-ink rounded-xl px-4 py-3 mb-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2.5">Session days</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {DAYS.map((day) => {
                          const checked = pack.agreedDays.includes(day);
                          // Does any upcoming booking fall on this weekday?
                          const hasBooking = upcoming.some((b) => {
                            const d = new Date(b.date);
                            return d.toLocaleDateString("en-GB", { weekday: "short" }) === day;
                          });
                          return (
                            <button
                              key={day}
                              type="button"
                              onClick={() => handleToggleDay(pack, day)}
                              className={`relative flex flex-col items-center gap-1 w-9 py-2 rounded-lg text-[11px] font-bold transition-colors cursor-pointer border ${
                                checked
                                  ? "bg-pace-green text-black border-pace-green"
                                  : "bg-surface text-zinc-500 border-zinc-700 hover:border-zinc-500 hover:text-zinc-300"
                              }`}
                            >
                              {day}
                              {hasBooking && (
                                <span className={`w-1.5 h-1.5 rounded-full ${checked ? "bg-black/40" : "bg-pace-green"}`} />
                              )}
                              {!hasBooking && <span className="w-1.5 h-1.5" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Upcoming booking list */}
                    {upcoming.length === 0 ? (
                      <div className="bg-ink rounded-xl p-4 text-center">
                        <p className="text-zinc-500 text-xs mb-2">No upcoming sessions booked</p>
                        <Link href="/bookings"
                          className="text-xs text-pace-green font-semibold hover:underline">
                          + Schedule session
                        </Link>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {upcoming.slice(0, 5).map((b) => {
                          const isToday = b.date === today;
                          const isTomorrow = b.date === new Date(Date.now() + 86400000).toISOString().split("T")[0];
                          const weekday = new Date(b.date).toLocaleDateString("en-GB", { weekday: "short" });
                          const label = isToday ? "Today" : isTomorrow ? "Tomorrow" : formatDate(b.date);
                          return (
                            <div key={b.id} className="bg-ink rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className="text-zinc-500 text-[10px] font-bold uppercase w-7">{weekday}</span>
                                  <span className={`text-xs font-bold ${isToday ? "text-amber" : "text-white"}`}>{label}</span>
                                  <span className="text-zinc-600 text-xs">·</span>
                                  <span className="text-zinc-400 text-xs">{b.time}</span>
                                </div>
                                <span className="text-zinc-500 text-xs">{b.type}</span>
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
                          <p className="text-xs text-zinc-500 text-center pt-1">+{upcoming.length - 5} more</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-ink rounded-xl p-5 text-center">
                  <p className="text-zinc-400 text-sm mb-1">No session pack purchased yet</p>
                  <p className="text-zinc-600 text-xs">Create a pack to start tracking upfront payments and session credits.</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
      </>}
    </div>
  );
}

// ─── Mark Paid Button ────────────────────────────────────────────────────────

function PayOnlineButton({ packId }: { packId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handlePay() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/stripe/create-pack-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId }),
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
    <div className="text-right">
      <button type="button" onClick={handlePay} disabled={loading}
        className="px-4 py-2 text-xs font-bold text-pace-green border border-pace-green/40 rounded-xl hover:bg-pace-green/10 cursor-pointer transition-colors disabled:opacity-60">
        {loading ? "Loading…" : "Pay Online"}
      </button>
      {error && <p className="text-[10px] text-red-400 mt-1 max-w-32">{error}</p>}
    </div>
  );
}

function MarkPaidButton({ packId, onPaid }: { packId: string; onPaid: () => void }) {
  const [done, setDone] = useState(false);
  if (done) {
    return <span className="text-xs font-semibold text-pace-green flex items-center gap-1">✓ Marked paid</span>;
  }
  return (
    <button type="button" onClick={() => { onPaid(); setDone(true); }}
      className="px-4 py-2 text-xs font-bold bg-pace-green text-black rounded-xl hover:opacity-90 cursor-pointer transition-opacity">
      Mark Paid
    </button>
  );
}

function ReactivateButton({ playerId, onReactivated }: { playerId: string; onReactivated: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleClick() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/reactivate-player", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not reactivate account.");
      setDone(true);
      onReactivated();
    } catch (err) {
      setError((err as { message?: string })?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return <span className="text-xs font-semibold text-pace-green flex items-center gap-1">✓ Reactivated</span>;
  }

  return (
    <div className="text-right">
      <button type="button" onClick={handleClick} disabled={loading}
        className="px-4 py-2 text-xs font-bold text-pace-green border border-pace-green/40 rounded-xl hover:bg-pace-green/10 cursor-pointer transition-colors disabled:opacity-60">
        {loading ? "Loading…" : "Reactivate"}
      </button>
      {error && <p className="text-[10px] text-red-400 mt-1 max-w-32">{error}</p>}
    </div>
  );
}

// ─── Credit Button (isolated so useState per-pack works) ─────────────────────

function CreditButton({ packId, remaining, expired, onCredit }: {
  packId: string;
  remaining: number;
  expired: boolean;
  onCredit: () => void;
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [done, setDone] = useState(false);

  if (remaining === 0) return null;
  if (expired) {
    return (
      <p className="text-xs text-zinc-500">
        This pack's agreed weekly window has passed — credits can no longer be issued.
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
        <span className="text-zinc-300 text-xs">Credit 1 session back to this player's pack?</span>
        <button type="button" onClick={confirm}
          className="px-3 py-1.5 text-xs font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-500/30 cursor-pointer transition-colors">
          Yes, credit it
        </button>
        <button type="button" onClick={() => setShowConfirm(false)}
          className="text-xs text-zinc-500 hover:text-white cursor-pointer">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button type="button" onClick={() => setShowConfirm(true)}
      className="px-4 py-2 text-xs font-semibold text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-500/10 transition-colors cursor-pointer">
      Credit a Session (player no-show / cancellation)
    </button>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function PackStat({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="bg-ink rounded-xl p-3 text-center">
      <div className={`text-xl font-bold font-mono mb-0.5 ${color}`}>{value}</div>
      <div className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wide leading-tight">{label}</div>
      <div className="text-[10px] text-zinc-600">{sub}</div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-surface rounded-2xl p-5 text-center">
      <div className={`text-2xl font-bold mb-1 ${color}`}>{value}</div>
      <div className="text-xs text-zinc-400">{label}</div>
    </div>
  );
}

const inp = "w-full bg-ink rounded-xl px-4 py-3 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm";
const sel = "w-full bg-ink rounded-xl px-4 py-3 text-white border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm cursor-pointer";
const lbl = "block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5";
