"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import Papa from "papaparse";
import { useAuth } from "@/lib/auth";
import { fetchPlayers, fetchAcademies, fetchCoaches, fetchActivePlans, insertPlayer, insertPlayers, updateAcademyFields } from "@/lib/db";
import { formatDate, getPlayerStatus, getInitials, getCoachOrAcademyLabel } from "@/lib/utils";
import type { Academy, AgeGroup, BowlingStyle, Coach, Player, PlayerStatus, Plan } from "@/lib/types";
import { MessageModal } from "@/components/MessageModal";
import { BulkMessageModal } from "@/components/BulkMessageModal";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { rosterCapForCoachPlan, sessionsLimitForPlan } from "@/lib/plan-features";

const AGE_GROUPS: AgeGroup[] = ["U10", "U11", "U12", "U13", "U14", "U16", "U19", "Senior"];
const BOWLING_STYLES: BowlingStyle[] = [
  "Right Arm Fast", "Left Arm Fast", "Right Arm Fast-Medium",
  "Left Arm Fast-Medium", "Right Arm Medium", "Left Arm Medium",
];
const EMPTY_NEW_PLAYER = { name: "", email: "", ageGroup: "U14" as AgeGroup, bowlingStyle: "Right Arm Fast" as BowlingStyle, club: "" };
const PLAYERS_PER_PAGE = 10;

// CSV import — same shape/behavior as AcademyClient's own (not shared as a module yet; ported
// deliberately rather than refactored, to avoid touching that already-shipped file for this).
type CsvRowStatus = "ready" | "warning" | "skipped" | "duplicate";
type ParsedCsvRow = {
  rowNum: number; name: string; email: string; ageGroup: AgeGroup; bowlingStyle: BowlingStyle;
  club: string; phone: string; status: CsvRowStatus; issues: string[];
};
const CSV_TEMPLATE = "name,email,ageGroup,bowlingStyle,club,phone\nJohn Smith,john@example.com,U14,Right Arm Fast,City Cricket Club,0412345678\n";

function normalizeAgeGroup(raw: string | undefined): { value: AgeGroup; matched: boolean } {
  const trimmed = (raw ?? "").trim();
  const found = AGE_GROUPS.find((g) => g.toLowerCase() === trimmed.toLowerCase());
  return found ? { value: found, matched: true } : { value: "U14", matched: false };
}

function normalizeBowlingStyle(raw: string | undefined): { value: BowlingStyle; matched: boolean } {
  const trimmed = (raw ?? "").trim();
  const found = BOWLING_STYLES.find((s) => s.toLowerCase() === trimmed.toLowerCase());
  return found ? { value: found, matched: true } : { value: "Right Arm Fast", matched: false };
}
const inputCls = "w-full bg-ink rounded-xl px-4 py-3 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm";
const selectCls = "w-full bg-ink rounded-xl px-4 py-3 text-white border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm cursor-pointer";
const labelCls = "block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5";

const statusStyles: Record<PlayerStatus, string> = {
  Active:   "bg-pace-green/15 text-pace-green",
  Expiring: "bg-amber/15 text-amber",
  Expired:  "bg-red-500/15 text-red-400",
};

const planStyles: Record<string, string> = {
  "Coach Pro":  "border-pace-green/50 text-pace-green",
  "Player Pro": "border-blue-400/50 text-blue-400",
  Free:         "border-zinc-600/50 text-zinc-400",
};

