"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import {
  fetchGroupSessions, upsertGroupSession, setGroupSessionRoster,
  fetchPlayers, fetchCoaches, fetchSessionPacks, fetchPastOccurrences,
  fetchAttendanceForDate, saveAttendance,
} from "@/lib/db";
import type { GroupSession, Player, Coach, SessionPack, BookingType, AttendanceStatus, AttendanceRecord } from "@/lib/types";

const SESSION_TYPES: BookingType[] = [
  "Net Session", "Individual Coaching", "Video Review",
  "Fitness Assessment", "Match Practice", "Warm-up / Conditioning",
];

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKS_AHEAD = 8;

type DraftGroup = {
  id?: string;
  name: string;
  sessionType: BookingType;
  dayOfWeek: number;
  time: string;
  durationMins: number;
  location: string;
  coachId: string;
  playerIds: string[];
};

const EMPTY_DRAFT: DraftGroup = {
  name: "", sessionType: "Net Session", dayOfWeek: 2, time: "16:00",
  durationMins: 60, location: "", coachId: "", playerIds: [],
};

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

/** Every occurrence date for a weekly recurring group between two ISO dates, inclusive. */
function occurrenceDatesInRange(dayOfWeek: number, fromIso: string, toIso: string): string[] {
  const dates: string[] = [];
  const from = new Date(fromIso + "T00:00:00");
  const to = new Date(toIso + "T00:00:00");
  const cursor = new Date(from);
  const offset = (dayOfWeek - cursor.getDay() + 7) % 7;
  cursor.setDate(cursor.getDate() + offset);
  while (cursor <= to) {
    dates.push(cursor.toISOString().split("T")[0]);
    cursor.setDate(cursor.getDate() + 7);
  }
  return dates;
}

