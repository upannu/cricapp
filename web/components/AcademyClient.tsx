"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import type { Academy, AgeGroup, AcademyStage, Player, BowlingStyle, Coach } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { fetchAcademies, fetchPlayers, fetchCoaches, upsertAcademy, insertPlayer } from "@/lib/db";

const AGE_GROUPS: AgeGroup[] = ["U10", "U11", "U12", "U13", "U14", "U16", "U19", "Senior"];
const STAGES: AcademyStage[] = ["Foundation", "Mechanics", "Velocity", "Elite"];
const BOWLING_STYLES: BowlingStyle[] = [
  "Right Arm Fast", "Left Arm Fast", "Right Arm Fast-Medium",
  "Left Arm Fast-Medium", "Right Arm Medium", "Left Arm Medium",
];

const STAGE_STYLES: Record<AcademyStage, string> = {
  Foundation: "bg-blue-500/20 text-blue-400",
  Mechanics:  "bg-amber/20 text-amber",
  Velocity:   "bg-fire/20 text-fire",
  Elite:      "bg-pace-green/20 text-pace-green",
};

const SESSION_TYPES = [
  "Net Session", "Individual Coaching", "Video Review",
  "Fitness Assessment", "Match Practice", "Warm-up / Conditioning",
] as const;

type DraftAcademy = {
  name: string; description: string; location: string;
  playerIds: string[]; coachIds: string[]; headCoachId: string;
  stage: AcademyStage; startDate: string;
  status: "Active" | "Inactive";
  sessionFeeAud: number;
  sessionTypeFees: Partial<Record<string, number>>;
  ageFees: Partial<Record<AgeGroup, number>>;
};

const EMPTY_DRAFT: DraftAcademy = {
  name: "", description: "", location: "",
  playerIds: [], coachIds: [], headCoachId: "",
  stage: "Foundation",
  startDate: new Date().toISOString().split("T")[0],
  status: "Active", sessionFeeAud: 0, sessionTypeFees: {}, ageFees: {},
};

type NewPlayerDraft = {
  name: string; email: string; ageGroup: AgeGroup; bowlingStyle: BowlingStyle; club: string;
};
const EMPTY_NEW_PLAYER: NewPlayerDraft = {
  name: "", email: "", ageGroup: "U14", bowlingStyle: "Right Arm Fast", club: "",
};

type SortOption = "name" | "players" | "newest" | "stage";
type ConfirmToggle = { id: string; name: string; newStatus: "Active" | "Inactive" };