export function PlayersClient() {
  const { user } = useAuth();
  const [players, setPlayers] = useState<Player[]>([]);
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [messagingPlayer, setMessagingPlayer] = useState<Player | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMessaging, setBulkMessaging] = useState(false);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [newPlayerDraft, setNewPlayerDraft] = useState(EMPTY_NEW_PLAYER);
  const [addPlayerError, setAddPlayerError] = useState("");
  const [savingPlayer, setSavingPlayer] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [assignAcademyId, setAssignAcademyId] = useState(""); // platform_admin only — "" = unassigned
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [csvRows, setCsvRows] = useState<ParsedCsvRow[]>([]);
  const [csvFileName, setCsvFileName] = useState("");
  const [csvError, setCsvError] = useState("");
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvImportedCount, setCsvImportedCount] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    const coachId = user.role === "coach" ? user.coachId : undefined;
    const academyId = user.role === "academy_admin" ? user.academyId : undefined;
    Promise.all([fetchPlayers(coachId, academyId), fetchAcademies(), fetchCoaches(academyId), fetchActivePlans()]).then(([p, a, c, pl]) => {
      setPlayers(p);
      setAcademies(a);
      setCoaches(c);
      setPlans(pl);
    });
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const active    = players.filter((p) => getPlayerStatus(p.subscription.endDate) === "Active").length;
  const expiring  = players.filter((p) => getPlayerStatus(p.subscription.endDate) === "Expiring").length;
  const activeSubs = players.filter(
    (p) => p.subscription.plan !== "Free" && getPlayerStatus(p.subscription.endDate) === "Active"
  ).length;
  const totalSessions = players.reduce((s, p) => s + p.sessionsCount, 0);

  // An academy-employed coach adds players through the Academy page instead, onto that academy's
  // own roster — this "+ Add Player" was originally only for a coach with no academy at all, who
  // otherwise had no way to put anyone on their own roster. academy_admin and platform_admin also
  // get it here now: an academy_admin adds straight onto their own academy (same as the equivalent
  // button on that academy's own Players tab); platform_admin can pick any academy to add onto, or
  // leave a player unassigned for now.
  const ownCoach = user?.role === "coach" ? coaches.find((c) => c.id === user.coachId) : undefined;
  const isIndependentCoach = user?.role === "coach" && !!user.coachId && !ownCoach?.academyId;
  const canAddPlayers = isIndependentCoach || (user?.role === "academy_admin" && !!user.academyId) || user?.role === "platform_admin";
  const rosterCap = ownCoach ? rosterCapForCoachPlan(ownCoach.subPlan as "Free" | "Coach Pro", plans) : null;
  // The roster cap is a coach-plan concept only — academy_admin/platform_admin have no equivalent
  // limit here (an academy's own seat cap, if any, is enforced/surfaced on the Academy page).
  const atRosterCap = isIndependentCoach && rosterCap !== null && players.length >= rosterCap;

  const targetAcademyId = user?.role === "academy_admin" ? user.academyId : (user?.role === "platform_admin" ? assignAcademyId : undefined);
  const targetAcademy = targetAcademyId ? academies.find((a) => a.id === targetAcademyId) : undefined;

  async function handleAddPlayer() {
    if (atRosterCap) {
      setAddPlayerError(`Free plan is capped at ${rosterCap} players — upgrade to Coach Pro for an unlimited roster.`);
      return;
    }
    const name = newPlayerDraft.name.trim();
    if (!name) { setAddPlayerError("Name is required."); return; }
    const email = newPlayerDraft.email.trim();
    if (email && players.some((p) => p.email.toLowerCase() === email.toLowerCase())) {
      setAddPlayerError(`Another player already uses ${email} — each player needs a unique email.`);
      return;
    }
    setAddPlayerError("");
    setSavingPlayer(true);
    const newId = `p_${Date.now()}`;
    const now = new Date().toISOString().split("T")[0];
    const currency = isIndependentCoach ? (ownCoach?.currency ?? DEFAULT_CURRENCY) : (targetAcademy?.currency ?? DEFAULT_CURRENCY);
    const coachIdForNewPlayer = isIndependentCoach ? user!.coachId! : "";
    const freeSessionsLimit = sessionsLimitForPlan("Free", plans);
    const newPlayer: Player = {
      id: newId, name, email, phone: "", ageGroup: newPlayerDraft.ageGroup,
      bowlingStyle: newPlayerDraft.bowlingStyle, battingHand: "Right Hand", playingLevel: "Club",
      heightCm: null, weightKg: null, club: newPlayerDraft.club.trim(), addedDate: now,
      coachId: coachIdForNewPlayer, currency, guardianConsentStatus: "Pending",
      subscription: {
        plan: "Free", startDate: now,
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        sessionsUsed: 0, sessionsLimit: freeSessionsLimit,
      },
      biomechanics: { ballSpeedKmh: 0, frontKneeAngleDeg: 0, actionType: "Side-on", injuryRisk: "Low", lastSession: now },
      academy: { stage: "Foundation", completionPercent: 0, totalSessions: 0, xp: 0, articlesRead: 0 },
      sessionsCount: 0, lastActive: now, xp: 0,
      tipStreakCount: 0, tipBestStreak: 0,
      assessmentCredits: 0,
      loginDisabled: false, disabledAt: null, disabledReason: null,
    };
    try {
      await insertPlayer({
        id: newId, name: newPlayer.name, email: newPlayer.email, phone: "",
        bowling_style: newPlayer.bowlingStyle, age_group: newPlayer.ageGroup,
        club: newPlayer.club, coach_id: coachIdForNewPlayer || null, guardian_consent_status: "Pending",
        added_date: now, sessions_count: 0, last_active: now, xp: 0,
        sub_plan: "Free", sub_start_date: now, sub_end_date: newPlayer.subscription.endDate,
        sub_sessions_used: 0, sub_sessions_limit: freeSessionsLimit,
        bio_ball_speed_kmh: 0, bio_front_knee_angle_deg: 0, bio_action_type: "Side-on",
        bio_injury_risk: "Low", bio_last_session: now,
        acad_stage: "Foundation", acad_completion_percent: 0, acad_total_sessions: 0,
        acad_xp: 0, acad_articles_read: 0,
        currency,
      });

      if (targetAcademy) {
        const mergedPlayerIds = [...new Set([...targetAcademy.playerIds, newId])];
        const playerCounts: Partial<Record<AgeGroup, number>> = {};
        const allForCount = [...players, newPlayer].filter((p) => mergedPlayerIds.includes(p.id));
        for (const p of allForCount) playerCounts[p.ageGroup] = (playerCounts[p.ageGroup] ?? 0) + 1;
        await updateAcademyFields(targetAcademy.id, {
          player_ids: mergedPlayerIds,
          player_counts: playerCounts as Record<string, number>,
        });
        setAcademies((prev) => prev.map((a) =>
          a.id === targetAcademy.id ? { ...a, playerIds: mergedPlayerIds, playerCounts: playerCounts as Partial<Record<AgeGroup, number>> } : a
        ));
      }
    } catch (err) {
      setAddPlayerError((err as { message?: string })?.message ?? String(err));
      setSavingPlayer(false);
      return;
    }
    setPlayers((prev) => [...prev, newPlayer]);
    setNewPlayerDraft(EMPTY_NEW_PLAYER);
    setShowAddPlayer(false);
    setSavingPlayer(false);
    if (email) {
      fetch("/api/players/notify-added", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: newId, academyId: targetAcademy?.id }),
      }).catch(() => {});
    }
  }

  function downloadCsvTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "players-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleCsvFileSelected(file: File) {
    setCsvError(""); setCsvImportedCount(null); setCsvFileName(file.name);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          setCsvError(`Could not parse the file: ${results.errors[0].message}`);
          setCsvRows([]);
          return;
        }
        const existingEmails = new Set(players.map((p) => p.email.trim().toLowerCase()).filter(Boolean));
        const seenInFile = new Set<string>();
        const rows: ParsedCsvRow[] = results.data.map((raw, i) => {
          // papaparse's header matching is exact-case; accept common case variants of our columns.
          const get = (key: string) => raw[key] ?? raw[key.toLowerCase()] ?? raw[key.toUpperCase()] ?? "";
          const name = get("name").trim();
          const email = get("email").trim();
          const { value: ageGroup, matched: ageMatched } = normalizeAgeGroup(get("ageGroup") || get("age_group") || get("age group"));
          const { value: bowlingStyle, matched: styleMatched } = normalizeBowlingStyle(get("bowlingStyle") || get("bowling_style") || get("bowling style"));
          const club = get("club").trim();
          const phone = get("phone").trim();

          const issues: string[] = [];
          let status: CsvRowStatus = "ready";
          if (!name) { issues.push("Missing name"); status = "skipped"; }
          if (!email) { issues.push("Missing email"); status = "skipped"; }
          if (status !== "skipped") {
            const emailKey = email.toLowerCase();
            if (existingEmails.has(emailKey) || seenInFile.has(emailKey)) {
              issues.push("Email already used by another player");
              status = "duplicate";
            }
            seenInFile.add(emailKey);
            if (!ageMatched) issues.push(`Unrecognized age group — defaulted to ${ageGroup}`);
            if (!styleMatched) issues.push(`Unrecognized bowling style — defaulted to ${bowlingStyle}`);
            if (status === "ready" && (!ageMatched || !styleMatched)) status = "warning";
          }
          return { rowNum: i + 2, name, email, ageGroup, bowlingStyle, club, phone, status, issues };
        });
        setCsvRows(rows);
      },
      error: (err) => {
        setCsvError(err.message);
        setCsvRows([]);
      },
    });
  }

  async function handleCsvImport() {
    const importable = csvRows.filter((r) => r.status !== "skipped");
    if (importable.length === 0) return;
    setCsvImporting(true);
    setCsvError("");
    try {
      const now = new Date().toISOString().split("T")[0];
      const freeSessionsLimit = sessionsLimitForPlan("Free", plans);
      const currency = isIndependentCoach ? (ownCoach?.currency ?? DEFAULT_CURRENCY) : (targetAcademy?.currency ?? DEFAULT_CURRENCY);
      const coachIdForNewPlayers = isIndependentCoach ? user!.coachId! : "";
      const newPlayers: Player[] = importable.map((row, i) => ({
        id: `p_${Date.now()}_${i}`, name: row.name, email: row.email,
        phone: row.phone, ageGroup: row.ageGroup, bowlingStyle: row.bowlingStyle,
        battingHand: "Right Hand", playingLevel: "Club", heightCm: null, weightKg: null,
        club: row.club, addedDate: now, coachId: coachIdForNewPlayers,
        currency, guardianConsentStatus: "Pending",
        subscription: {
          plan: "Free", startDate: now,
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          sessionsUsed: 0, sessionsLimit: freeSessionsLimit,
        },
        biomechanics: { ballSpeedKmh: 0, frontKneeAngleDeg: 0, actionType: "Side-on", injuryRisk: "Low", lastSession: now },
        academy: { stage: "Foundation", completionPercent: 0, totalSessions: 0, xp: 0, articlesRead: 0 },
        sessionsCount: 0, lastActive: now, xp: 0,
        tipStreakCount: 0, tipBestStreak: 0,
        assessmentCredits: 0,
        loginDisabled: false, disabledAt: null, disabledReason: null,
      }));

      await insertPlayers(newPlayers.map((p) => ({
        id: p.id, name: p.name, email: p.email, phone: p.phone,
        bowling_style: p.bowlingStyle, age_group: p.ageGroup,
        club: p.club, coach_id: p.coachId || null, guardian_consent_status: "Pending",
        added_date: now, sessions_count: 0, last_active: now, xp: 0,
        sub_plan: "Free", sub_start_date: now, sub_end_date: p.subscription.endDate,
        sub_sessions_used: 0, sub_sessions_limit: freeSessionsLimit,
        bio_ball_speed_kmh: 0, bio_front_knee_angle_deg: 0, bio_action_type: "Side-on",
        bio_injury_risk: "Low", bio_last_session: now,
        acad_stage: "Foundation", acad_completion_percent: 0, acad_total_sessions: 0,
        acad_xp: 0, acad_articles_read: 0,
        currency: p.currency,
      })));

      if (targetAcademy) {
        const newPlayerIds = newPlayers.map((p) => p.id);
        const mergedPlayerIds = [...new Set([...targetAcademy.playerIds, ...newPlayerIds])];
        const playerCounts: Partial<Record<AgeGroup, number>> = {};
        const allForCount = [...players, ...newPlayers].filter((p) => mergedPlayerIds.includes(p.id));
        for (const p of allForCount) playerCounts[p.ageGroup] = (playerCounts[p.ageGroup] ?? 0) + 1;
        await updateAcademyFields(targetAcademy.id, {
          player_ids: mergedPlayerIds,
          player_counts: playerCounts as Record<string, number>,
        });
        setAcademies((prev) => prev.map((a) =>
          a.id === targetAcademy.id ? { ...a, playerIds: mergedPlayerIds, playerCounts: playerCounts as Partial<Record<AgeGroup, number>> } : a
        ));
      }

      setPlayers((prev) => [...prev, ...newPlayers]);
      setCsvImportedCount(newPlayers.length);
      setCsvRows([]);
      // Deliberately NOT clearing csvFileName here — the success message below reads it to say
      // which file was imported; clearing it first (as a near-identical AcademyClient.tsx code
      // path does) always shows a blank filename.

      for (const p of newPlayers) {
        if (!p.email.trim()) continue;
        fetch("/api/players/notify-added", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId: p.id, academyId: targetAcademy?.id }),
        }).catch(() => {});
      }
    } catch (err) {
      setCsvError((err as { message?: string })?.message ?? String(err));
    } finally {
      setCsvImporting(false);
    }
  }

  // Name, email, and club — the three fields visible enough that "search" reasonably implies them.
  const searchTerm = search.trim().toLowerCase();
  const filteredPlayers = searchTerm
    ? players.filter((p) =>
        p.name.toLowerCase().includes(searchTerm) ||
        p.email.toLowerCase().includes(searchTerm) ||
        p.club.toLowerCase().includes(searchTerm)
      )
    : players;

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1); // A new search can easily land fewer results than the page you were on.
  }

  // "Select all" (and its indeterminate state) only ever covers what's currently visible under
  // the active search — narrowing a search after selecting some players deliberately leaves the
  // now-hidden selections alone rather than silently dropping them.
  const allSelected = filteredPlayers.length > 0 && filteredPlayers.every((p) => selectedIds.has(p.id));
  const someSelected = filteredPlayers.some((p) => selectedIds.has(p.id)) && !allSelected;

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        filteredPlayers.forEach((p) => next.delete(p.id));
      } else {
        filteredPlayers.forEach((p) => next.add(p.id));
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  const selectedPlayers = players.filter((p) => selectedIds.has(p.id));

  // The stats cards above the table still summarize the whole roster regardless of search — only
  // the table itself (count, rows, pagination, select-all) reflects the filtered/searched list.
  // Clamp rather than reset so a shrinking result set (or just switching between coaches while
  // testing) can never strand the view on a now-nonexistent page.
  const totalPages = Math.max(1, Math.ceil(filteredPlayers.length / PLAYERS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pagePlayers = filteredPlayers.slice((currentPage - 1) * PLAYERS_PER_PAGE, currentPage * PLAYERS_PER_PAGE);

  return (
    <>
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Players</h1>
          <p className="text-zinc-400 text-sm mt-1">Manage your players and their subscriptions</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setSelectedIds(new Set(players.map((p) => p.id)));
            setBulkMessaging(true);
          }}
          className="flex-shrink-0 px-4 py-2 text-sm font-semibold text-blue-400 border border-blue-500/30 rounded-xl hover:bg-blue-500/10 transition-colors cursor-pointer"
        >
          ✉ Message All
        </button>
        {canAddPlayers && (
          atRosterCap ? (
            <Link
              href="/coach/subscription"
              className="flex-shrink-0 px-4 py-2 text-sm font-semibold text-amber border border-amber/40 rounded-xl hover:bg-amber/10 transition-colors"
            >
              Roster full ({rosterCap}) — Upgrade
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => { setShowAddPlayer((v) => !v); setAddPlayerError(""); }}
              className="flex-shrink-0 px-4 py-2 text-sm font-semibold text-pace-green border border-pace-green/40 rounded-xl hover:bg-pace-green/10 transition-colors cursor-pointer"
            >
              {showAddPlayer ? "Cancel" : "+ Add Player"}
            </button>
          )
        )}
      </div>

      <div className="relative mb-6 max-w-md">
        <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search players by name, email, or club…"
          className={`${inputCls} pl-10`}
        />
      </div>

      {canAddPlayers && showAddPlayer && !atRosterCap && (
        <div className="bg-surface rounded-2xl p-5 mb-6 border border-pace-green/30">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-pace-green">New Player</p>
            <button type="button" onClick={() => { setShowCsvImport((v) => !v); setCsvError(""); }}
              className="text-xs font-semibold text-pace-green hover:opacity-80 cursor-pointer">
              {showCsvImport ? "Cancel CSV" : "Import CSV instead"}
            </button>
          </div>
          {!showCsvImport && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
                <div>
                  <label className={labelCls}>Full Name *</label>
                  <input type="text" value={newPlayerDraft.name}
                    onChange={(e) => setNewPlayerDraft({ ...newPlayerDraft, name: e.target.value })}
                    className={inputCls} placeholder="Player name" />
                </div>
                <div>
                  <label className={labelCls}>Email</label>
                  <input type="email" value={newPlayerDraft.email}
                    onChange={(e) => setNewPlayerDraft({ ...newPlayerDraft, email: e.target.value })}
                    className={inputCls} placeholder="player@email.com" />
                </div>
                <div>
                  <label className={labelCls}>Age Group</label>
                  <select value={newPlayerDraft.ageGroup}
                    onChange={(e) => setNewPlayerDraft({ ...newPlayerDraft, ageGroup: e.target.value as AgeGroup })}
                    className={selectCls}>
                    {AGE_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Bowling Style</label>
                  <select value={newPlayerDraft.bowlingStyle}
                    onChange={(e) => setNewPlayerDraft({ ...newPlayerDraft, bowlingStyle: e.target.value as BowlingStyle })}
                    className={selectCls}>
                    {BOWLING_STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Club</label>
                  <input type="text" value={newPlayerDraft.club}
                    onChange={(e) => setNewPlayerDraft({ ...newPlayerDraft, club: e.target.value })}
                    className={inputCls} placeholder="Club name" />
                </div>
                {user?.role === "platform_admin" && (
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Assign to Academy (optional)</label>
                    <select value={assignAcademyId} onChange={(e) => setAssignAcademyId(e.target.value)} className={selectCls}>
                      <option value="">— Unassigned —</option>
                      {academies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
              {addPlayerError && <p className="text-red-400 text-xs mb-3">{addPlayerError}</p>}
              <button type="button" onClick={handleAddPlayer} disabled={savingPlayer}
                className="px-4 py-2.5 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-60">
                {savingPlayer ? "Adding…" : "Add Player"}
              </button>
            </>
          )}

          {showCsvImport && (
            <div className="bg-ink rounded-xl p-4 border border-pace-green/30">
              {user?.role === "platform_admin" && (
                <div className="mb-3">
                  <label className={labelCls}>Assign to Academy (optional)</label>
                  <select value={assignAcademyId} onChange={(e) => setAssignAcademyId(e.target.value)} className={selectCls}>
                    <option value="">— Unassigned —</option>
                    {academies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              )}
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-pace-green">Import Players from CSV</p>
                <button type="button" onClick={downloadCsvTemplate}
                  className="text-xs text-zinc-400 hover:text-white cursor-pointer underline">
                  Download template
                </button>
              </div>
              <p className="text-xs text-zinc-500 mb-3">
                Columns: <span className="text-zinc-300">name*, email*, ageGroup, bowlingStyle, club, phone</span>. Name and email are required — other columns fall back to sensible defaults if missing or unrecognized.
              </p>
              <input
                type="file" accept=".csv,text/csv"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvFileSelected(f); }}
                className="text-xs text-zinc-300 mb-3 cursor-pointer file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-pace-green file:text-black file:text-xs file:font-bold file:cursor-pointer"
              />
              {csvError && <p className="text-red-400 text-xs mb-2">{csvError}</p>}
              {csvImportedCount !== null && (
                <p className="text-pace-green text-xs mb-2">✓ Imported {csvImportedCount} player{csvImportedCount === 1 ? "" : "s"} from {csvFileName}.</p>
              )}
              {csvRows.length > 0 && (
                <>
                  <div className="max-h-64 overflow-y-auto rounded-lg border border-zinc-700 mb-3">
                    <table className="w-full text-xs">
                      <thead className="bg-zinc-800 sticky top-0">
                        <tr className="text-left text-zinc-400">
                          <th className="px-2 py-1.5">Row</th>
                          <th className="px-2 py-1.5">Name</th>
                          <th className="px-2 py-1.5">Email</th>
                          <th className="px-2 py-1.5">Age</th>
                          <th className="px-2 py-1.5">Style</th>
                          <th className="px-2 py-1.5">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {csvRows.map((row) => (
                          <tr key={row.rowNum} className="border-t border-zinc-800">
                            <td className="px-2 py-1.5 text-zinc-500">{row.rowNum}</td>
                            <td className="px-2 py-1.5 text-white">{row.name || "—"}</td>
                            <td className="px-2 py-1.5 text-zinc-300">{row.email || "—"}</td>
                            <td className="px-2 py-1.5 text-zinc-300">{row.ageGroup}</td>
                            <td className="px-2 py-1.5 text-zinc-300">{row.bowlingStyle}</td>
                            <td className="px-2 py-1.5">
                              <span
                                title={row.issues.join("; ")}
                                className={
                                  row.status === "ready" ? "text-pace-green"
                                  : row.status === "warning" ? "text-amber"
                                  : row.status === "duplicate" ? "text-fire"
                                  : "text-red-400"
                                }
                              >
                                {row.status === "ready" ? "✓ Ready"
                                  : row.status === "warning" ? "⚠ Defaulted field"
                                  : row.status === "duplicate" ? "⚠ Possible duplicate"
                                  : "✗ Skipped"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button type="button" onClick={handleCsvImport} disabled={csvImporting || csvRows.every((r) => r.status === "skipped")}
                    className="px-4 py-2 bg-pace-green text-black text-xs font-bold rounded-lg hover:opacity-90 cursor-pointer disabled:opacity-60">
                    {csvImporting ? "Importing…" : `Import ${csvRows.filter((r) => r.status !== "skipped").length} Player${csvRows.filter((r) => r.status !== "skipped").length === 1 ? "" : "s"}`}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Active Players" value={active} />
        <StatCard label="Active Subscriptions" value={activeSubs} />
        <StatCard label="Expiring in 7 Days" value={expiring} highlight={expiring > 0} />
        <StatCard label="Total Sessions" value={totalSessions} />
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="mb-4 flex items-center gap-3 bg-blue-500/10 border border-blue-500/30 rounded-xl px-4 py-3">
          <span className="text-blue-400 text-sm font-semibold">
            {selectedIds.size} player{selectedIds.size !== 1 ? "s" : ""} selected
          </span>
          <button
            type="button"
            onClick={() => setBulkMessaging(true)}
            className="px-3 py-1.5 text-xs font-semibold text-black bg-pace-green rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
          >
            ✉ Message Selected
          </button>
          <button
            type="button"
            onClick={clearSelection}
            className="text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer ml-auto"
          >
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-surface rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-700/60">
          <h2 className="text-base font-semibold text-white">
            {filteredPlayers.length} Player{filteredPlayers.length !== 1 ? "s" : ""}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-700/60">
                {["Player", "Coach", "Plan", "Status", "Start Date", "End / Renewal", "Sessions", "Last Active"].map(
                  (h) => (
                    <th
                      key={h}
                      className="text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider px-4 py-3 first:pl-6 whitespace-nowrap"
                    >
                      {h}
                    </th>
                  )
                )}
                <th className="text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider px-4 py-3 whitespace-nowrap">
                  Actions
                </th>
                <th className="text-center text-xs font-semibold text-zinc-400 uppercase tracking-wider px-4 py-3 pr-6 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span>Msg/Sms</span>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = someSelected; }}
                      onChange={toggleAll}
                      className="w-3.5 h-3.5 accent-pace-green cursor-pointer"
                      title="Select all"
                    />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {pagePlayers.map((player) => {
                const status = getPlayerStatus(player.subscription.endDate);
                const isSelected = selectedIds.has(player.id);
                return (
                  <tr
                    key={player.id}
                    className={`border-b border-zinc-700/40 last:border-0 transition-colors ${
                      isSelected
                        ? "bg-blue-500/5"
                        : status === "Expired"
                          ? "opacity-60 hover:bg-surface/80"
                          : "hover:bg-surface/80"
                    }`}
                  >
                    <td className="px-4 py-4 pl-6">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-pace-green/20 text-pace-green flex items-center justify-center text-sm font-bold flex-shrink-0">
                          {getInitials(player.name)}
                        </div>
                        <div>
                          <p className="text-white text-sm font-medium whitespace-nowrap">{player.name}</p>
                          <p className="text-zinc-400 text-xs">{player.bowlingStyle}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-zinc-300 text-xs whitespace-nowrap">{getCoachOrAcademyLabel(player, coaches, academies)}</td>
                    <td className="px-4 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${planStyles[player.subscription.plan] ?? planStyles["Free"]}`}>
                        {player.subscription.plan}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusStyles[status]}`}>
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-zinc-300 whitespace-nowrap">{formatDate(player.subscription.startDate)}</td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`text-sm font-medium ${status === "Expiring" ? "text-amber" : status === "Expired" ? "text-red-400" : "text-zinc-300"}`}>
                        {formatDate(player.subscription.endDate)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-zinc-300 font-mono">{player.sessionsCount}</td>
                    <td className="px-4 py-4 text-sm text-zinc-400 whitespace-nowrap">{formatDate(player.lastActive)}</td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/players/${player.id}`}
                          className="px-3 py-1.5 text-xs font-semibold text-pace-green border border-pace-green/40 rounded-lg hover:bg-pace-green/10 transition-colors"
                        >
                          View
                        </Link>
                        <button
                          type="button"
                          onClick={() => setMessagingPlayer(player)}
                          className="px-3 py-1.5 text-xs font-semibold text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-500/10 transition-colors cursor-pointer"
                          title="Send message"
                        >
                          ✉
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-4 pr-6 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(player.id)}
                        className="w-4 h-4 accent-pace-green cursor-pointer"
                        title="Select for bulk message"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredPlayers.length === 0 && (
            <div className="px-6 py-16 text-center text-zinc-400 text-sm">
              {searchTerm ? `No players match "${search.trim()}".` : "No players in your scope."}
            </div>
          )}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-zinc-700/60">
            <p className="text-xs text-zinc-400">
              Showing {(currentPage - 1) * PLAYERS_PER_PAGE + 1}–{Math.min(currentPage * PLAYERS_PER_PAGE, filteredPlayers.length)} of {filteredPlayers.length}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 text-xs font-semibold text-zinc-300 border border-zinc-700 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                ← Prev
              </button>
              <span className="text-xs text-zinc-400 px-1">Page {currentPage} of {totalPages}</span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 text-xs font-semibold text-zinc-300 border border-zinc-700 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>

    {messagingPlayer && (
      <MessageModal
        playerId={messagingPlayer.id}
        playerName={messagingPlayer.name}
        playerEmail={messagingPlayer.email}
        playerPhone={messagingPlayer.phone}
        onClose={() => setMessagingPlayer(null)}
      />
    )}

    {bulkMessaging && (
      <BulkMessageModal
        players={selectedPlayers}
        onClose={() => {
          setBulkMessaging(false);
          setSelectedIds(new Set());
        }}
      />
    )}
    </>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="bg-surface rounded-2xl p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">{label}</p>
      <p className={`text-3xl font-bold ${highlight ? "text-fire" : "text-white"}`}>{value}</p>
    </div>
  );
}
