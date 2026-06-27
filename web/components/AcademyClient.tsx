"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import type { Academy, AgeGroup, AcademyStage, Player, BowlingStyle } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { fetchAcademies, fetchPlayers, upsertAcademy, deleteAcademy, insertPlayer } from "@/lib/db";

const AGE_GROUPS: AgeGroup[] = ["U10", "U11", "U12", "U13", "U14", "U16", "U19", "Senior"];
const STAGES: AcademyStage[] = ["Foundation", "Mechanics", "Velocity", "Elite"];
const BOWLING_STYLES: BowlingStyle[] = [
  "Right Arm Fast", "Left Arm Fast", "Right Arm Fast-Medium",
  "Left Arm Fast-Medium", "Right Arm Medium", "Left Arm Medium",
];

const STAGE_STYLES: Record<AcademyStage, string> = {
  Foundation: "bg-blue-500/20 text-blue-400",
  Mechanics: "bg-amber/20 text-amber",
  Velocity: "bg-fire/20 text-fire",
  Elite: "bg-pace-green/20 text-pace-green",
};

const SESSION_TYPES = [
  "Net Session", "Individual Coaching", "Video Review",
  "Fitness Assessment", "Match Practice", "Warm-up / Conditioning",
] as const;

function totalPlayers(counts: Partial<Record<AgeGroup, number>>): number {
  return Object.values(counts).reduce((s, n) => s + (n ?? 0), 0);
}
function activeGroups(counts: Partial<Record<AgeGroup, number>>): AgeGroup[] {
  return AGE_GROUPS.filter((g) => (counts[g] ?? 0) > 0);
}

type DraftAcademy = Omit<Academy, "id">;

const EMPTY_DRAFT: DraftAcademy = {
  name: "", description: "", location: "",
  playerCounts: {}, playerIds: [],
  stage: "Foundation", coachName: "",
  startDate: new Date().toISOString().split("T")[0],
  status: "Active", sessionFeeAud: 0, sessionTypeFees: {}, ageFees: {},
};

type NewPlayerDraft = {
  name: string; email: string; ageGroup: AgeGroup; bowlingStyle: BowlingStyle; club: string;
};

const EMPTY_NEW_PLAYER: NewPlayerDraft = {
  name: "", email: "", ageGroup: "U14", bowlingStyle: "Right Arm Fast", club: "",
};