export function AcademyClient() {
  const { user } = useAuth();

  // Data
  const [academies,   setAcademies]   = useState<Academy[]>([]);
  const [allPlayers,  setAllPlayers]  = useState<Player[]>([]);
  const [allCoaches,  setAllCoaches]  = useState<Coach[]>([]);

  // Accordion
  const [expandedId,      setExpandedId]      = useState<string | null>(null);
  const [tabMap,          setTabMap]          = useState<Record<string, "players" | "coaches" | "pricing">>({});
  const [activeGroupView, setActiveGroupView] = useState<{ academyId: string; ageGroup: AgeGroup } | null>(null);

  // 3-dot menu
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef                     = useRef<HTMLDivElement>(null);

  // Confirm status toggle
  const [confirmToggle, setConfirmToggle] = useState<ConfirmToggle | null>(null);
  const [toggling,      setToggling]      = useState(false);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft,     setDraft]     = useState<DraftAcademy>(EMPTY_DRAFT);
  const [formError, setFormError] = useState("");
  const [saving,    setSaving]    = useState(false);
  const [savedId,   setSavedId]   = useState<string | null>(null);

  // Player management inside modal
  const [playerSearch,   setPlayerSearch]   = useState("");
  const [showNewPlayer,  setShowNewPlayer]  = useState(false);
  const [newPlayerDraft, setNewPlayerDraft] = useState<NewPlayerDraft>(EMPTY_NEW_PLAYER);
  const [newPlayerError, setNewPlayerError] = useState("");

  // Filters
  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | "Active" | "Inactive">("All");
  const [stageFilter,  setStageFilter]  = useState<"All" | AcademyStage>("All");
  const [sortBy,       setSortBy]       = useState<SortOption>("name");

  useEffect(() => {
    Promise.all([fetchAcademies(), fetchPlayers(), fetchCoaches()]).then(([a, p, c]) => {
      setAcademies(a); setAllPlayers(p); setAllCoaches(c);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Close 3-dot menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    }
    if (openMenuId) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [openMenuId]);

  // ── Accordion ──────────────────────────────────────────────────────────────
  function getTab(id: string) { return tabMap[id] ?? "players"; }
  function setTab(id: string, tab: "players" | "coaches" | "pricing") {
    setTabMap((prev) => ({ ...prev, [id]: tab }));
  }
  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
    setActiveGroupView(null);
  }

  // ── 3-dot actions ──────────────────────────────────────────────────────────
  function handleMenuAction(action: "edit" | "toggleStatus", academy: Academy) {
    setOpenMenuId(null);
    if (action === "edit") { openEdit(academy); return; }
    setConfirmToggle({
      id: academy.id,
      name: academy.name,
      newStatus: academy.status === "Active" ? "Inactive" : "Active",
    });
  }

  async function handleConfirmToggle() {
    if (!confirmToggle) return;
    setToggling(true);
    try {
      await upsertAcademy({ id: confirmToggle.id, status: confirmToggle.newStatus });
      setAcademies((prev) =>
        prev.map((a) => a.id === confirmToggle.id ? { ...a, status: confirmToggle.newStatus } : a)
      );
    } catch (err) {
      console.error(err);
    }
    setToggling(false);
    setConfirmToggle(null);
  }

  // ── Modal helpers ──────────────────────────────────────────────────────────
  function openAdd() {
    setEditingId(null);
    setDraft({ ...EMPTY_DRAFT, startDate: new Date().toISOString().split("T")[0] });
    setPlayerSearch(""); setShowNewPlayer(false); setFormError("");
    setShowModal(true);
  }

  function openEdit(academy: Academy) {
    setEditingId(academy.id);
    setDraft({
      name: academy.name, description: academy.description, location: academy.location,
      playerIds: [...academy.playerIds], coachIds: [...(academy.coachIds ?? [])],
      headCoachId: academy.headCoachId ?? "",
      stage: academy.stage, startDate: academy.startDate, status: academy.status,
      sessionFeeAud: academy.sessionFeeAud,
      sessionTypeFees: { ...academy.sessionTypeFees },
      ageFees: { ...academy.ageFees },
    });
    setPlayerSearch(""); setShowNewPlayer(false); setFormError("");
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false); setEditingId(null);
    setShowNewPlayer(false); setFormError("");
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!draft.name.trim()) { setFormError("Academy Name is required."); return; }
    if (!draft.headCoachId) { setFormError("Please select an Academy Owner."); return; }
    setFormError(""); setSaving(true);

    const playerCounts: Partial<Record<AgeGroup, number>> = {};
    for (const pid of draft.playerIds) {
      const p = allPlayers.find((pl) => pl.id === pid);
      if (p) playerCounts[p.ageGroup] = (playerCounts[p.ageGroup] ?? 0) + 1;
    }
    const cleanedAgeFees: Partial<Record<AgeGroup, number>> = {};
    for (const g of AGE_GROUPS) {
      const n = draft.ageFees[g] ?? 0;
      if (n > 0) cleanedAgeFees[g] = n;
    }

    const headCoach = allCoaches.find((c) => c.id === draft.headCoachId);
    const id = editingId ?? `ac${Date.now()}`;
    const newAcademy: Academy = {
      id, name: draft.name.trim(), description: draft.description, location: draft.location,
      playerIds: draft.playerIds, playerCounts, coachIds: draft.coachIds,
      headCoachId: draft.headCoachId,
      stage: draft.stage, coachName: headCoach?.name ?? "",
      startDate: draft.startDate, status: draft.status,
      sessionFeeAud: draft.sessionFeeAud,
      sessionTypeFees: draft.sessionTypeFees,
      ageFees: cleanedAgeFees,
    };

    try {
      await upsertAcademy({
        id, name: newAcademy.name, description: newAcademy.description, location: newAcademy.location,
        player_ids: newAcademy.playerIds, player_counts: playerCounts as Record<string, number>,
        coach_ids: newAcademy.coachIds, head_coach_id: newAcademy.headCoachId,
        coach_name: newAcademy.coachName,
        stage: newAcademy.stage, start_date: newAcademy.startDate, status: newAcademy.status,
        session_fee_aud: newAcademy.sessionFeeAud,
        session_type_fees: newAcademy.sessionTypeFees as Record<string, number>,
        age_fees: cleanedAgeFees as Record<string, number>,
      });
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? String(err);
      setFormError(`Save failed: ${msg}`);
      setSaving(false); return;
    }

    setAcademies((prev) =>
      editingId ? prev.map((a) => (a.id === editingId ? newAcademy : a)) : [...prev, newAcademy]
    );
    setSaving(false); setSavedId(id); closeModal();
    setTimeout(() => setSavedId(null), 2500);
  }

  // ── Player / coach toggles ─────────────────────────────────────────────────
  function setOwner(coachId: string) {
    setDraft((prev) => ({
      ...prev,
      headCoachId: coachId,
      // auto-add owner to coachIds if not already there
      coachIds: coachId && !prev.coachIds.includes(coachId)
        ? [...prev.coachIds, coachId]
        : prev.coachIds,
    }));
  }

  function toggleCoach(coachId: string) {
    // owner is always in coachIds — cannot be removed from the additional list
    if (coachId === draft.headCoachId) return;
    setDraft((prev) => ({
      ...prev,
      coachIds: prev.coachIds.includes(coachId)
        ? prev.coachIds.filter((id) => id !== coachId)
        : [...prev.coachIds, coachId],
    }));
  }

  function togglePlayer(playerId: string) {
    setDraft((prev) => ({
      ...prev,
      playerIds: prev.playerIds.includes(playerId)
        ? prev.playerIds.filter((id) => id !== playerId)
        : [...prev.playerIds, playerId],
    }));
  }

  async function handleAddNewPlayer() {
    if (!newPlayerDraft.name.trim()) { setNewPlayerError("Name is required."); return; }
    const newId = `p_${Date.now()}`;
    const now = new Date().toISOString().split("T")[0];
    const newPlayer: Player = {
      id: newId, name: newPlayerDraft.name.trim(), email: newPlayerDraft.email.trim(),
      phone: "", ageGroup: newPlayerDraft.ageGroup, bowlingStyle: newPlayerDraft.bowlingStyle,
      club: newPlayerDraft.club.trim(), addedDate: now, coachAssigned: "",
      guardianConsentStatus: "Pending",
      subscription: {
        plan: "Free", startDate: now,
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        sessionsUsed: 0, sessionsLimit: 4,
      },
      biomechanics: { ballSpeedKmh: 0, frontKneeAngleDeg: 0, actionType: "Side-on", injuryRisk: "Low", lastSession: now },
      academy: { stage: "Foundation", completionPercent: 0, totalSessions: 0, xp: 0, articlesRead: 0 },
      sessionsCount: 0, lastActive: now, xp: 0,
    };
    await insertPlayer({
      id: newId, name: newPlayer.name, email: newPlayer.email, phone: "",
      bowling_style: newPlayer.bowlingStyle, age_group: newPlayer.ageGroup,
      club: newPlayer.club, coach_assigned: "", guardian_consent_status: "Pending",
      added_date: now, sessions_count: 0, last_active: now, xp: 0,
      sub_plan: "Free", sub_start_date: now, sub_end_date: newPlayer.subscription.endDate,
      sub_sessions_used: 0, sub_sessions_limit: 4,
      bio_ball_speed_kmh: 0, bio_front_knee_angle_deg: 0, bio_action_type: "Side-on",
      bio_injury_risk: "Low", bio_last_session: now,
      acad_stage: "Foundation", acad_completion_percent: 0, acad_total_sessions: 0,
      acad_xp: 0, acad_articles_read: 0,
    });
    setAllPlayers((prev) => [...prev, newPlayer]);
    setDraft((prev) => ({ ...prev, playerIds: [...prev.playerIds, newId] }));
    setNewPlayerDraft(EMPTY_NEW_PLAYER); setNewPlayerError(""); setShowNewPlayer(false);
  }

  // ── Filter / sort ──────────────────────────────────────────────────────────
  const displayed = [...academies]
    .filter((a) => {
      const q = search.toLowerCase();
      if (q && !a.name.toLowerCase().includes(q) && !a.location.toLowerCase().includes(q)) return false;
      if (statusFilter !== "All" && a.status !== statusFilter) return false;
      if (stageFilter !== "All" && a.stage !== stageFilter) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "name")    return a.name.localeCompare(b.name);
      if (sortBy === "players") return b.playerIds.length - a.playerIds.length;
      if (sortBy === "newest")  return b.startDate.localeCompare(a.startDate);
      if (sortBy === "stage")   return STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage);
      return 0;
    });

  const activeCount = academies.filter((a) => a.status === "Active").length;
  const grandTotal  = allPlayers.filter((p) => academies.some((a) => a.playerIds.includes(p.id))).length;

  const filteredPlayers = allPlayers.filter((p) =>
    p.name.toLowerCase().includes(playerSearch.toLowerCase()) ||
    p.ageGroup.toLowerCase().includes(playerSearch.toLowerCase()) ||
    p.club.toLowerCase().includes(playerSearch.toLowerCase())
  );

  // additional coaches = all coaches except the current owner
  const additionalCoaches = allCoaches.filter((c) => c.id !== draft.headCoachId);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto px-6 py-8">

      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Academies</h1>
          <p className="text-zinc-400 text-sm">Manage your fast bowling programs and cohorts</p>
        </div>
        {user?.role === "platform_admin" && (
          <button type="button" onClick={openAdd}
            className="px-5 py-2.5 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 transition-opacity cursor-pointer">
            + New Academy
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-surface rounded-2xl p-5 text-center">
          <div className="text-2xl font-bold text-white mb-1">{academies.length}</div>
          <div className="text-xs text-zinc-400">Total academies</div>
        </div>
        <div className="bg-surface rounded-2xl p-5 text-center">
          <div className="text-2xl font-bold text-pace-green mb-1">{activeCount}</div>
          <div className="text-xs text-zinc-400">Active programs</div>
        </div>
        <div className="bg-surface rounded-2xl p-5 text-center">
          <div className="text-2xl font-bold text-amber mb-1">{grandTotal}</div>
          <div className="text-xs text-zinc-400">Total players</div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-surface rounded-2xl p-4 mb-6 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or location…"
            className="w-full bg-ink rounded-xl pl-9 pr-4 py-2.5 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none text-sm" />
        </div>
        <div className="flex gap-1">
          {(["All", "Active", "Inactive"] as const).map((s) => (
            <button key={s} type="button" onClick={() => setStatusFilter(s)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                statusFilter === s ? "bg-pace-green text-black" : "bg-ink text-zinc-400 hover:text-white border border-zinc-700"
              }`}>{s}</button>
          ))}
        </div>
        <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value as "All" | AcademyStage)}
          className="bg-ink text-white text-sm rounded-xl px-3 py-2.5 border border-zinc-700 focus:border-pace-green focus:outline-none cursor-pointer">
          <option value="All">All Stages</option>
          {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOption)}
          className="bg-ink text-white text-sm rounded-xl px-3 py-2.5 border border-zinc-700 focus:border-pace-green focus:outline-none cursor-pointer">
          <option value="name">Sort: Name (A–Z)</option>
          <option value="players">Sort: Most Players</option>
          <option value="newest">Sort: Newest First</option>
          <option value="stage">Sort: Stage</option>
        </select>
      </div>

      {savedId && (
        <div className="mb-4 px-5 py-3 rounded-xl bg-pace-green/10 border border-pace-green/30 text-pace-green text-sm font-semibold">
          ✓ Academy saved successfully
        </div>
      )}

      {/* Accordion list */}
      {displayed.length === 0 ? (
        <div className="bg-surface rounded-2xl p-16 text-center">
          <p className="text-zinc-400 text-sm mb-4">No academies found.</p>
          {user?.role === "platform_admin" && (
            <button type="button" onClick={openAdd}
              className="px-5 py-2.5 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 cursor-pointer">
              + Create First Academy
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2" ref={menuRef}>
          {displayed.map((academy) => {
            const isExpanded      = expandedId === academy.id;
            const tab             = getTab(academy.id);
            const assignedPlayers = allPlayers.filter((p) => academy.playerIds.includes(p.id));
            const assignedCoaches = allCoaches.filter((c) => (academy.coachIds ?? []).includes(c.id));
            const headCoach       = allCoaches.find((c) => c.id === academy.headCoachId);
            const countsByGroup   = assignedPlayers.reduce((acc, p) => {
              acc[p.ageGroup] = (acc[p.ageGroup] ?? 0) + 1; return acc;
            }, {} as Partial<Record<AgeGroup, number>>);
            const ageGroupsPresent = AGE_GROUPS.filter((g) => (countsByGroup[g] ?? 0) > 0);
            const groupViewActive  = activeGroupView?.academyId === academy.id ? activeGroupView.ageGroup : null;
            const isMenuOpen       = openMenuId === academy.id;

            return (
              <div key={academy.id}
                className={`bg-surface rounded-2xl border transition-colors ${
                  savedId === academy.id ? "border-pace-green/50" : isExpanded ? "border-zinc-600" : "border-transparent"
                }`}>

                {/* ── Header row ── */}
                <div className="flex items-center gap-4 px-5 py-4">
                  {/* Chevron + name — clickable */}
                  <div className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer select-none"
                    onClick={() => toggleExpand(academy.id)}>
                    <svg className={`text-zinc-500 flex-shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="m9 18 6-6-6-6"/>
                    </svg>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-bold text-sm">{academy.name}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STAGE_STYLES[academy.stage]}`}>{academy.stage}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          academy.status === "Active" ? "bg-pace-green/20 text-pace-green" : "bg-zinc-700 text-zinc-400"
                        }`}>{academy.status}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        {academy.location && <span className="text-zinc-500 text-xs">📍 {academy.location}</span>}
                        {headCoach && (
                          <span className="text-zinc-500 text-xs flex items-center gap-1">
                            <span className="w-3.5 h-3.5 rounded-full bg-pace-green inline-flex items-center justify-center text-black font-bold text-[8px]">
                              {headCoach.name[0]}
                            </span>
                            {headCoach.name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="hidden sm:flex items-center gap-6 flex-shrink-0 cursor-pointer select-none"
                    onClick={() => toggleExpand(academy.id)}>
                    <div className="text-center">
                      <div className="text-sm font-bold text-pace-green">{assignedPlayers.length}</div>
                      <div className="text-[10px] text-zinc-500">Players</div>
                    </div>
                    <div className="text-center">
                      <div className="text-sm font-bold text-blue-400">{assignedCoaches.length}</div>
                      <div className="text-[10px] text-zinc-500">Coaches</div>
                    </div>
                    <div className="text-center">
                      <div className="text-sm font-bold text-white">{academy.sessionFeeAud > 0 ? `$${academy.sessionFeeAud}` : "—"}</div>
                      <div className="text-[10px] text-zinc-500">Fee/session</div>
                    </div>
                  </div>

                  {/* ⋮ menu */}
                  {user?.role === "platform_admin" && (
                    <div className="relative flex-shrink-0">
                      <button type="button"
                        onClick={(e) => { e.stopPropagation(); setOpenMenuId(isMenuOpen ? null : academy.id); }}
                        className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-colors cursor-pointer ${
                          isMenuOpen
                            ? "border-zinc-500 bg-zinc-700 text-white"
                            : "border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500"
                        }`}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
                        </svg>
                      </button>

                      {isMenuOpen && (
                        <div className="absolute right-0 top-10 z-30 w-44 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl py-1 overflow-hidden">
                          <button type="button"
                            onClick={() => handleMenuAction("edit", academy)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-200 hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer text-left">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                            Edit Academy
                          </button>
                          <div className="h-px bg-zinc-700 mx-3 my-1" />
                          <button type="button"
                            onClick={() => handleMenuAction("toggleStatus", academy)}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors cursor-pointer text-left ${
                              academy.status === "Active"
                                ? "text-amber hover:bg-amber/10"
                                : "text-pace-green hover:bg-pace-green/10"
                            }`}>
                            {academy.status === "Active" ? (
                              <>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/>
                                </svg>
                                Deactivate
                              </>
                            ) : (
                              <>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <circle cx="12" cy="12" r="10"/>
                                  <line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
                                </svg>
                                Activate
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ── Expanded panel ── */}
                {isExpanded && (
                  <div className="border-t border-zinc-700/60 px-5 pb-5">
                    <div className="flex gap-1 pt-4 mb-4">
                      {(["players", "coaches", "pricing"] as const).map((t) => (
                        <button key={t} type="button" onClick={() => setTab(academy.id, t)}
                          className={`px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors cursor-pointer ${
                            tab === t ? "bg-pace-green text-black" : "bg-ink text-zinc-400 hover:text-white"
                          }`}>
                          {t === "players" ? `Players (${assignedPlayers.length})`
                            : t === "coaches" ? `Coaches (${assignedCoaches.length})`
                            : "Pricing"}
                        </button>
                      ))}
                    </div>

                    {/* Players tab */}
                    {tab === "players" && (
                      assignedPlayers.length === 0 ? (
                        <p className="text-zinc-500 text-sm py-8 text-center">No players assigned. Edit the academy to assign players.</p>
                      ) : (
                        <>
                          {ageGroupsPresent.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-4">
                              {ageGroupsPresent.map((g) => {
                                const isActive = groupViewActive === g;
                                return (
                                  <button key={g} type="button"
                                    onClick={() => setActiveGroupView(isActive ? null : { academyId: academy.id, ageGroup: g })}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                                      isActive
                                        ? "bg-pace-green/20 border-pace-green text-pace-green"
                                        : "bg-ink border-zinc-700 text-zinc-400 hover:border-zinc-500"
                                    }`}>
                                    <span>{g}</span>
                                    <span className={`font-bold ${isActive ? "text-pace-green" : "text-white"}`}>{countsByGroup[g]}</span>
                                  </button>
                                );
                              })}
                              {groupViewActive && (
                                <button type="button" onClick={() => setActiveGroupView(null)}
                                  className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-white cursor-pointer">
                                  Show all
                                </button>
                              )}
                            </div>
                          )}
                          <div className="space-y-2">
                            {(groupViewActive
                              ? assignedPlayers.filter((p) => p.ageGroup === groupViewActive)
                              : assignedPlayers
                            ).map((p) => (
                              <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 bg-ink rounded-xl">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-8 h-8 rounded-full bg-pace-green/20 flex items-center justify-center text-pace-green text-xs font-bold flex-shrink-0">
                                    {p.name.split(" ").map((n) => n[0]).join("")}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="text-sm font-semibold text-white truncate">{p.name}</div>
                                    <div className="text-xs text-zinc-400">{p.ageGroup} · {p.bowlingStyle}</div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3 flex-shrink-0">
                                  <span className="text-xs text-zinc-500 hidden sm:block">
                                    Active {new Date(p.lastActive).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                                  </span>
                                  <Link href={`/players/${p.id}`} className="text-xs text-pace-green hover:underline">View →</Link>
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      )
                    )}

                    {/* Coaches tab */}
                    {tab === "coaches" && (
                      assignedCoaches.length === 0 ? (
                        <p className="text-zinc-500 text-sm py-8 text-center">No coaches assigned. Edit the academy to assign coaches.</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {assignedCoaches.map((c) => {
                            const isOwner = c.id === academy.headCoachId;
                            return (
                              <div key={c.id} className={`bg-ink rounded-xl p-4 flex items-start gap-3 ${isOwner ? "border border-pace-green/30" : ""}`}>
                                <div className="relative flex-shrink-0">
                                  <div className="w-10 h-10 rounded-full bg-pace-green flex items-center justify-center text-black font-bold text-sm">
                                    {c.name.split(" ").map((n) => n[0]).join("")}
                                  </div>
                                  {isOwner && (
                                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-pace-green rounded-full flex items-center justify-center text-black text-[8px] font-bold">★</span>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                    <span className="text-white font-semibold text-sm">{c.name}</span>
                                    {isOwner && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-pace-green/20 text-pace-green">Owner</span>}
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                      c.certificationLevel === "Elite" ? "bg-pace-green/20 text-pace-green" :
                                      c.certificationLevel === "Level 3" ? "bg-amber/20 text-amber" : "bg-zinc-700 text-zinc-400"
                                    }`}>{c.certificationLevel}</span>
                                  </div>
                                  <p className="text-zinc-400 text-xs mb-1">{c.specialization || "—"}</p>
                                  <p className="text-zinc-500 text-xs">{c.email}</p>
                                  {c.ageGroupsFocus.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                      {c.ageGroupsFocus.map((g) => (
                                        <span key={g} className="px-1.5 py-0.5 rounded bg-surface text-zinc-400 text-[10px]">{g}</span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )
                    )}

                    {/* Pricing tab */}
                    {tab === "pricing" && (
                      <div className="space-y-4">
                        <div className="bg-ink rounded-xl p-4">
                          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Default Session Fee</p>
                          <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-bold text-pace-green">
                              {academy.sessionFeeAud > 0 ? `$${academy.sessionFeeAud}` : "—"}
                            </span>
                            {academy.sessionFeeAud > 0 && <span className="text-zinc-400 text-sm">AUD per session</span>}
                          </div>
                          {academy.sessionFeeAud > 0 && (
                            <div className="flex gap-6 mt-1.5 text-xs text-zinc-400">
                              <span>Platform fee: <span className="text-amber font-semibold">${(academy.sessionFeeAud * 0.10).toFixed(2)}</span></span>
                              <span>Academy receives: <span className="text-pace-green font-semibold">${(academy.sessionFeeAud * 0.90).toFixed(2)}</span></span>
                            </div>
                          )}
                        </div>
                        {Object.entries(academy.sessionTypeFees).some(([, v]) => (v ?? 0) > 0) && (
                          <div className="bg-ink rounded-xl p-4">
                            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Fee by Session Type</p>
                            <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                              {Object.entries(academy.sessionTypeFees).map(([type, fee]) =>
                                (fee ?? 0) > 0 ? (
                                  <div key={type} className="flex items-center justify-between">
                                    <span className="text-xs text-zinc-400">{type}</span>
                                    <span className="text-xs font-bold text-white">${fee}</span>
                                  </div>
                                ) : null
                              )}
                            </div>
                          </div>
                        )}
                        {Object.keys(academy.ageFees).length > 0 && (
                          <div className="bg-ink rounded-xl p-4">
                            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Fee by Age Group</p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              {AGE_GROUPS.filter((g) => (academy.ageFees[g] ?? 0) > 0).map((g) => (
                                <div key={g} className="bg-surface rounded-lg p-2 text-center">
                                  <div className="text-xs text-zinc-400 mb-0.5">{g}</div>
                                  <div className="text-sm font-bold text-pace-green">${academy.ageFees[g]}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Confirm status toggle ── */}
      {confirmToggle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setConfirmToggle(null)} />
          <div className="relative bg-surface rounded-2xl w-full max-w-sm shadow-2xl border border-zinc-700/60 p-6">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${
              confirmToggle.newStatus === "Inactive" ? "bg-amber/20" : "bg-pace-green/20"
            }`}>
              {confirmToggle.newStatus === "Inactive" ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/>
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
            </div>
            <h3 className="text-white font-bold text-center mb-1">
              {confirmToggle.newStatus === "Inactive" ? "Deactivate Academy?" : "Activate Academy?"}
            </h3>
            <p className="text-zinc-400 text-sm text-center mb-6">
              {confirmToggle.newStatus === "Inactive"
                ? `"${confirmToggle.name}" will be marked Inactive. All players and data are preserved.`
                : `"${confirmToggle.name}" will be set back to Active.`}
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setConfirmToggle(null)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-zinc-400 border border-zinc-700 rounded-xl hover:text-white hover:border-zinc-500 transition-colors cursor-pointer">
                Cancel
              </button>
              <button type="button" onClick={handleConfirmToggle} disabled={toggling}
                className={`flex-1 px-4 py-2.5 text-sm font-bold rounded-xl transition-colors cursor-pointer disabled:opacity-60 ${
                  confirmToggle.newStatus === "Inactive"
                    ? "bg-amber/20 text-amber border border-amber/40 hover:bg-amber/30"
                    : "bg-pace-green text-black hover:opacity-90"
                }`}>
                {toggling ? "Saving…" : confirmToggle.newStatus === "Inactive" ? "Yes, Deactivate" : "Yes, Activate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit / New modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8 overflow-y-auto" onClick={closeModal}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative bg-surface rounded-2xl w-full max-w-2xl shadow-2xl border border-zinc-700/60 my-4"
            onClick={(e) => e.stopPropagation()}>

            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-zinc-700/50">
              <h2 className="text-white font-bold">{editingId ? "Edit Academy" : "New Academy"}</h2>
              <button type="button" onClick={closeModal}
                className="text-zinc-400 hover:text-white transition-colors cursor-pointer text-xl leading-none p-1">✕</button>
            </div>

            <div className="px-6 py-5 space-y-6 max-h-[76vh] overflow-y-auto">

              {/* Basic info */}
              <section>
                <p className={sectionLbl}>Basic Information</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className={lbl}>Academy Name *</label>
                    <input type="text" value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      className={inp} placeholder="e.g. Brisbane Fast Bowling Foundation" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={lbl}>Description</label>
                    <textarea value={draft.description}
                      onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                      className={`${inp} resize-none h-16`} placeholder="Program focus and objectives…" />
                  </div>
                  <div>
                    <label className={lbl}>Location</label>
                    <input type="text" value={draft.location}
                      onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                      className={inp} placeholder="e.g. Brisbane, QLD" />
                  </div>
                  <div>
                    <label className={lbl}>Start Date</label>
                    <input type="date" value={draft.startDate}
                      onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
                      className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Stage</label>
                    <select value={draft.stage}
                      onChange={(e) => setDraft({ ...draft, stage: e.target.value as AcademyStage })}
                      className={sel}>
                      {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Status</label>
                    <select value={draft.status}
                      onChange={(e) => setDraft({ ...draft, status: e.target.value as Academy["status"] })}
                      className={sel}>
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                </div>
              </section>

              {/* Coaches */}
              <section>
                <p className={sectionLbl}>Coaches</p>

                {allCoaches.length === 0 ? (
                  <p className="text-zinc-500 text-sm">No coaches yet — add coaches from the Coaches page first.</p>
                ) : (
                  <>
                    {/* Step 1 — Academy Owner (always visible, required) */}
                    <div className="mb-4">
                      <label className={lbl}>Academy Owner (Head Coach) *</label>
                      <p className="text-zinc-500 text-xs mb-2">The main person responsible for running this academy.</p>
                      <select
                        value={draft.headCoachId}
                        onChange={(e) => setOwner(e.target.value)}
                        className={sel}>
                        <option value="">— Select owner —</option>
                        {allCoaches.map((c) => (
                          <option key={c.id} value={c.id}>{c.name} · {c.certificationLevel}</option>
                        ))}
                      </select>
                      {/* Owner profile preview */}
                      {draft.headCoachId && (() => {
                        const owner = allCoaches.find((c) => c.id === draft.headCoachId);
                        if (!owner) return null;
                        return (
                          <div className="mt-2 flex items-center gap-3 px-3 py-2.5 bg-pace-green/10 border border-pace-green/30 rounded-xl">
                            <div className="w-8 h-8 rounded-full bg-pace-green flex items-center justify-center text-black text-xs font-bold flex-shrink-0">
                              {owner.name.split(" ").map((n) => n[0]).join("")}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-pace-green truncate">{owner.name}</div>
                              <div className="text-xs text-zinc-400">{owner.specialization || owner.certificationLevel} · {owner.email}</div>
                            </div>
                            <span className="ml-auto text-pace-green text-xs font-bold flex-shrink-0">★ Owner</span>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Step 2 — Additional coaches (optional, excludes owner) */}
                    {additionalCoaches.length > 0 && (
                      <div>
                        <label className={lbl}>
                          Additional Coaches
                          {draft.coachIds.length > 1 && (
                            <span className="text-pace-green normal-case font-normal ml-1">
                              ({draft.coachIds.length - 1} added)
                            </span>
                          )}
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {additionalCoaches.map((c) => {
                            const selected = draft.coachIds.includes(c.id);
                            return (
                              <button key={c.id} type="button" onClick={() => toggleCoach(c.id)}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                                  selected ? "border-pace-green/50 bg-pace-green/10" : "border-zinc-700 bg-ink hover:border-zinc-500"
                                }`}>
                                <div className="w-8 h-8 rounded-full bg-pace-green/40 flex items-center justify-center text-black text-xs font-bold flex-shrink-0">
                                  {c.name.split(" ").map((n) => n[0]).join("")}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-white truncate">{c.name}</div>
                                  <div className="text-xs text-zinc-400 truncate">{c.specialization || c.certificationLevel}</div>
                                </div>
                                <span className={`ml-auto text-xs font-bold flex-shrink-0 ${selected ? "text-pace-green" : "text-zinc-600"}`}>
                                  {selected ? "✓" : "+"}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </section>

              {/* Pricing */}
              <section>
                <p className={sectionLbl}>Pricing</p>
                <div className="bg-ink rounded-xl p-4 space-y-4">
                  <div>
                    <label className={lbl}>Default Session Fee (AUD)</label>
                    <div className="flex items-center gap-4">
                      <div className="relative max-w-xs flex-1">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 text-sm font-semibold">$</span>
                        <input type="number" min={0} step={5}
                          value={draft.sessionFeeAud === 0 ? "" : draft.sessionFeeAud}
                          onChange={(e) => setDraft({ ...draft, sessionFeeAud: parseFloat(e.target.value) || 0 })}
                          className={`${inp} pl-8`} placeholder="0.00" />
                      </div>
                      {draft.sessionFeeAud > 0 && (
                        <div className="text-xs text-zinc-400 space-y-0.5">
                          <div>Platform: <span className="text-amber font-semibold">${(draft.sessionFeeAud * 0.10).toFixed(2)}</span></div>
                          <div>Academy: <span className="text-pace-green font-semibold">${(draft.sessionFeeAud * 0.90).toFixed(2)}</span></div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Fee per session type</p>
                    <div className="grid grid-cols-2 gap-2">
                      {SESSION_TYPES.map((t) => (
                        <div key={t}>
                          <label className="block text-xs text-zinc-500 mb-1">{t}</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-xs">$</span>
                            <input type="number" min={0} step={5}
                              value={(draft.sessionTypeFees[t] ?? 0) === 0 ? "" : draft.sessionTypeFees[t]}
                              onChange={(e) => setDraft({ ...draft, sessionTypeFees: { ...draft.sessionTypeFees, [t]: parseFloat(e.target.value) || 0 } })}
                              className={`${inp} pl-6 py-2 text-sm`}
                              placeholder={draft.sessionFeeAud > 0 ? String(draft.sessionFeeAud) : "0"} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Fee by age group</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {AGE_GROUPS.map((g) => (
                        <div key={g}>
                          <label className="block text-xs text-zinc-500 mb-1">{g}</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-xs">$</span>
                            <input type="number" min={0} step={5}
                              value={(draft.ageFees[g] ?? 0) === 0 ? "" : draft.ageFees[g]}
                              onChange={(e) => setDraft({ ...draft, ageFees: { ...draft.ageFees, [g]: parseFloat(e.target.value) || 0 } })}
                              className={`${inp} pl-6 py-2 text-sm`} placeholder="—" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {/* Players */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <p className={sectionLbl}>
                    Players {draft.playerIds.length > 0 && (
                      <span className="text-pace-green normal-case font-normal">({draft.playerIds.length} assigned)</span>
                    )}
                  </p>
                  <button type="button" onClick={() => { setShowNewPlayer((v) => !v); setNewPlayerError(""); }}
                    className="text-xs font-semibold text-pace-green hover:opacity-80 cursor-pointer">
                    {showNewPlayer ? "Cancel" : "+ Add New Player"}
                  </button>
                </div>

                {showNewPlayer && (
                  <div className="bg-ink rounded-xl p-4 mb-3 border border-pace-green/30">
                    <p className="text-xs font-semibold uppercase tracking-wider text-pace-green mb-3">New Player</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className={lbl}>Full Name *</label>
                        <input type="text" value={newPlayerDraft.name}
                          onChange={(e) => setNewPlayerDraft({ ...newPlayerDraft, name: e.target.value })}
                          className={inp} placeholder="Player name" />
                      </div>
                      <div>
                        <label className={lbl}>Email</label>
                        <input type="email" value={newPlayerDraft.email}
                          onChange={(e) => setNewPlayerDraft({ ...newPlayerDraft, email: e.target.value })}
                          className={inp} placeholder="player@email.com" />
                      </div>
                      <div>
                        <label className={lbl}>Age Group</label>
                        <select value={newPlayerDraft.ageGroup}
                          onChange={(e) => setNewPlayerDraft({ ...newPlayerDraft, ageGroup: e.target.value as AgeGroup })}
                          className={sel}>
                          {AGE_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={lbl}>Bowling Style</label>
                        <select value={newPlayerDraft.bowlingStyle}
                          onChange={(e) => setNewPlayerDraft({ ...newPlayerDraft, bowlingStyle: e.target.value as BowlingStyle })}
                          className={sel}>
                          {BOWLING_STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <label className={lbl}>Club</label>
                        <input type="text" value={newPlayerDraft.club}
                          onChange={(e) => setNewPlayerDraft({ ...newPlayerDraft, club: e.target.value })}
                          className={inp} placeholder="Club name" />
                      </div>
                    </div>
                    {newPlayerError && <p className="text-red-400 text-xs mb-2">{newPlayerError}</p>}
                    <button type="button" onClick={handleAddNewPlayer}
                      className="px-4 py-2 bg-pace-green text-black text-xs font-bold rounded-lg hover:opacity-90 cursor-pointer">
                      Create & Assign
                    </button>
                  </div>
                )}

                <input type="text" value={playerSearch} onChange={(e) => setPlayerSearch(e.target.value)}
                  className={`${inp} mb-2`} placeholder="Search players…" />
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                  {filteredPlayers.map((p) => {
                    const assigned = draft.playerIds.includes(p.id);
                    return (
                      <button key={p.id} type="button" onClick={() => togglePlayer(p.id)}
                        className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border transition-colors cursor-pointer text-left ${
                          assigned ? "border-pace-green/50 bg-pace-green/10" : "border-zinc-700 bg-ink hover:border-zinc-500"
                        }`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-pace-green/20 flex items-center justify-center text-pace-green text-xs font-bold flex-shrink-0">
                            {p.name.split(" ").map((n) => n[0]).join("")}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-white truncate">{p.name}</div>
                            <div className="text-xs text-zinc-400">{p.ageGroup} · {p.club || p.bowlingStyle}</div>
                          </div>
                        </div>
                        <span className={`text-xs font-bold flex-shrink-0 ${assigned ? "text-pace-green" : "text-zinc-500"}`}>
                          {assigned ? "✓" : "+"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {formError && <p className="text-red-400 text-sm">{formError}</p>}
            </div>

            <div className="flex items-center gap-3 px-6 py-4 border-t border-zinc-700/50">
              <button type="button" onClick={handleSave} disabled={saving}
                className="px-6 py-2.5 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 cursor-pointer disabled:opacity-60">
                {saving ? "Saving…" : editingId ? "Save Changes" : "Create Academy"}
              </button>
              <button type="button" onClick={closeModal}
                className="px-4 py-2.5 text-sm font-medium text-zinc-400 border border-zinc-700 rounded-xl hover:text-white hover:border-zinc-500 transition-colors cursor-pointer">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inp        = "w-full bg-ink rounded-xl px-4 py-3 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm";
const sel        = "w-full bg-ink rounded-xl px-4 py-3 text-white border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm cursor-pointer";
const lbl        = "block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5";
const sectionLbl = "block text-xs font-bold uppercase tracking-wider text-zinc-300 mb-3";
