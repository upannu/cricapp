"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import type { Booking, BookingStatus, BookingType, Player, Coach, SessionPack, Academy } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { fetchBookings, fetchPlayers, fetchCoaches, fetchAcademies, fetchSessionPacks, upsertBooking, deleteBooking, updatePackPaymentStatus } from "@/lib/db";
import { formatDate } from "@/lib/utils";

const BOOKING_TYPES: BookingType[] = [
  "Net Session", "Individual Coaching", "Video Review",
  "Fitness Assessment", "Match Practice", "Warm-up / Conditioning",
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

// Returns the ISO date string for the next occurrence of a weekday (0=Mon … 6=Sun)
function nextOccurrence(targetDow: number): string {
  const d = new Date();
  const current = (d.getDay() + 6) % 7; // convert JS Sun=0 → Mon=0
  const diff = (targetDow - current + 7) % 7 || 7; // always go forward (min 1 day)
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}

// Returns Mon=0 … Sun=6 index of an ISO date string
function dowOfDate(dateStr: string): number {
  return (new Date(dateStr).getDay() + 6) % 7;
}

const DURATIONS = [30, 45, 60, 90, 120];

const STATUS_STYLES: Record<BookingStatus, string> = {
  Confirmed:  "bg-pace-green/20 text-pace-green border-pace-green/30",
  Pending:    "bg-amber/20 text-amber border-amber/30",
  Cancelled:  "bg-red-500/20 text-red-400 border-red-500/30",
  Completed:  "bg-zinc-700 text-zinc-400 border-zinc-600",
};

const TYPE_STYLES: Record<BookingType, string> = {
  "Net Session":             "bg-pace-green/10 text-pace-green",
  "Individual Coaching":     "bg-blue-500/10 text-blue-400",
  "Video Review":            "bg-purple-500/10 text-purple-400",
  "Fitness Assessment":      "bg-fire/10 text-fire",
  "Match Practice":          "bg-amber/10 text-amber",
  "Warm-up / Conditioning":  "bg-zinc-700 text-zinc-300",
};

type FilterTab = "Upcoming" | "Pending" | "Past" | "Cancelled" | "All";

type DraftBooking = Omit<Booking, "id">;

const today = new Date().toISOString().split("T")[0];

// These are populated from DB and used by module-level helpers below
let _coaches: Coach[] = [];
let _academies: Academy[] = [];

function feeForCoachAndType(coachId: string, type: BookingType): number {
  const coach = _coaches.find((c) => c.id === coachId);
  if (!coach) return 0;
  const academy = _academies.find((a) => a.id === coach.academyId);
  return academy?.sessionTypeFees[type] ?? academy?.sessionFeeAud ?? 0;
}

const EMPTY_DRAFT: DraftBooking = {
  playerId: "",
  coachId: "",
  date: today,
  time: "09:00",
  durationMins: 60,
  type: "Net Session",
  status: "Confirmed",
  location: "",
  notes: "",
  feeAud: 0,
};

let _players: Player[] = [];
let _packs: SessionPack[] = [];

function playerById(id: string) { return _players.find((p) => p.id === id); }
function coachById(id: string) { return _coaches.find((c) => c.id === id); }
function packForPlayer(playerId: string) { return _packs.find((pk) => pk.playerId === playerId && pk.status === "Active"); }

function isUpcoming(b: Booking) { return b.date >= today && b.status !== "Cancelled"; }
function isPast(b: Booking)     { return b.date < today && b.status !== "Cancelled"; }

function groupByDate(bookings: Booking[]): [string, Booking[]][] {
  const map = new Map<string, Booking[]>();
  for (const b of bookings) {
    const arr = map.get(b.date) ?? [];
    arr.push(b);
    map.set(b.date, arr);
  }
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
}

function friendlyDate(dateStr: string): string {
  const d = new Date(dateStr);
  const diff = Math.round((d.getTime() - new Date(today).getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "short", year: "numeric" });
}

export function BookingsClient() {
  const { user } = useAuth();
  const formRef = useRef<HTMLDivElement>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);

  useEffect(() => {
    const coachId = user?.role === "coach" ? (user.coachId ?? undefined) : undefined;
    Promise.all([
      fetchBookings(coachId),
      fetchPlayers(user?.role === "coach" ? user.coachId : undefined),
      fetchCoaches(),
      fetchAcademies(),
      fetchSessionPacks(),
    ]).then(([bk, pl, co, ac, pk]) => {
      setBookings(bk);
      _players = pl; _coaches = co; _academies = ac; _packs = pk;
    });
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps
  const [tab, setTab] = useState<FilterTab>("Upcoming");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftBooking>(EMPTY_DRAFT);
  const [formError, setFormError] = useState("");
  const [saved, setSaved] = useState<string | null>(null);

  // ── Computed ─────────────────────────────────────────────────────────────
  const upcomingAll = bookings.filter(isUpcoming);
  const pendingAll  = bookings.filter((b) => b.status === "Pending");
  const thisWeek    = upcomingAll.filter((b) => {
    const diff = (new Date(b.date).getTime() - Date.now()) / 86400000;
    return diff <= 7;
  });

  const filtered = (() => {
    switch (tab) {
      case "Upcoming":  return bookings.filter((b) => isUpcoming(b) && b.status !== "Pending");
      case "Pending":   return bookings.filter((b) => b.status === "Pending");
      case "Past":      return bookings.filter(isPast).sort((a, b) => b.date.localeCompare(a.date));
      case "Cancelled": return bookings.filter((b) => b.status === "Cancelled");
      default:          return [...bookings].sort((a, b) => b.date.localeCompare(a.date));
    }
  })();

  const grouped = tab === "Past" || tab === "All"
    ? null
    : groupByDate(filtered);

  // ── Form helpers ──────────────────────────────────────────────────────────
  function scrollToForm() {
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  const defaultCoachId = user?.role === "coach" ? (user.coachId ?? "") : "";

  function openAdd() {
    setEditingId(null);
    const coachId = defaultCoachId;
    setDraft({ ...EMPTY_DRAFT, date: today, coachId, feeAud: feeForCoachAndType(coachId, "Net Session") });
    setFormError("");
    setShowForm(true);
    scrollToForm();
  }

  function openEdit(b: Booking) {
    setEditingId(b.id);
    setDraft({ playerId: b.playerId, coachId: b.coachId, date: b.date, time: b.time, durationMins: b.durationMins, type: b.type, status: b.status, location: b.location, notes: b.notes, feeAud: b.feeAud, packId: b.packId });
    setFormError("");
    setShowForm(true);
    scrollToForm();
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setFormError("");
  }

  function handleSave() {
    if (!draft.coachId)  { setFormError("Please select a coach."); return; }
    if (!draft.playerId) { setFormError("Please select a player."); return; }
    if (!draft.date)     { setFormError("Please choose a date."); return; }
    setFormError("");

    const newId = editingId ?? `b_${Date.now()}`;
    const booking: Booking = { id: newId, ...draft };

    upsertBooking({ id: booking.id, player_id: booking.playerId, coach_id: booking.coachId, date: booking.date, time: booking.time, duration_mins: booking.durationMins, type: booking.type, status: booking.status, location: booking.location, notes: booking.notes, fee_aud: booking.feeAud, pack_id: booking.packId ?? null });

    setBookings((prev) =>
      editingId
        ? prev.map((b) => (b.id === editingId ? booking : b))
        : [booking, ...prev]
    );
    setSaved(newId);
    closeForm();
    // Switch to the right tab to see the saved booking
    if (booking.status === "Pending") setTab("Pending");
    else if (isUpcoming(booking))     setTab("Upcoming");
    else                              setTab("Past");
    setTimeout(() => setSaved(null), 2500);
  }

  function handleDelete(id: string) {
    deleteBooking(id);
    setBookings((prev) => prev.filter((b) => b.id !== id));
    closeForm();
  }

  function changeStatus(id: string, status: BookingStatus) {
    upsertBooking({ id, status });
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status } : b)));
    setSaved(id);
    setTimeout(() => setSaved(null), 2000);
  }

  async function handleCompleteBooking(booking: Booking, notes: string) {
    const res = await fetch("/api/bookings/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: booking.id, notes }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error ?? "Failed to complete booking");

    setBookings((prev) => prev.map((b) => (b.id === booking.id ? { ...b, status: "Completed" } : b)));
    setSaved(booking.id);
    setTimeout(() => setSaved(null), 2500);
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Bookings</h1>
          <p className="text-zinc-400 text-sm">Manage coaching sessions and player appointments</p>
        </div>
        <button type="button" onClick={openAdd}
          className="px-5 py-2.5 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 transition-opacity cursor-pointer">
          + New Booking
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total bookings" value={bookings.length} color="text-white" />
        <StatCard label="This week" value={thisWeek.length} color="text-pace-green" />
        <StatCard label="Upcoming" value={upcomingAll.length} color="text-blue-400" />
        <StatCard label="Pending confirm" value={pendingAll.length} color="text-amber" />
      </div>

      {/* Form ref anchor */}
      <div ref={formRef} />

      {/* Create / Edit form */}
      {showForm && (
        <div className="bg-surface rounded-2xl p-6 border border-pace-green/30 mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-pace-green mb-6">
            {editingId ? "Edit Booking" : "New Booking"}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
            {/* Coach */}
            <div className="sm:col-span-2">
              <label className={lbl}>Coach *</label>
              <select
                value={draft.coachId}
                onChange={(e) => {
                  const coachId = e.target.value;
                  setDraft({ ...draft, coachId, feeAud: feeForCoachAndType(coachId, draft.type) });
                }}
                className={sel}
                disabled={user?.role === "coach"}
              >
                <option value="">— Select coach —</option>
                {_coaches
                  .filter((c) => c.status === "Active")
                  .map((c) => (
                    <option key={c.id} value={c.id}>{c.name} · {c.specialization}</option>
                  ))}
              </select>
            </div>
            {/* Player */}
            <div className="sm:col-span-2">
              <label className={lbl}>Player</label>
              <select
                value={draft.playerId}
                onChange={(e) => {
                  const playerId = e.target.value;
                  const activePack = packForPlayer(playerId);
                  setDraft({ ...draft, playerId, packId: activePack?.id });
                }}
                className={sel}
              >
                <option value="">— Select player —</option>
                {_players.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} · {p.ageGroup}</option>
                ))}
              </select>
              {(() => {
                const activePack = draft.playerId ? packForPlayer(draft.playerId) : undefined;
                if (!activePack) return null;
                const remaining = activePack.totalSessions - activePack.sessionsUsed + activePack.sessionCredits;
                return (
                  <label className="mt-2 flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.packId === activePack.id}
                      onChange={(e) => setDraft({ ...draft, packId: e.target.checked ? activePack.id : undefined })}
                      className="accent-pace-green cursor-pointer"
                    />
                    Draw from active pack ({remaining} session{remaining !== 1 ? "s" : ""} remaining)
                  </label>
                );
              })()}
            </div>

            {/* Date + weekday quick-select */}
            <div className="sm:col-span-2">
              <label className={lbl}>Date</label>
              <div className="flex gap-1.5 mb-2">
                {DAYS.map((day, i) => {
                  const active = dowOfDate(draft.date) === i;
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => setDraft({ ...draft, date: nextOccurrence(i) })}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer border ${
                        active
                          ? "bg-pace-green text-black border-pace-green"
                          : "bg-ink text-zinc-500 border-zinc-700 hover:border-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
              <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className={inp} />
            </div>

            {/* Time */}
            <div>
              <label className={lbl}>Time</label>
              <input type="time" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} className={inp} />
            </div>

            {/* Duration */}
            <div>
              <label className={lbl}>Duration</label>
              <select value={draft.durationMins} onChange={(e) => setDraft({ ...draft, durationMins: parseInt(e.target.value) })} className={sel}>
                {DURATIONS.map((d) => (
                  <option key={d} value={d}>{d} minutes</option>
                ))}
              </select>
            </div>

            {/* Type */}
            <div>
              <label className={lbl}>Session Type</label>
              <select
                value={draft.type}
                onChange={(e) => {
                  const type = e.target.value as BookingType;
                  setDraft({ ...draft, type, feeAud: feeForCoachAndType(draft.coachId, type) });
                }}
                className={sel}
              >
                {BOOKING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {/* Fee */}
            <div>
              <label className={lbl}>Session Fee (AUD)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 text-sm font-semibold">$</span>
                <input
                  type="number"
                  min={0}
                  step={5}
                  value={draft.feeAud === 0 ? "" : draft.feeAud}
                  onChange={(e) => setDraft({ ...draft, feeAud: parseFloat(e.target.value) || 0 })}
                  className={`${inp} pl-8`}
                  placeholder="Auto-filled from session type"
                />
              </div>
              {draft.feeAud > 0 && (
                <div className="flex gap-4 mt-1.5 text-[11px]">
                  <span className="text-amber">Platform: ${(draft.feeAud * 0.10).toFixed(0)}</span>
                  <span className="text-pace-green">Academy: ${(draft.feeAud * 0.90).toFixed(0)}</span>
                </div>
              )}
            </div>

            {/* Status */}
            <div>
              <label className={lbl}>Status</label>
              <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as BookingStatus })} className={sel}>
                <option value="Confirmed">Confirmed</option>
                <option value="Pending">Pending</option>
                <option value="Cancelled">Cancelled</option>
                <option value="Completed">Completed</option>
              </select>
            </div>

            {/* Location */}
            <div>
              <label className={lbl}>Location</label>
              <input type="text" value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} className={inp} placeholder="e.g. Brisbane Cricket Centre – Net 3" />
            </div>

            {/* Notes */}
            <div className="sm:col-span-2">
              <label className={lbl}>Notes</label>
              <textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} className={`${inp} resize-none h-20`} placeholder="Session focus, special instructions…" />
            </div>
          </div>

          {formError && <p className="text-red-400 text-sm mb-3">{formError}</p>}

          <div className="flex items-center gap-3">
            <button type="button" onClick={handleSave}
              className="px-6 py-2.5 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 cursor-pointer">
              {editingId ? "Save Changes" : "Create Booking"}
            </button>
            <button type="button" onClick={closeForm}
              className="px-6 py-2.5 text-sm font-medium text-zinc-400 border border-zinc-700 rounded-xl hover:text-white hover:border-zinc-500 transition-colors cursor-pointer">
              Cancel
            </button>
            {editingId && (
              <button type="button" onClick={() => handleDelete(editingId)}
                className="ml-auto px-4 py-2.5 text-sm font-medium text-red-400 border border-red-500/30 rounded-xl hover:bg-red-500/10 transition-colors cursor-pointer">
                Delete
              </button>
            )}
          </div>
        </div>
      )}

      {/* Success banner */}
      {saved && !showForm && (
        <div className="mb-5 px-5 py-3 rounded-xl bg-pace-green/10 border border-pace-green/30 text-pace-green text-sm font-semibold">
          ✓ Booking saved
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {(["Upcoming", "Pending", "Past", "Cancelled", "All"] as FilterTab[]).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              tab === t ? "bg-pace-green text-black" : "bg-surface text-zinc-400 hover:text-white"
            }`}>
            {t}
            {t === "Pending" && pendingAll.length > 0 && (
              <span className="ml-1.5 bg-amber text-black text-xs font-bold px-1.5 py-0.5 rounded-full">
                {pendingAll.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Booking list */}
      {filtered.length === 0 ? (
        <div className="bg-surface rounded-2xl p-16 text-center">
          <p className="text-zinc-400 text-sm mb-4">No {tab.toLowerCase()} bookings.</p>
          <button type="button" onClick={openAdd}
            className="px-5 py-2.5 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 cursor-pointer">
            + New Booking
          </button>
        </div>
      ) : grouped ? (
        // Grouped by date (Upcoming / Pending)
        <div className="space-y-6">
          {grouped.map(([date, dayBookings]) => (
            <div key={date}>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-sm font-bold text-white">{friendlyDate(date)}</span>
                <span className="text-xs text-zinc-500">{formatDate(date)}</span>
                <div className="flex-1 h-px bg-zinc-800" />
                <span className="text-xs text-zinc-500">{dayBookings.length} session{dayBookings.length > 1 ? "s" : ""}</span>
              </div>
              <div className="space-y-3">
                {dayBookings
                  .sort((a, b) => a.time.localeCompare(b.time))
                  .map((b) => (
                    <BookingCard
                      key={b.id}
                      booking={b}
                      highlight={saved === b.id}
                      onEdit={() => openEdit(b)}
                      onStatusChange={(s) => changeStatus(b.id, s)}
                      onComplete={(notes) => handleCompleteBooking(b, notes)}
                    />
                  ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Flat list (Past / All)
        <div className="space-y-3">
          {filtered.map((b) => (
            <BookingCard
              key={b.id}
              booking={b}
              highlight={saved === b.id}
              onEdit={() => openEdit(b)}
              onStatusChange={(s) => changeStatus(b.id, s)}
              onComplete={(notes) => handleCompleteBooking(b, notes)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Booking card ─────────────────────────────────────────────────────────────

function BookingCard({
  booking: b,
  highlight,
  onEdit,
  onStatusChange,
  onComplete,
}: {
  booking: Booking;
  highlight: boolean;
  onEdit: () => void;
  onStatusChange: (s: BookingStatus) => void;
  onComplete: (notes: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [credited, setCredited] = useState(false);
  const [completingOpen, setCompletingOpen] = useState(false);
  const [completeNotes, setCompleteNotes] = useState(b.notes);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState("");
  const player = playerById(b.playerId);
  const coach = coachById(b.coachId);
  const activePack = b.playerId ? packForPlayer(b.playerId) : undefined;
  const initials = player?.name.split(" ").map((n) => n[0]).join("") ?? "?";
  const endTime = (() => {
    const [h, m] = b.time.split(":").map(Number);
    const end = new Date(0, 0, 0, h, m + b.durationMins);
    return `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
  })();

  async function handleComplete() {
    setCompleting(true);
    setCompleteError("");
    try {
      await onComplete(completeNotes);
      setCompletingOpen(false);
    } catch (err) {
      setCompleteError((err as { message?: string })?.message ?? String(err));
    } finally {
      setCompleting(false);
    }
  }

  return (
    <div className={`bg-surface rounded-2xl border transition-colors ${highlight ? "border-pace-green/40" : "border-transparent hover:border-zinc-700"}`}>
      {/* Summary row */}
      <button type="button" onClick={() => setExpanded((v) => !v)} className="w-full text-left p-5 cursor-pointer">
        <div className="flex items-center gap-4">
          {/* Time block */}
          <div className="flex-shrink-0 w-16 text-center">
            <div className="text-white font-bold text-sm">{b.time}</div>
            <div className="text-zinc-500 text-xs">{endTime}</div>
          </div>

          {/* Avatar */}
          <div className="w-9 h-9 rounded-full bg-pace-green/20 flex items-center justify-center text-pace-green text-xs font-bold flex-shrink-0">
            {initials}
          </div>

          {/* Player + type */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-0.5">
              <span className="text-white font-semibold text-sm">{player?.name ?? "Unknown"}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${TYPE_STYLES[b.type]}`}>{b.type}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-400 flex-wrap">
              <span>{b.durationMins} min</span>
              {coach && <><span>·</span><span className="text-zinc-300">👤 {coach.name}</span></>}
              {b.feeAud > 0 && <><span>·</span><span className="text-amber font-semibold">${b.feeAud}</span></>}
              {b.location && <><span>·</span><span className="truncate max-w-xs">{b.location}</span></>}
            </div>
          </div>

          {/* Status + chevron */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${STATUS_STYLES[b.status]}`}>
              {b.status}
            </span>
            <span className={`text-zinc-400 text-sm transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}>▾</span>
          </div>
        </div>
      </button>

      {/* Expanded */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-zinc-700/50 pt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Details */}
            <div className="bg-ink rounded-xl p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">Details</p>
              <Detail label="Coach" value={coach?.name ?? "—"} />
              <Detail label="Player" value={player?.name ?? "—"} />
              <Detail label="Date" value={formatDate(b.date)} />
              <Detail label="Time" value={`${b.time} – ${endTime}`} />
              <Detail label="Duration" value={`${b.durationMins} minutes`} />
              <Detail label="Location" value={b.location || "—"} />
              {b.feeAud > 0 && (
                <div className="mt-3 pt-3 border-t border-zinc-700/50 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-sm font-bold text-white">${b.feeAud}</div>
                    <div className="text-[10px] text-zinc-500">Session fee</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-amber">${(b.feeAud * 0.10).toFixed(0)}</div>
                    <div className="text-[10px] text-zinc-500">Platform (10%)</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-pace-green">${(b.feeAud * 0.90).toFixed(0)}</div>
                    <div className="text-[10px] text-zinc-500">Academy (90%)</div>
                  </div>
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="bg-ink rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">Notes</p>
              <p className="text-sm text-zinc-300 leading-relaxed">{b.notes || "No notes."}</p>
            </div>
          </div>

          {/* Quick status change */}
          {b.status !== "Completed" && b.status !== "Cancelled" && !completingOpen && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-zinc-400">Quick update:</span>
              {b.status !== "Confirmed" && (
                <button type="button" onClick={() => onStatusChange("Confirmed")}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-pace-green/40 text-pace-green hover:bg-pace-green/10 cursor-pointer transition-colors">
                  ✓ Confirm
                </button>
              )}
              {b.date < today && (
                <button type="button" onClick={() => setCompletingOpen(true)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-zinc-600 text-zinc-300 hover:border-zinc-400 cursor-pointer transition-colors">
                  Mark Completed
                </button>
              )}
              <button type="button" onClick={() => onStatusChange("Cancelled")}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 cursor-pointer transition-colors">
                Cancel
              </button>
            </div>
          )}

          {/* Complete booking → log session */}
          {completingOpen && (
            <div className="bg-ink rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Complete Booking — Log Session
              </p>
              <textarea
                value={completeNotes}
                onChange={(e) => setCompleteNotes(e.target.value)}
                placeholder="Session notes — what was covered, observations, focus areas…"
                className="w-full bg-surface rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none resize-none h-20"
              />
              {b.packId && (
                <p className="text-xs text-blue-400">This will use 1 session from the player&apos;s active pack.</p>
              )}
              {completeError && <p className="text-xs text-red-400">{completeError}</p>}
              <div className="flex items-center gap-2">
                <button type="button" onClick={handleComplete} disabled={completing}
                  className="px-4 py-2 text-xs font-bold bg-pace-green text-black rounded-lg hover:opacity-90 disabled:opacity-60 cursor-pointer transition-opacity">
                  {completing ? "Completing…" : "Complete & Log Session"}
                </button>
                <button type="button" onClick={() => setCompletingOpen(false)} disabled={completing}
                  className="text-xs text-zinc-400 hover:text-white cursor-pointer">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Credit to Pack (cancelled bookings with active pack) */}
          {b.status === "Cancelled" && activePack && (
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-3 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-blue-400 mb-0.5">Player has an active session pack</p>
                <p className="text-xs text-zinc-500">Credit 1 session back so the player can rebook.</p>
              </div>
              {credited ? (
                <span className="text-xs font-semibold text-blue-400 flex items-center gap-1.5 flex-shrink-0">
                  <span>✓</span> Session credited
                </span>
              ) : (
                <button type="button"
                  onClick={() => { updatePackPaymentStatus(activePack.id, activePack.paymentStatus); setCredited(true); }}
                  className="px-4 py-2 text-xs font-bold text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-500/10 transition-colors cursor-pointer flex-shrink-0">
                  Credit to Pack
                </button>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <button type="button" onClick={onEdit}
              className="px-4 py-2 text-xs font-semibold text-zinc-300 border border-zinc-600 rounded-lg hover:border-pace-green hover:text-pace-green transition-colors cursor-pointer">
              Edit Booking
            </button>
            {player && (
              <Link href={`/players/${player.id}`}
                className="px-4 py-2 text-xs font-semibold text-zinc-300 border border-zinc-600 rounded-lg hover:border-pace-green hover:text-pace-green transition-colors">
                View Player
              </Link>
            )}
            {player && (
              <Link href={`/players/${player.id}/new-session`}
                className="px-4 py-2 text-xs font-semibold bg-pace-green text-black rounded-lg hover:opacity-90 transition-opacity">
                + New Session
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-surface rounded-2xl p-5 text-center">
      <div className={`text-2xl font-bold mb-1 ${color}`}>{value}</div>
      <div className="text-xs text-zinc-400">{label}</div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs text-zinc-400 flex-shrink-0">{label}</span>
      <span className="text-xs text-white text-right">{value}</span>
    </div>
  );
}

const inp = "w-full bg-ink rounded-xl px-4 py-3 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm";
const sel = "w-full bg-ink rounded-xl px-4 py-3 text-white border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm cursor-pointer";
const lbl = "block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5";