export function AttendanceClient() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<GroupSession[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pastDates, setPastDates] = useState<Record<string, { id: string; date: string }[]>>({});

  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<DraftGroup>(EMPTY_DRAFT);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [attendanceFor, setAttendanceFor] = useState<{ group: GroupSession; date: string } | null>(null);
  const [attendanceDraft, setAttendanceDraft] = useState<Record<string, AttendanceStatus>>({});
  const [rosterPacks, setRosterPacks] = useState<SessionPack[]>([]);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [savedDate, setSavedDate] = useState<string | null>(null);

  const coachId = user?.role === "coach" ? user.coachId : undefined;
  const academyId = user?.role === "academy_admin" ? user.academyId : undefined;

  useEffect(() => {
    Promise.all([
      fetchGroupSessions(academyId, coachId),
      fetchPlayers(coachId, academyId),
      fetchCoaches(academyId),
    ]).then(([g, p, c]) => {
      setGroups(g);
      setPlayers(p);
      setCoaches(c);
      setLoading(false);
    });
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  function playerName(id: string) {
    return players.find((p) => p.id === id)?.name ?? "Unknown player";
  }

  function openAdd() {
    setDraft({ ...EMPTY_DRAFT, coachId: coachId ?? coaches[0]?.id ?? "" });
    setFormError("");
    setShowForm(true);
  }

  function openEdit(g: GroupSession) {
    setDraft({
      id: g.id, name: g.name, sessionType: g.sessionType, dayOfWeek: g.dayOfWeek,
      time: g.time, durationMins: g.durationMins, location: g.location,
      coachId: g.coachId, playerIds: g.playerIds,
    });
    setFormError("");
    setShowForm(true);
  }

  function toggleDraftPlayer(playerId: string) {
    setDraft((prev) => ({
      ...prev,
      playerIds: prev.playerIds.includes(playerId)
        ? prev.playerIds.filter((id) => id !== playerId)
        : [...prev.playerIds, playerId],
    }));
  }

  async function handleSaveGroup() {
    if (!draft.name.trim()) { setFormError("Name is required."); return; }
    if (!draft.coachId) { setFormError("A coach is required."); return; }
    if (!academyId && !draft.id && user?.role !== "platform_admin") { setFormError("No academy in scope."); return; }
    setSaving(true);
    setFormError("");
    try {
      const id = draft.id ?? `gs${Date.now()}`;
      const resolvedAcademyId = academyId ?? groups.find((g) => g.id === draft.id)?.academyId ?? coaches.find((c) => c.id === draft.coachId)?.academyId ?? "";
      await upsertGroupSession({
        id,
        academy_id: resolvedAcademyId,
        coach_id: draft.coachId,
        name: draft.name.trim(),
        session_type: draft.sessionType,
        day_of_week: draft.dayOfWeek,
        time: draft.time,
        duration_mins: draft.durationMins,
        location: draft.location.trim() || null,
        active: true,
      });
      await setGroupSessionRoster(id, draft.playerIds);
      const saved: GroupSession = {
        id, academyId: resolvedAcademyId, coachId: draft.coachId, name: draft.name.trim(),
        sessionType: draft.sessionType, dayOfWeek: draft.dayOfWeek, time: draft.time,
        durationMins: draft.durationMins, location: draft.location.trim(), active: true,
        playerIds: draft.playerIds,
      };
      setGroups((prev) => {
        const exists = prev.some((g) => g.id === id);
        return exists ? prev.map((g) => (g.id === id ? saved : g)) : [...prev, saved];
      });
      setShowForm(false);
    } catch (err) {
      setFormError((err as { message?: string })?.message ?? String(err));
    }
    setSaving(false);
  }

  async function toggleExpand(group: GroupSession) {
    if (expandedId === group.id) { setExpandedId(null); return; }
    setExpandedId(group.id);
    if (!pastDates[group.id]) {
      const occ = await fetchPastOccurrences(group.id);
      setPastDates((prev) => ({ ...prev, [group.id]: occ }));
    }
  }

  async function openAttendance(group: GroupSession, date: string) {
    setSavedDate(null);
    setAttendanceFor({ group, date });
    const [existing, packs] = await Promise.all([
      fetchAttendanceForDate(group.id, date),
      fetchSessionPacks(group.playerIds),
    ]);
    setRosterPacks(packs);
    const byPlayer: Record<string, AttendanceStatus> = {};
    for (const p of group.playerIds) byPlayer[p] = "Absent";
    for (const rec of existing as AttendanceRecord[]) byPlayer[rec.playerId] = rec.status;
    setAttendanceDraft(byPlayer);
  }

  function activePackFor(playerId: string, sessionType: BookingType): SessionPack | undefined {
    return rosterPacks.find((pk) => pk.playerId === playerId && pk.sessionType === sessionType && pk.status === "Active" && pk.sessionsUsed < pk.totalSessions);
  }

  async function handleSaveAttendance() {
    if (!attendanceFor) return;
    setSavingAttendance(true);
    try {
      const records = attendanceFor.group.playerIds.map((playerId) => ({
        playerId, status: attendanceDraft[playerId] ?? "Absent",
      }));
      await saveAttendance(attendanceFor.group.id, attendanceFor.date, attendanceFor.group.sessionType, attendanceFor.group.academyId, records);
      setSavedDate(attendanceFor.date);
      const occ = await fetchPastOccurrences(attendanceFor.group.id);
      setPastDates((prev) => ({ ...prev, [attendanceFor.group.id]: occ }));
    } catch (err) {
      alert((err as { message?: string })?.message ?? String(err));
    }
    setSavingAttendance(false);
  }

  const upcomingByGroup = useMemo(() => {
    const from = todayIso();
    const to = new Date(Date.now() + WEEKS_AHEAD * 7 * 86400000).toISOString().split("T")[0];
    const out: Record<string, string[]> = {};
    for (const g of groups) out[g.id] = occurrenceDatesInRange(g.dayOfWeek, from, to);
    return out;
  }, [groups]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 rounded-full border-2 border-pace-green border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white mb-1">Attendance</h1>
          <p className="text-zinc-400 text-sm">Recurring group sessions — take attendance and draw down each player&apos;s own pack.</p>
        </div>
        <button type="button" onClick={openAdd}
          className="px-4 py-2 rounded-xl text-sm font-bold bg-pace-green text-black hover:opacity-90 transition-opacity cursor-pointer flex-shrink-0">
          + New Group
        </button>
      </div>

      {groups.length === 0 && (
        <div className="bg-surface rounded-2xl p-16 text-center">
          <p className="text-zinc-400 text-sm">No recurring group sessions yet.</p>
        </div>
      )}

      <div className="space-y-3">
        {groups.map((g) => {
          const isExpanded = expandedId === g.id;
          const upcoming = upcomingByGroup[g.id] ?? [];
          const past = pastDates[g.id] ?? [];
          return (
            <div key={g.id} className="bg-surface rounded-2xl border border-zinc-700/50 overflow-hidden">
              <div className="flex items-center gap-4 px-5 py-4 cursor-pointer" onClick={() => toggleExpand(g)}>
                <svg className={`text-zinc-500 flex-shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                  width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="m9 18 6-6-6-6" />
                </svg>
                <div className="flex-1 min-w-0">
                  <div className="text-white font-bold text-sm">{g.name}</div>
                  <div className="text-zinc-400 text-xs">
                    {DAY_NAMES[g.dayOfWeek]}s · {g.time} · {g.sessionType} · {g.playerIds.length} player{g.playerIds.length === 1 ? "" : "s"}
                  </div>
                </div>
                <button type="button" onClick={(e) => { e.stopPropagation(); openEdit(g); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 border border-zinc-700 hover:text-white hover:border-zinc-500 transition-colors flex-shrink-0">
                  Edit
                </button>
              </div>

              {isExpanded && (
                <div className="px-5 pb-5 border-t border-zinc-700/40 pt-4 space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Upcoming — tap a date to take attendance</p>
                    <div className="flex flex-wrap gap-2">
                      {upcoming.map((date) => {
                        const recorded = past.some((o) => o.date === date);
                        return (
                          <button key={date} type="button" onClick={() => openAttendance(g, date)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                              recorded ? "border-pace-green/50 bg-pace-green/10 text-pace-green" : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
                            }`}>
                            {new Date(date + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                            {recorded && " ✓"}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {past.filter((o) => !upcoming.includes(o.date)).length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Past attendance</p>
                      <div className="flex flex-wrap gap-2">
                        {past.filter((o) => !upcoming.includes(o.date)).map((o) => (
                          <button key={o.id} type="button" onClick={() => openAttendance(g, o.date)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-pace-green/50 bg-pace-green/10 text-pace-green cursor-pointer">
                            {new Date(o.date + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} ✓
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Create / Edit group modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8 overflow-y-auto" onClick={() => setShowForm(false)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative bg-surface rounded-2xl w-full max-w-lg shadow-2xl border border-zinc-700/60 my-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-zinc-700/50">
              <h2 className="text-white font-bold">{draft.id ? "Edit Group" : "New Group"}</h2>
              <button type="button" onClick={() => setShowForm(false)} className="text-zinc-400 hover:text-white transition-colors cursor-pointer text-xl leading-none p-1">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className={lbl}>Group Name *</label>
                <input type="text" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className={inp} placeholder="e.g. U14 Tuesday Nets" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Day of Week</label>
                  <select value={draft.dayOfWeek} onChange={(e) => setDraft({ ...draft, dayOfWeek: Number(e.target.value) })} className={inp}>
                    {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Time</label>
                  <input type="time" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} className={inp} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Session Type</label>
                  <select value={draft.sessionType} onChange={(e) => setDraft({ ...draft, sessionType: e.target.value as BookingType })} className={inp}>
                    {SESSION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Duration (mins)</label>
                  <input type="number" min={15} step={15} value={draft.durationMins}
                    onChange={(e) => setDraft({ ...draft, durationMins: parseInt(e.target.value, 10) || 60 })} className={inp} />
                </div>
              </div>
              <div>
                <label className={lbl}>Coach *</label>
                <select value={draft.coachId} onChange={(e) => setDraft({ ...draft, coachId: e.target.value })} className={inp}>
                  <option value="">— Select coach —</option>
                  {coaches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Location</label>
                <input type="text" value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} className={inp} placeholder="Optional" />
              </div>
              <div>
                <label className={lbl}>Roster ({draft.playerIds.length} selected)</label>
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                  {players.map((p) => {
                    const selected = draft.playerIds.includes(p.id);
                    return (
                      <button key={p.id} type="button" onClick={() => toggleDraftPlayer(p.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors cursor-pointer text-left ${
                          selected ? "border-pace-green/50 bg-pace-green/10" : "border-zinc-700 bg-ink hover:border-zinc-500"
                        }`}>
                        <div className="w-6 h-6 rounded-full bg-pace-green/20 flex items-center justify-center text-pace-green text-[10px] font-bold flex-shrink-0">
                          {p.name.split(" ").map((n) => n[0]).join("")}
                        </div>
                        <span className="text-sm text-white">{p.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {formError && <p className="text-red-400 text-sm">{formError}</p>}
            </div>
            <div className="flex items-center gap-3 px-6 pb-6 pt-2">
              <button type="button" onClick={handleSaveGroup} disabled={saving}
                className="px-6 py-3 rounded-xl text-sm font-bold bg-pace-green text-black hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-60">
                {saving ? "Saving…" : draft.id ? "Save Changes" : "Create Group"}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="px-6 py-3 rounded-xl text-sm font-medium text-zinc-400 border border-zinc-700 hover:text-white hover:border-zinc-500 transition-colors cursor-pointer">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Take attendance modal */}
      {attendanceFor && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8 overflow-y-auto" onClick={() => setAttendanceFor(null)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative bg-surface rounded-2xl w-full max-w-md shadow-2xl border border-zinc-700/60 my-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-zinc-700/50">
              <div>
                <h2 className="text-white font-bold">{attendanceFor.group.name}</h2>
                <p className="text-zinc-400 text-xs">
                  {new Date(attendanceFor.date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "short", year: "numeric" })}
                </p>
              </div>
              <button type="button" onClick={() => setAttendanceFor(null)} className="text-zinc-400 hover:text-white transition-colors cursor-pointer text-xl leading-none p-1">✕</button>
            </div>
            <div className="px-6 py-5 space-y-2 max-h-[60vh] overflow-y-auto">
              {attendanceFor.group.playerIds.map((playerId) => {
                const status = attendanceDraft[playerId] ?? "Absent";
                const pack = activePackFor(playerId, attendanceFor.group.sessionType);
                return (
                  <div key={playerId} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-ink border border-zinc-700">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{playerName(playerId)}</div>
                      <div className="text-xs text-zinc-500">
                        {pack ? `${pack.sessionsUsed}/${pack.totalSessions} sessions used` : "No active pack — won't consume a session"}
                      </div>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button type="button" onClick={() => setAttendanceDraft((prev) => ({ ...prev, [playerId]: "Present" }))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                          status === "Present" ? "bg-pace-green text-black" : "bg-zinc-700/50 text-zinc-400 hover:text-white"
                        }`}>
                        Present
                      </button>
                      <button type="button" onClick={() => setAttendanceDraft((prev) => ({ ...prev, [playerId]: "Absent" }))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                          status === "Absent" ? "bg-red-500/80 text-white" : "bg-zinc-700/50 text-zinc-400 hover:text-white"
                        }`}>
                        Absent
                      </button>
                    </div>
                  </div>
                );
              })}
              {attendanceFor.group.playerIds.length === 0 && (
                <p className="text-zinc-500 text-sm text-center py-4">No players in this group&apos;s roster yet — edit the group to add some.</p>
              )}
            </div>
            <div className="flex items-center gap-3 px-6 pb-6 pt-2">
              <button type="button" onClick={handleSaveAttendance} disabled={savingAttendance || attendanceFor.group.playerIds.length === 0}
                className={`px-6 py-3 rounded-xl text-sm font-bold transition-all cursor-pointer disabled:opacity-60 ${
                  savedDate === attendanceFor.date ? "bg-pace-green/60 text-black" : "bg-pace-green text-black hover:opacity-90"
                }`}>
                {savingAttendance ? "Saving…" : savedDate === attendanceFor.date ? "✓ Saved" : "Save Attendance"}
              </button>
              <button type="button" onClick={() => setAttendanceFor(null)}
                className="px-6 py-3 rounded-xl text-sm font-medium text-zinc-400 border border-zinc-700 hover:text-white hover:border-zinc-500 transition-colors cursor-pointer">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inp = "w-full bg-ink rounded-xl px-4 py-3 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm";
const lbl = "block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5";