export function AcademyClient() {
  const { user } = useAuth();
  const formRef = useRef<HTMLDivElement>(null);
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftAcademy>(EMPTY_DRAFT);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"All" | "Active" | "Inactive">("All");

  const [playerSearch, setPlayerSearch] = useState("");
  const [showNewPlayer, setShowNewPlayer] = useState(false);
  const [newPlayerDraft, setNewPlayerDraft] = useState<NewPlayerDraft>(EMPTY_NEW_PLAYER);
  const [newPlayerError, setNewPlayerError] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    Promise.all([fetchAcademies(), fetchPlayers()]).then(([a, p]) => {
      setAcademies(a);
      setAllPlayers(p);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function scrollToForm() {
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function openAdd() {
    setEditingId(null);
    setDraft({ ...EMPTY_DRAFT, startDate: new Date().toISOString().split("T")[0] });
    setPlayerSearch(""); setShowNewPlayer(false); setFormError("");
    setShowForm(true); scrollToForm();
  }

  function openEdit(academy: Academy) {
    setEditingId(academy.id);
    setDraft({
      name: academy.name, description: academy.description, location: academy.location,
      playerCounts: { ...academy.playerCounts }, playerIds: [...academy.playerIds],
      stage: academy.stage, coachName: academy.coachName, startDate: academy.startDate,
      status: academy.status, sessionFeeAud: academy.sessionFeeAud,
      sessionTypeFees: { ...academy.sessionTypeFees },
      ageFees: { ...academy.ageFees },
    });
    setPlayerSearch(""); setShowNewPlayer(false); setFormError("");
    setShowForm(true); scrollToForm();
  }

  function closeForm() {
    setShowForm(false); setEditingId(null); setShowNewPlayer(false); setFormError("");
  }

  function handleSave() {
    if (!draft.name.trim()) { setFormError("Academy Name is required."); return; }
    setFormError("");
    const cleaned: Partial<Record<AgeGroup, number>> = {};
    for (const g of AGE_GROUPS) {
      const n = draft.playerCounts[g] ?? 0;
      if (n > 0) cleaned[g] = n;
    }
    const id = editingId ?? `ac${Date.now()}`;
    const cleanedAgeFees: Partial<Record<AgeGroup, number>> = {};
    for (const g of AGE_GROUPS) {
      const n = draft.ageFees[g] ?? 0;
      if (n > 0) cleanedAgeFees[g] = n;
    }

    const newAcademy: Academy = {
      id, name: draft.name.trim(), description: draft.description, location: draft.location,
      playerCounts: cleaned, playerIds: draft.playerIds, stage: draft.stage,
      coachName: draft.coachName, startDate: draft.startDate, status: draft.status,
      sessionFeeAud: draft.sessionFeeAud, sessionTypeFees: draft.sessionTypeFees,
      ageFees: cleanedAgeFees,
    };

    upsertAcademy({
      id, name: newAcademy.name, description: newAcademy.description, location: newAcademy.location,
      player_ids: newAcademy.playerIds, player_counts: newAcademy.playerCounts as Record<string, number>,
      stage: newAcademy.stage, coach_name: newAcademy.coachName, start_date: newAcademy.startDate,
      status: newAcademy.status, session_fee_aud: newAcademy.sessionFeeAud,
      session_type_fees: newAcademy.sessionTypeFees as Record<string, number>,
      age_fees: newAcademy.ageFees as Record<string, number>,
    });

    if (editingId) {
      setAcademies((prev) => prev.map((a) => (a.id === editingId ? newAcademy : a)));
    } else {
      setAcademies((prev) => [...prev, newAcademy]);
    }
    setSavedId(id);
    closeForm();
    setTimeout(() => setSavedId(null), 2500);
  }

  function handleDelete(id: string) {
    deleteAcademy(id);
    setAcademies((prev) => prev.filter((a) => a.id !== id));
    closeForm();
  }

  function setCount(group: AgeGroup, value: string) {
    const n = Math.max(0, parseInt(value) || 0);
    setDraft((prev) => ({ ...prev, playerCounts: { ...prev.playerCounts, [group]: n } }));
  }

  function togglePlayer(playerId: string) {
    setDraft((prev) => ({
      ...prev,
      playerIds: prev.playerIds.includes(playerId)
        ? prev.playerIds.filter((id) => id !== playerId)
        : [...prev.playerIds, playerId],
    }));
  }

  function handleAddNewPlayer() {
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

    insertPlayer({
      id: newId, name: newPlayer.name, email: newPlayer.email, phone: "",
      bowling_style: newPlayer.bowlingStyle, age_group: newPlayer.ageGroup,
      club: newPlayer.club, coach_assigned: "", guardian_consent_status: "Pending",
      added_date: now, sessions_count: 0, last_active: now, xp: 0,
      sub_plan: "Free", sub_start_date: now,
      sub_end_date: newPlayer.subscription.endDate,
      sub_sessions_used: 0, sub_sessions_limit: 4,
      bio_ball_speed_kmh: 0, bio_front_knee_angle_deg: 0, bio_action_type: "Side-on",
      bio_injury_risk: "Low", bio_last_session: now,
      acad_stage: "Foundation", acad_completion_percent: 0, acad_total_sessions: 0,
      acad_xp: 0, acad_articles_read: 0,
    });

    setAllPlayers((prev) => [...prev, newPlayer]);
    setDraft((prev) => ({ ...prev, playerIds: [...prev.playerIds, newId] }));
    setNewPlayerDraft(EMPTY_NEW_PLAYER);
    setNewPlayerError("");
    setShowNewPlayer(false);
  }

  const filteredPlayers = allPlayers.filter((p) =>
    p.name.toLowerCase().includes(playerSearch.toLowerCase()) ||
    p.ageGroup.toLowerCase().includes(playerSearch.toLowerCase()) ||
    p.club.toLowerCase().includes(playerSearch.toLowerCase())
  );

  const draftTotal = totalPlayers(draft.playerCounts);
  const filtered = filter === "All" ? academies : academies.filter((a) => a.status === filter);
  const activeCount = academies.filter((a) => a.status === "Active").length;
  const grandTotal = academies.reduce((s, a) => s + totalPlayers(a.playerCounts), 0);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
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
      <div className="grid grid-cols-3 gap-4 mb-8">
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

      {/* Add / Edit form */}
      {showForm && (
        <div ref={formRef} className="bg-surface rounded-2xl p-6 border border-pace-green/30 mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-pace-green mb-6">
            {editingId ? "Edit Academy" : "New Academy"}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
            <div className="sm:col-span-2">
              <label className={labelCls}>Academy Name</label>
              <input type="text" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className={inputCls} placeholder="e.g. Brisbane Fast Bowling Foundation" />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Description</label>
              <textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                className={`${inputCls} resize-none h-20`}
                placeholder="Program focus, objectives, curriculum overview…" />
            </div>
            <div>
              <label className={labelCls}>Location</label>
              <input type="text" value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                className={inputCls} placeholder="e.g. Brisbane, QLD" />
            </div>
            <div>
              <label className={labelCls}>Head Coach</label>
              <input type="text" value={draft.coachName} onChange={(e) => setDraft({ ...draft, coachName: e.target.value })}
                className={inputCls} placeholder="Coach name" />
            </div>
            <div>
              <label className={labelCls}>Academy Stage</label>
              <select value={draft.stage} onChange={(e) => setDraft({ ...draft, stage: e.target.value as AcademyStage })}
                className={selectCls}>
                {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Academy["status"] })}
                className={selectCls}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Start Date</label>
              <input type="date" value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
                className={inputCls} />
            </div>
          </div>

          {/* Session pricing */}
          <div className="mb-6 bg-ink rounded-2xl p-5">
            <label className={labelCls}>Default Session Fee (AUD per player)</label>
            <div className="flex items-center gap-4 mt-2 mb-5">
              <div className="relative flex-1 max-w-xs">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 text-sm font-semibold">$</span>
                <input type="number" min={0} step={5}
                  value={draft.sessionFeeAud === 0 ? "" : draft.sessionFeeAud}
                  onChange={(e) => setDraft({ ...draft, sessionFeeAud: parseFloat(e.target.value) || 0 })}
                  className={`${inputCls} pl-8`} placeholder="0.00" />
              </div>
              {draft.sessionFeeAud > 0 && (
                <div className="text-sm text-zinc-400 space-y-0.5">
                  <div>Platform fee: <span className="text-amber font-semibold">${(draft.sessionFeeAud * 0.10).toFixed(2)}</span> (10%)</div>
                  <div>Academy receives: <span className="text-pace-green font-semibold">${(draft.sessionFeeAud * 0.90).toFixed(2)}</span></div>
                </div>
              )}
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">Fee per session type</p>
            <div className="grid grid-cols-2 gap-3">
              {SESSION_TYPES.map((t) => {
                const val = draft.sessionTypeFees[t];
                return (
                  <div key={t}>
                    <label className="block text-xs text-zinc-500 mb-1">{t}</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">$</span>
                      <input type="number" min={0} step={5}
                        value={val === undefined || val === 0 ? "" : val}
                        onChange={(e) => {
                          const n = parseFloat(e.target.value) || 0;
                          setDraft({ ...draft, sessionTypeFees: { ...draft.sessionTypeFees, [t]: n } });
                        }}
                        className={`${inputCls} pl-7 py-2 text-sm`}
                        placeholder={draft.sessionFeeAud > 0 ? String(draft.sessionFeeAud) : "0"} />
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Age-based fees */}
            <div className="mt-5 pt-5 border-t border-zinc-700/60">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">Fee by age group</p>
              <p className="text-xs text-zinc-600 mb-3">Overrides the default fee for players in that age group. Leave blank to use default.</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {AGE_GROUPS.map((g) => {
                  const val = draft.ageFees[g];
                  return (
                    <div key={g}>
                      <label className="block text-xs text-zinc-500 mb-1">{g}</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">$</span>
                        <input type="number" min={0} step={5}
                          value={val === undefined || val === 0 ? "" : val}
                          onChange={(e) => {
                            const n = parseFloat(e.target.value) || 0;
                            setDraft({ ...draft, ageFees: { ...draft.ageFees, [g]: n } });
                          }}
                          className={`${inputCls} pl-7 py-2 text-sm`}
                          placeholder={draft.sessionFeeAud > 0 ? String(draft.sessionFeeAud) : "—"} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Player counts per age group */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <label className={labelCls}>Players per Age Group</label>
              <span className="text-sm font-bold text-pace-green">Total: {draftTotal}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {AGE_GROUPS.map((g) => {
                const val = draft.playerCounts[g] ?? 0;
                return (
                  <div key={g} className="bg-ink rounded-xl p-3">
                    <label className="block text-xs font-semibold text-zinc-400 mb-2">{g}</label>
                    <input type="number" min={0} value={val === 0 ? "" : val}
                      onChange={(e) => setCount(g, e.target.value)} placeholder="0"
                      className="w-full bg-transparent text-white text-lg font-bold border-b border-zinc-700 focus:border-pace-green focus:outline-none pb-1 transition-colors" />
                    <div className="text-xs text-zinc-500 mt-1">players</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Assign players */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <label className={labelCls}>
                Assign Players
                {draft.playerIds.length > 0 && (
                  <span className="ml-2 text-pace-green normal-case font-normal">
                    ({draft.playerIds.length} selected)
                  </span>
                )}
              </label>
              <button type="button" onClick={() => { setShowNewPlayer((v) => !v); setNewPlayerError(""); }}
                className="text-xs font-semibold text-pace-green hover:opacity-80 transition-opacity cursor-pointer">
                {showNewPlayer ? "Cancel" : "+ Add New Player"}
              </button>
            </div>

            {/* Inline new player form */}
            {showNewPlayer && (
              <div className="bg-ink rounded-xl p-4 mb-4 border border-pace-green/30">
                <p className="text-xs font-semibold uppercase tracking-wider text-pace-green mb-4">New Player</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
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
                </div>
                {newPlayerError && <p className="text-red-400 text-xs mb-3">{newPlayerError}</p>}
                <button type="button" onClick={handleAddNewPlayer}
                  className="px-4 py-2 bg-pace-green text-black text-xs font-bold rounded-lg hover:opacity-90 cursor-pointer">
                  Create & Assign
                </button>
              </div>
            )}

            <input type="text" value={playerSearch}
              onChange={(e) => setPlayerSearch(e.target.value)}
              className={`${inputCls} mb-3`}
              placeholder="Search players by name, age group or club…" />

            <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
              {filteredPlayers.length === 0 && (
                <p className="text-zinc-500 text-sm text-center py-6">No players found.</p>
              )}
              {filteredPlayers.map((p) => {
                const assigned = draft.playerIds.includes(p.id);
                return (
                  <button key={p.id} type="button" onClick={() => togglePlayer(p.id)}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border transition-colors cursor-pointer text-left ${
                      assigned ? "border-pace-green/50 bg-pace-green/10" : "border-zinc-700 bg-ink hover:border-zinc-500"
                    }`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-pace-green/20 flex items-center justify-center text-pace-green text-xs font-bold flex-shrink-0">
                        {p.name.split(" ").map((n) => n[0]).join("")}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white truncate">{p.name}</div>
                        <div className="text-xs text-zinc-400">
                          {p.ageGroup} · {p.bowlingStyle}{p.club ? ` · ${p.club}` : ""}
                        </div>
                      </div>
                    </div>
                    <span className={`text-xs font-semibold flex-shrink-0 ${assigned ? "text-pace-green" : "text-zinc-500"}`}>
                      {assigned ? "✓ Assigned" : "Assign"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {formError && <p className="text-red-400 text-sm mb-3">{formError}</p>}
          <div className="flex items-center gap-3">
            <button type="button" onClick={handleSave}
              className="px-6 py-2.5 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 transition-opacity cursor-pointer">
              {editingId ? "Save Changes" : "Create Academy"}
            </button>
            <button type="button" onClick={closeForm}
              className="px-6 py-2.5 text-sm font-medium text-zinc-400 border border-zinc-700 rounded-xl hover:text-white hover:border-zinc-500 transition-colors cursor-pointer">
              Cancel
            </button>
            {editingId && (
              <button type="button" onClick={() => handleDelete(editingId)}
                className="ml-auto px-4 py-2.5 text-sm font-medium text-red-400 border border-red-500/30 rounded-xl hover:bg-red-500/10 transition-colors cursor-pointer">
                Delete Academy
              </button>
            )}
          </div>
        </div>
      )}

      {/* Save success banner */}
      {savedId && !showForm && (
        <div className="mb-5 px-5 py-3 rounded-xl bg-pace-green/10 border border-pace-green/30 text-pace-green text-sm font-semibold">
          ✓ Academy saved successfully
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-5">
        {(["All", "Active", "Inactive"] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              filter === f ? "bg-pace-green text-black" : "bg-surface text-zinc-400 hover:text-white"
            }`}>
            {f}
          </button>
        ))}
      </div>

      {/* Academy cards */}
      {filtered.length === 0 ? (
        <div className="bg-surface rounded-2xl p-12 text-center">
          <p className="text-zinc-400 text-sm mb-4">No academies found.</p>
          <button type="button" onClick={openAdd}
            className="px-5 py-2.5 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 cursor-pointer">
            + Create First Academy
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((academy) => {
            const countTotal = totalPlayers(academy.playerCounts);
            const groups = activeGroups(academy.playerCounts);
            const assignedPlayers = allPlayers.filter((p) => academy.playerIds.includes(p.id));
            return (
              <div key={academy.id}
                className={`bg-surface rounded-2xl p-6 border transition-colors ${
                  savedId === academy.id ? "border-pace-green/50" : "border-transparent"
                }`}>
                {/* Card header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="text-white font-bold text-sm leading-tight">{academy.name}</h3>
                      {savedId === academy.id && (
                        <span className="text-pace-green text-xs font-semibold">✓ Saved</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STAGE_STYLES[academy.stage]}`}>
                        {academy.stage}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        academy.status === "Active" ? "bg-pace-green/20 text-pace-green" : "bg-zinc-700 text-zinc-400"
                      }`}>
                        {academy.status}
                      </span>
                    </div>
                  </div>
                  <button type="button" onClick={() => openEdit(academy)}
                    className="px-3 py-1.5 text-xs font-semibold text-zinc-300 border border-zinc-600 rounded-lg hover:border-pace-green hover:text-pace-green transition-colors cursor-pointer flex-shrink-0">
                    Edit
                  </button>
                </div>

                <p className="text-zinc-400 text-xs leading-relaxed mb-4 line-clamp-2">{academy.description}</p>

                {/* Meta */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <div className="text-xs text-zinc-500 mb-0.5">Location</div>
                    <div className="text-sm text-white">{academy.location || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500 mb-0.5">Head Coach</div>
                    <div className="text-sm text-white">{academy.coachName || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500 mb-0.5">Started</div>
                    <div className="text-sm text-white">
                      {new Date(academy.startDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500 mb-0.5">Session Fee</div>
                    <div className="text-sm font-bold text-pace-green">
                      {academy.sessionFeeAud > 0 ? `$${academy.sessionFeeAud} AUD` : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500 mb-0.5">Academy receives</div>
                    <div className="text-sm font-semibold text-white">
                      {academy.sessionFeeAud > 0 ? `$${(academy.sessionFeeAud * 0.90).toFixed(0)} AUD` : "—"}
                    </div>
                  </div>
                </div>

                {/* Per-group breakdown */}
                {groups.length > 0 && (
                  <div className="bg-ink rounded-xl p-3 mb-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Players by age group</span>
                      <span className="text-sm font-bold text-pace-green">{countTotal} total</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {groups.map((g) => (
                        <div key={g} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface border border-zinc-700">
                          <span className="text-xs text-zinc-400">{g}</span>
                          <span className="text-xs font-bold text-white">{academy.playerCounts[g]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Assigned players */}
                {assignedPlayers.length > 0 && (
                  <div className="bg-ink rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Assigned Players</span>
                      <span className="text-xs text-zinc-500">{assignedPlayers.length}</span>
                    </div>
                    <div className="space-y-1.5">
                      {assignedPlayers.map((p) => (
                        <div key={p.id} className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-6 h-6 rounded-full bg-pace-green/20 flex items-center justify-center text-pace-green text-xs font-bold flex-shrink-0">
                              {p.name.split(" ").map((n) => n[0]).join("")}
                            </div>
                            <span className="text-sm text-white truncate">{p.name}</span>
                            <span className="text-xs text-zinc-500 flex-shrink-0">{p.ageGroup}</span>
                          </div>
                          <Link href={`/players/${p.id}`}
                            className="text-xs text-pace-green hover:underline flex-shrink-0">
                            View →
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const inputCls = "w-full bg-ink rounded-xl px-4 py-3 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm";
const selectCls = "w-full bg-ink rounded-xl px-4 py-3 text-white border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm cursor-pointer";
const labelCls = "block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5";
