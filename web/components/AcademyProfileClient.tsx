"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { Academy, AgeGroup, BowlingStyle, Coach, Player, Plan, Net, CertificationLevel } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import {
  fetchAcademy, fetchPlayers, fetchCoaches, fetchActivePlans, fetchNets,
  insertPlayer, upsertCoach, updateAcademyFields, upsertNet, deleteNet,
} from "@/lib/db";
import { RowActionsMenu } from "@/components/RowActionsMenu";
import { ConfirmModal } from "@/components/ConfirmModal";
import { CreditCardIcon, PowerIcon, PowerOffIcon } from "@/components/icons";
import { getPlatformFeePercent, isValidEmail } from "@/lib/utils";
import { sessionsLimitForPlan } from "@/lib/plan-features";
import { formatMoney } from "@/lib/currency";

const AGE_GROUPS: AgeGroup[] = ["U10", "U11", "U12", "U13", "U14", "U16", "U19", "Senior"];
const BOWLING_STYLES: BowlingStyle[] = [
  "Right Arm Fast", "Left Arm Fast", "Right Arm Fast-Medium",
  "Left Arm Fast-Medium", "Right Arm Medium", "Left Arm Medium",
];
const CERT_LEVELS: CertificationLevel[] = ["Level 1", "Level 2", "Level 3", "Elite"];

const STAGE_STYLES: Record<Academy["stage"], string> = {
  Foundation: "bg-blue-500/20 text-blue-400",
  Mechanics:  "bg-amber/20 text-amber",
  Velocity:   "bg-fire/20 text-fire",
  Elite:      "bg-pace-green/20 text-pace-green",
};

const inp = "w-full bg-ink rounded-xl px-4 py-3 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm";
const sel = "w-full bg-ink rounded-xl px-4 py-3 text-white border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm cursor-pointer";
const lbl = "block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5";

type NewPlayerDraft = { name: string; email: string; ageGroup: AgeGroup; bowlingStyle: BowlingStyle; club: string };
const EMPTY_NEW_PLAYER: NewPlayerDraft = { name: "", email: "", ageGroup: "U14", bowlingStyle: "Right Arm Fast", club: "" };

type NewCoachDraft = { name: string; email: string; phone: string; certificationLevel: CertificationLevel; specialization: string };
const EMPTY_NEW_COACH: NewCoachDraft = { name: "", email: "", phone: "", certificationLevel: "Level 1", specialization: "" };

type NetDraft = { name: string; dimensions: string };
const EMPTY_NET_DRAFT: NetDraft = { name: "", dimensions: "" };

// Module-scope, not inside the component body — see AcademyClient's own newNetId for why
// (an eslint purity-rule false positive tied to nesting depth, not a real render-time call).
function newNetId(): string {
  return `net${Date.now()}`;
}

/**
 * Academy's own detail page — the destination a click on the Academies list now navigates to
 * instead of expanding an accordion row in place. Hosts the exact same Players/Coaches/Pricing/
 * Nets tab management the accordion used to hold (moved here verbatim, just scoped to one academy
 * instead of one row inside a `.map()`), plus the same Billing/Edit Academy/Deactivate actions the
 * list row's own ⋮ menu offers — mirrors CoachProfileClient/PlayerProfileClient's own shape.
 *
 * Edit Academy has no dedicated page of its own yet (unlike Coach/Player) — the Add/Edit modal
 * still lives on the list page, so this just routes back there with `?edit=<id>` to reopen it.
 */
export function AcademyProfileClient({ academyId }: { academyId: string }) {
  const { user } = useAuth();

  const [academy,    setAcademy]    = useState<Academy | null>(null);
  const [notFound,   setNotFound]   = useState(false);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [allCoaches, setAllCoaches] = useState<Coach[]>([]);
  const [orgPlans,   setOrgPlans]   = useState<Plan[]>([]);
  const [allPlans,   setAllPlans]   = useState<Plan[]>([]);
  const [nets,       setNets]       = useState<Net[]>([]);

  const [tab, setTab] = useState<"players" | "coaches" | "pricing" | "nets" | null>(null);
  const [activeGroupView, setActiveGroupView] = useState<AgeGroup | null>(null);

  // Nets inline add/edit form
  const [showNetForm,  setShowNetForm]  = useState(false);
  const [editingNetId, setEditingNetId] = useState<string | null>(null);
  const [netDraft,     setNetDraft]     = useState<NetDraft>(EMPTY_NET_DRAFT);
  const [netError,     setNetError]     = useState("");
  const [confirmDeleteNetId, setConfirmDeleteNetId] = useState<string | null>(null);

  // Inline "add player"/"add coach" directly from the Players/Coaches tab
  const [tabAddPlayer,   setTabAddPlayer]   = useState(false);
  const [tabPlayerDraft, setTabPlayerDraft] = useState<NewPlayerDraft>(EMPTY_NEW_PLAYER);
  const [tabPlayerError, setTabPlayerError] = useState("");
  const [tabSavingPlayer, setTabSavingPlayer] = useState(false);
  const [tabAddCoach,    setTabAddCoach]    = useState(false);
  const [tabCoachDraft,  setTabCoachDraft]  = useState<NewCoachDraft>(EMPTY_NEW_COACH);
  const [tabCoachError,  setTabCoachError]  = useState("");
  const [tabSavingCoach, setTabSavingCoach] = useState(false);
  const [addingSelf,     setAddingSelf]     = useState(false);
  const [addSelfError,   setAddSelfError]   = useState("");

  // Deactivate/Activate
  const [confirmToggle, setConfirmToggle] = useState<{ newStatus: "Active" | "Inactive" } | null>(null);
  const [toggling,      setToggling]      = useState(false);
  const [formError,     setFormError]     = useState("");

  useEffect(() => {
    Promise.all([
      fetchAcademy(academyId),
      // Scoped straight off the academy's own player_ids column — safe, since Players carry no
      // academy_id of their own to go stale (see fetchPlayers' own comment).
      fetchPlayers(undefined, academyId),
      // NOT scoped by coach.academy_id — a coach added via this page's own "+ Add Coach"/"Add
      // Yourself" shortcuts is inserted with academy_id: null and only ever tracked via the
      // academy's coach_ids array, so that array (not the coach's own column) is the source of
      // truth for "assigned here", exactly as the list page's accordion always treated it.
      fetchCoaches(),
      fetchActivePlans(),
      fetchNets(academyId),
    ]).then(([a, p, c, plans, n]) => {
      if (!a) { setNotFound(true); return; }
      setAcademy(a);
      setAllPlayers(p);
      setAllCoaches(c);
      setOrgPlans(plans.filter((x) => x.audience === "organization"));
      setAllPlans(plans);
      setNets(n);
      setTab(user?.role === "academy_admin" && user.academyId === a.id ? "pricing" : "players");
    });
  }, [academyId, user]);

  if (notFound) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-16 text-center text-zinc-400">
        Academy not found.{" "}
        <Link href="/academy" className="text-pace-green hover:underline">
          Back to Academies
        </Link>
      </div>
    );
  }

  if (!academy || !tab) return null;

  const headCoach = allCoaches.find((c) => c.id === academy.headCoachId);
  const assignedPlayers = allPlayers;
  const assignedCoaches = allCoaches.filter((c) => (academy.coachIds ?? []).includes(c.id));
  const countsByGroup = assignedPlayers.reduce((acc, p) => {
    acc[p.ageGroup] = (acc[p.ageGroup] ?? 0) + 1; return acc;
  }, {} as Partial<Record<AgeGroup, number>>);
  const ageGroupsPresent = AGE_GROUPS.filter((g) => (countsByGroup[g] ?? 0) > 0);
  const academyNets = nets.filter((n) => n.academyId === academy.id);

  // ── Nets ────────────────────────────────────────────────────────────────
  function openAddNet() {
    setEditingNetId(null);
    setNetDraft(EMPTY_NET_DRAFT);
    setNetError("");
    setShowNetForm(true);
  }
  function openEditNet(net: Net) {
    setEditingNetId(net.id);
    setNetDraft({ name: net.name, dimensions: net.dimensions });
    setNetError("");
    setShowNetForm(true);
  }
  function closeNetForm() {
    setShowNetForm(false);
    setEditingNetId(null);
    setNetError("");
  }
  async function handleSaveNet() {
    if (!academy) return;
    if (!netDraft.name.trim()) { setNetError("Please give this net a name."); return; }
    setNetError("");
    const id = editingNetId ?? newNetId();
    const net: Net = { id, academyId: academy.id, name: netDraft.name.trim(), dimensions: netDraft.dimensions.trim() };
    try {
      await upsertNet({ id: net.id, academy_id: academy.id, name: net.name, dimensions: net.dimensions });
    } catch (err) {
      setNetError((err as { message?: string })?.message ?? String(err));
      return;
    }
    setNets((prev) => (editingNetId ? prev.map((n) => (n.id === editingNetId ? net : n)) : [...prev, net]));
    closeNetForm();
  }
  async function handleDeleteNet(id: string) {
    try {
      await deleteNet(id);
      setNets((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      setNetError((err as { message?: string })?.message ?? String(err));
    }
    setConfirmDeleteNetId(null);
  }

  // ── Players / Coaches tabs ─────────────────────────────────────────────────
  async function handleTabAddPlayer() {
    if (!academy) return;
    if (!tabPlayerDraft.name.trim()) { setTabPlayerError("Name is required."); return; }
    const email = tabPlayerDraft.email.trim();
    if (email && !isValidEmail(email)) { setTabPlayerError("Enter a valid email address, or leave it blank."); return; }
    setTabPlayerError(""); setTabSavingPlayer(true);
    const newId = `p_${Date.now()}`;
    const now = new Date().toISOString().split("T")[0];
    const freeSessionsLimit = sessionsLimitForPlan("Free", allPlans);
    const newPlayer: Player = {
      id: newId, name: tabPlayerDraft.name.trim(), email,
      phone: "", ageGroup: tabPlayerDraft.ageGroup, bowlingStyle: tabPlayerDraft.bowlingStyle,
      battingHand: "Right Hand", playingLevel: "Club", heightCm: null, weightKg: null,
      club: tabPlayerDraft.club.trim(), addedDate: now, coachId: "",
      currency: academy.currency,
      guardianConsentStatus: "Pending",
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
        club: newPlayer.club, coach_id: null, guardian_consent_status: "Pending",
        added_date: now, sessions_count: 0, last_active: now, xp: 0,
        sub_plan: "Free", sub_start_date: now, sub_end_date: newPlayer.subscription.endDate,
        sub_sessions_used: 0, sub_sessions_limit: freeSessionsLimit,
        bio_ball_speed_kmh: 0, bio_front_knee_angle_deg: 0, bio_action_type: "Side-on",
        bio_injury_risk: "Low", bio_last_session: now,
        acad_stage: "Foundation", acad_completion_percent: 0, acad_total_sessions: 0,
        acad_xp: 0, acad_articles_read: 0,
        currency: newPlayer.currency,
      });

      const mergedPlayerIds = [...new Set([...academy.playerIds, newId])];
      const playerCounts: Partial<Record<AgeGroup, number>> = {};
      const allForCount = [...allPlayers, newPlayer];
      for (const p of allForCount) playerCounts[p.ageGroup] = (playerCounts[p.ageGroup] ?? 0) + 1;
      await updateAcademyFields(academy.id, {
        player_ids: mergedPlayerIds,
        player_counts: playerCounts as Record<string, number>,
      });

      setAllPlayers((prev) => [...prev, newPlayer]);
      setAcademy((prev) => prev ? { ...prev, playerIds: mergedPlayerIds, playerCounts } : prev);
      setTabPlayerDraft(EMPTY_NEW_PLAYER);
      setTabAddPlayer(false);

      if (newPlayer.email.trim()) {
        fetch("/api/players/notify-added", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId: newId, academyId: academy.id }),
        }).catch(() => {});
        // A guardian who already has a parent/player account under this same email — signed up
        // before this player existed — never gets linked to them automatically otherwise.
        fetch("/api/players/relink-guardians", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerIds: [newId] }),
        }).catch(() => {});
      }
    } catch (err) {
      setTabPlayerError((err as { message?: string })?.message ?? String(err));
    } finally {
      setTabSavingPlayer(false);
    }
  }

  async function handleTabAddCoach() {
    if (!academy) return;
    if (!tabCoachDraft.name.trim()) { setTabCoachError("Name is required."); return; }
    const email = tabCoachDraft.email.trim();
    if (email && allCoaches.some((c) => c.email.toLowerCase() === email.toLowerCase())) {
      setTabCoachError(`Another coach already uses ${email} — each coach needs a unique email.`);
      return;
    }
    setTabCoachError(""); setTabSavingCoach(true);
    const newId = `c_${Date.now()}`;
    const now = new Date().toISOString().split("T")[0];
    const newCoach: Coach = {
      id: newId, name: tabCoachDraft.name.trim(), email, phone: tabCoachDraft.phone.trim(),
      specialization: tabCoachDraft.specialization.trim(), ageGroupsFocus: [], location: "",
      status: "Active", joinedDate: now, certificationLevel: tabCoachDraft.certificationLevel,
      bio: "", academyId: "", marketplaceVisible: false, available: true,
      stripeConnectOnboarded: false, currency: academy.currency, subPlan: "Free",
      loginDisabled: false, disabledAt: null, disabledReason: null,
    };
    try {
      await upsertCoach({
        id: newId, name: newCoach.name, email: newCoach.email, phone: newCoach.phone,
        specialization: newCoach.specialization, age_groups_focus: [],
        location: "", status: "Active", joined_date: now,
        certification_level: newCoach.certificationLevel, bio: "", academy_id: null,
        marketplace_visible: false, currency: academy.currency,
      });

      // Auto-set as head coach, same as the Edit Academy modal's own "+ Create New Coach" does.
      const mergedCoachIds = academy.coachIds.includes(newId) ? academy.coachIds : [...academy.coachIds, newId];
      await updateAcademyFields(academy.id, { coach_ids: mergedCoachIds, head_coach_id: newId });

      setAllCoaches((prev) => [...prev, newCoach]);
      setAcademy((prev) => prev ? { ...prev, coachIds: mergedCoachIds, headCoachId: newId } : prev);
      setTabCoachDraft(EMPTY_NEW_COACH);
      setTabAddCoach(false);
    } catch (err) {
      setTabCoachError((err as { message?: string })?.message ?? String(err));
    } finally {
      setTabSavingCoach(false);
    }
  }

  // One-click alternative to handleTabAddCoach for the common case: the person setting up the
  // academy IS the head coach. Only ever offered while the roster is empty, so there's no existing
  // owner this could accidentally displace.
  async function handleAddSelfAsCoach() {
    if (!user || !academy) return;
    if (allCoaches.some((c) => c.email.toLowerCase() === user.email.toLowerCase())) {
      setAddSelfError(`You already have a coach profile (${user.email}) — assign it as owner from the dropdown in Edit Academy instead.`);
      return;
    }
    setAddSelfError(""); setAddingSelf(true);
    const newId = `c_${Date.now()}`;
    const now = new Date().toISOString().split("T")[0];
    const newCoach: Coach = {
      id: newId, name: user.name, email: user.email, phone: "",
      specialization: "", ageGroupsFocus: [], location: "",
      status: "Active", joinedDate: now, certificationLevel: "Level 1",
      bio: "", academyId: "", marketplaceVisible: false, available: true,
      stripeConnectOnboarded: false, currency: academy.currency, subPlan: "Free",
      loginDisabled: false, disabledAt: null, disabledReason: null,
    };
    try {
      await upsertCoach({
        id: newId, name: newCoach.name, email: newCoach.email, phone: newCoach.phone,
        specialization: newCoach.specialization, age_groups_focus: [],
        location: "", status: "Active", joined_date: now,
        certification_level: newCoach.certificationLevel, bio: "", academy_id: null,
        marketplace_visible: false, currency: academy.currency,
      });

      const mergedCoachIds = academy.coachIds.includes(newId) ? academy.coachIds : [...academy.coachIds, newId];
      await updateAcademyFields(academy.id, { coach_ids: mergedCoachIds, head_coach_id: newId });

      setAllCoaches((prev) => [...prev, newCoach]);
      setAcademy((prev) => prev ? { ...prev, coachIds: mergedCoachIds, headCoachId: newId } : prev);
    } catch (err) {
      setAddSelfError((err as { message?: string })?.message ?? String(err));
    } finally {
      setAddingSelf(false);
    }
  }

  // ── Deactivate / Activate ────────────────────────────────────────────────
  async function handleConfirmToggle() {
    if (!confirmToggle || !academy) return;
    setToggling(true);
    try {
      await updateAcademyFields(academy.id, { status: confirmToggle.newStatus });
      setAcademy({ ...academy, status: confirmToggle.newStatus });
      setConfirmToggle(null);
    } catch (err) {
      setFormError((err as { message?: string })?.message ?? String(err));
    } finally {
      setToggling(false);
    }
  }

  const menuItems = user?.role === "platform_admin" ? [{
    label: academy.status === "Active" ? "Deactivate" : "Activate",
    variant: academy.status === "Active" ? "warning" as const : "success" as const,
    icon: academy.status === "Active" ? <PowerOffIcon width={14} height={14} /> : <PowerIcon width={14} height={14} />,
    onClick: () => { setFormError(""); setConfirmToggle({ newStatus: academy.status === "Active" ? "Inactive" : "Active" }); },
  }] : [];

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Back */}
      <div className="mb-6">
        <Link href="/academy" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors">
          ← Back to Academies
        </Link>
      </div>

      {/* Header card + actions */}
      <div className="bg-surface rounded-2xl p-6 mb-1 flex flex-wrap items-center justify-between gap-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
            <h1 className="text-2xl font-bold text-white">{academy.name}</h1>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${STAGE_STYLES[academy.stage]}`}>{academy.stage}</span>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
              academy.status === "Active" ? "bg-pace-green/20 text-pace-green" : "bg-zinc-700 text-zinc-400"
            }`}>{academy.status}</span>
          </div>
          <p className="text-zinc-400 text-sm flex items-center gap-3 flex-wrap">
            {academy.location && <span>📍 {academy.location}</span>}
            {headCoach && (
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-pace-green inline-flex items-center justify-center text-black font-bold text-[9px]">
                  {headCoach.name[0]}
                </span>
                {headCoach.name}
              </span>
            )}
            <span>{assignedPlayers.length} Players · {assignedCoaches.length} Coaches</span>
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href={`/academy?edit=${academy.id}`}
            className="px-5 py-2.5 text-sm font-semibold text-pace-green border border-pace-green/40 rounded-xl hover:bg-pace-green/10 transition-colors"
          >
            Edit Academy
          </Link>
          <Link
            href={`/academies/${academy.id}/billing`}
            className="px-5 py-2.5 bg-pace-green text-black rounded-xl text-sm font-bold hover:opacity-90 transition-opacity inline-flex items-center gap-1.5"
          >
            <CreditCardIcon width={14} height={14} /> Billing
          </Link>
          <RowActionsMenu items={menuItems} />
        </div>
      </div>

      {formError && !confirmToggle && (
        <div className="mt-3 mb-3 px-5 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold">
          {formError}
        </div>
      )}

      {/* Tab strip */}
      <div className="flex gap-1 mt-6 mb-4">
        {(["players", "coaches", "pricing", "nets"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors cursor-pointer ${
              tab === t ? "bg-pace-green text-black" : "bg-surface text-zinc-400 hover:text-white"
            }`}>
            {t === "players" ? `Players (${assignedPlayers.length})`
              : t === "coaches" ? `Coaches (${assignedCoaches.length})`
              : t === "pricing" ? "Pricing"
              : `Nets (${academyNets.length})`}
          </button>
        ))}
      </div>

      <div className="bg-surface rounded-2xl p-5">
        {/* Players tab */}
        {tab === "players" && (
          <>
            <div className="flex justify-end mb-3">
              <button type="button"
                onClick={() => { setTabAddPlayer((v) => !v); setTabPlayerError(""); }}
                className="text-xs font-semibold text-pace-green hover:opacity-80 cursor-pointer">
                {tabAddPlayer ? "Cancel" : "+ Add Player"}
              </button>
            </div>
            {tabAddPlayer && (
              <div className="bg-ink rounded-xl p-4 mb-3 border border-pace-green/30">
                <p className="text-xs font-semibold uppercase tracking-wider text-pace-green mb-3">New Player</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className={lbl}>Full Name *</label>
                    <input type="text" value={tabPlayerDraft.name}
                      onChange={(e) => setTabPlayerDraft({ ...tabPlayerDraft, name: e.target.value })}
                      className={inp} placeholder="Player name" />
                  </div>
                  <div>
                    <label className={lbl}>Email</label>
                    <input type="email" value={tabPlayerDraft.email}
                      onChange={(e) => setTabPlayerDraft({ ...tabPlayerDraft, email: e.target.value })}
                      className={inp} placeholder="player@email.com" />
                  </div>
                  <div>
                    <label className={lbl}>Age Group</label>
                    <select value={tabPlayerDraft.ageGroup}
                      onChange={(e) => setTabPlayerDraft({ ...tabPlayerDraft, ageGroup: e.target.value as AgeGroup })}
                      className={sel}>
                      {AGE_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Bowling Style</label>
                    <select value={tabPlayerDraft.bowlingStyle}
                      onChange={(e) => setTabPlayerDraft({ ...tabPlayerDraft, bowlingStyle: e.target.value as BowlingStyle })}
                      className={sel}>
                      {BOWLING_STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className={lbl}>Club</label>
                    <input type="text" value={tabPlayerDraft.club}
                      onChange={(e) => setTabPlayerDraft({ ...tabPlayerDraft, club: e.target.value })}
                      className={inp} placeholder="Club name" />
                  </div>
                </div>
                {tabPlayerError && <p className="text-red-400 text-xs mb-2">{tabPlayerError}</p>}
                <button type="button" onClick={handleTabAddPlayer} disabled={tabSavingPlayer}
                  className="px-4 py-2 bg-pace-green text-black text-xs font-bold rounded-lg hover:opacity-90 cursor-pointer disabled:opacity-60">
                  {tabSavingPlayer ? "Adding…" : "Create & Assign"}
                </button>
              </div>
            )}
            {assignedPlayers.length === 0 ? (
              <p className="text-zinc-500 text-sm py-8 text-center">No players assigned yet.</p>
            ) : (
              <>
              {ageGroupsPresent.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {ageGroupsPresent.map((g) => {
                    const isActive = activeGroupView === g;
                    return (
                      <button key={g} type="button"
                        onClick={() => setActiveGroupView(isActive ? null : g)}
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
                  {activeGroupView && (
                    <button type="button" onClick={() => setActiveGroupView(null)}
                      className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-white cursor-pointer">
                      Show all
                    </button>
                  )}
                </div>
              )}
              <div className="space-y-2">
                {(activeGroupView
                  ? assignedPlayers.filter((p) => p.ageGroup === activeGroupView)
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
            )}
          </>
        )}

        {/* Coaches tab */}
        {tab === "coaches" && (
          <>
            <div className="flex justify-end mb-3">
              <button type="button"
                onClick={() => { setTabAddCoach((v) => !v); setTabCoachError(""); }}
                className="text-xs font-semibold text-pace-green hover:opacity-80 cursor-pointer">
                {tabAddCoach ? "Cancel" : "+ Add Coach"}
              </button>
            </div>
            {tabAddCoach && (
              <div className="bg-ink rounded-xl p-4 mb-3 border border-pace-green/30">
                <p className="text-xs font-semibold uppercase tracking-wider text-pace-green mb-3">New Coach</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className={lbl}>Full Name *</label>
                    <input type="text" value={tabCoachDraft.name}
                      onChange={(e) => setTabCoachDraft({ ...tabCoachDraft, name: e.target.value })}
                      className={inp} placeholder="Coach full name" />
                  </div>
                  <div>
                    <label className={lbl}>Email</label>
                    <input type="email" value={tabCoachDraft.email}
                      onChange={(e) => setTabCoachDraft({ ...tabCoachDraft, email: e.target.value })}
                      className={inp} placeholder="coach@email.com" />
                  </div>
                  <div>
                    <label className={lbl}>Phone</label>
                    <input type="tel" value={tabCoachDraft.phone}
                      onChange={(e) => setTabCoachDraft({ ...tabCoachDraft, phone: e.target.value })}
                      className={inp} placeholder="04xx xxx xxx" />
                  </div>
                  <div>
                    <label className={lbl}>Certification Level</label>
                    <select value={tabCoachDraft.certificationLevel}
                      onChange={(e) => setTabCoachDraft({ ...tabCoachDraft, certificationLevel: e.target.value as CertificationLevel })}
                      className={sel}>
                      {CERT_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className={lbl}>Specialization</label>
                    <input type="text" value={tabCoachDraft.specialization}
                      onChange={(e) => setTabCoachDraft({ ...tabCoachDraft, specialization: e.target.value })}
                      className={inp} placeholder="e.g. Fast Bowling, Biomechanics" />
                  </div>
                </div>
                {tabCoachError && <p className="text-red-400 text-xs mb-2">{tabCoachError}</p>}
                <button type="button" onClick={handleTabAddCoach} disabled={tabSavingCoach}
                  className="px-4 py-2 bg-pace-green text-black text-xs font-bold rounded-lg hover:opacity-90 cursor-pointer disabled:opacity-60">
                  {tabSavingCoach ? "Adding…" : "Create & Assign"}
                </button>
              </div>
            )}
            {assignedCoaches.length === 0 ? (
              !tabAddCoach ? (
                <div className="space-y-2">
                  {addSelfError && <p className="text-red-400 text-xs">{addSelfError}</p>}
                  <button type="button"
                    onClick={handleAddSelfAsCoach}
                    disabled={addingSelf}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-ink border border-zinc-700 rounded-xl hover:border-pace-green transition-colors cursor-pointer disabled:opacity-60 text-left">
                    <span className="w-8 h-8 rounded-lg bg-pace-green/15 text-pace-green flex items-center justify-center text-sm font-bold flex-shrink-0">★</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-white">
                        {addingSelf ? "Adding…" : "Add Yourself as Head Coach"}
                      </span>
                      <span className="block text-xs text-zinc-500">Uses your own name &amp; email — one click</span>
                    </span>
                  </button>
                  <button type="button"
                    onClick={() => { setTabAddCoach(true); setTabCoachError(""); }}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-ink border border-zinc-700 rounded-xl hover:border-pace-green transition-colors cursor-pointer text-left">
                    <span className="w-8 h-8 rounded-lg bg-zinc-700/60 text-zinc-400 flex items-center justify-center text-sm font-bold flex-shrink-0">+</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-white">Create New Coach</span>
                      <span className="block text-xs text-zinc-500">For someone you&apos;ve hired to coach here</span>
                    </span>
                  </button>
                </div>
              ) : null
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
            )}
          </>
        )}

        {/* Pricing tab */}
        {tab === "pricing" && (
          <div className="space-y-4">
            <div className="bg-ink rounded-xl p-4">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Default Session Fee</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-pace-green">
                  {academy.sessionFeeAud > 0 ? formatMoney(academy.sessionFeeAud, academy.currency) : "—"}
                </span>
                {academy.sessionFeeAud > 0 && <span className="text-zinc-400 text-sm">{academy.currency.toUpperCase()} per session</span>}
              </div>
              {academy.sessionFeeAud > 0 && (() => {
                const feePct = getPlatformFeePercent(academy.id, [academy], orgPlans);
                return (
                  <div className="flex gap-6 mt-1.5 text-xs text-zinc-400">
                    <span>Platform fee ({feePct}%): <span className="text-amber font-semibold">{formatMoney(academy.sessionFeeAud * (feePct / 100), academy.currency)}</span></span>
                    <span>Academy receives: <span className="text-pace-green font-semibold">{formatMoney(academy.sessionFeeAud * (1 - feePct / 100), academy.currency)}</span></span>
                  </div>
                );
              })()}
            </div>
            {Object.entries(academy.sessionTypeFees).some(([, v]) => (v ?? 0) > 0) && (
              <div className="bg-ink rounded-xl p-4">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Fee by Session Type</p>
                <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                  {Object.entries(academy.sessionTypeFees).map(([type, fee]) =>
                    (fee ?? 0) > 0 ? (
                      <div key={type} className="flex items-center justify-between">
                        <span className="text-xs text-zinc-400">{type}</span>
                        <span className="text-xs font-bold text-white">{formatMoney(fee ?? 0, academy.currency)}</span>
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
                      <div className="text-sm font-bold text-pace-green">{formatMoney(academy.ageFees[g] ?? 0, academy.currency)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Nets tab */}
        {tab === "nets" && (
          <div className="space-y-3">
            {academyNets.length === 0 && !showNetForm && (
              <p className="text-zinc-500 text-sm py-4 text-center">No nets configured yet. Bookings for this academy will use free-text location until you add one.</p>
            )}
            {academyNets.map((net) => (
              <div key={net.id} className="flex items-center justify-between gap-3 px-4 py-3 bg-ink rounded-xl">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{net.name}</div>
                  {net.dimensions && <div className="text-xs text-zinc-400">{net.dimensions}</div>}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {confirmDeleteNetId === net.id ? (
                    <>
                      <span className="text-xs text-zinc-400">Delete this net?</span>
                      <button type="button" onClick={() => handleDeleteNet(net.id)} className="text-xs font-semibold text-red-400 hover:underline cursor-pointer">Confirm</button>
                      <button type="button" onClick={() => setConfirmDeleteNetId(null)} className="text-xs text-zinc-400 hover:text-white cursor-pointer">Cancel</button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => openEditNet(net)} className="text-xs text-pace-green hover:underline cursor-pointer">Edit</button>
                      <button type="button" onClick={() => setConfirmDeleteNetId(net.id)} className="text-xs text-red-400 hover:underline cursor-pointer">Delete</button>
                    </>
                  )}
                </div>
              </div>
            ))}

            {showNetForm ? (
              <div className="bg-ink rounded-xl p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Name *</label>
                    <input type="text" value={netDraft.name} onChange={(e) => setNetDraft({ ...netDraft, name: e.target.value })}
                      className="w-full bg-surface rounded-xl px-4 py-2.5 text-white border border-zinc-700 focus:border-pace-green focus:outline-none text-sm"
                      placeholder="e.g. Net 1" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Dimensions</label>
                    <input type="text" value={netDraft.dimensions} onChange={(e) => setNetDraft({ ...netDraft, dimensions: e.target.value })}
                      className="w-full bg-surface rounded-xl px-4 py-2.5 text-white border border-zinc-700 focus:border-pace-green focus:outline-none text-sm"
                      placeholder="e.g. 30m x 3.5m" />
                  </div>
                </div>
                {netError && <p className="text-red-400 text-xs">{netError}</p>}
                <div className="flex items-center gap-3">
                  <button type="button" onClick={handleSaveNet}
                    className="px-4 py-2 text-sm font-bold bg-pace-green text-black rounded-xl hover:opacity-90 transition-opacity cursor-pointer">
                    {editingNetId ? "Save Changes" : "Add Net"}
                  </button>
                  <button type="button" onClick={closeNetForm}
                    className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors cursor-pointer">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={openAddNet}
                className="px-4 py-2 text-sm font-semibold text-pace-green border border-pace-green/30 rounded-xl hover:bg-pace-green/10 transition-colors cursor-pointer">
                + Add Net
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Confirm status toggle ── */}
      {confirmToggle && (
        <ConfirmModal
          icon={confirmToggle.newStatus === "Inactive" ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
          iconBg={confirmToggle.newStatus === "Inactive" ? "bg-amber/20" : "bg-pace-green/20"}
          title={confirmToggle.newStatus === "Inactive" ? "Deactivate Academy?" : "Activate Academy?"}
          message={confirmToggle.newStatus === "Inactive"
            ? `"${academy.name}" will be marked Inactive. All players and data are preserved.`
            : `"${academy.name}" will be set back to Active.`}
          confirmLabel={confirmToggle.newStatus === "Inactive" ? "Yes, Deactivate" : "Yes, Activate"}
          confirmVariant={confirmToggle.newStatus === "Inactive" ? "warning" : "default"}
          loading={toggling}
          error={formError}
          onConfirm={handleConfirmToggle}
          onCancel={() => { setConfirmToggle(null); setFormError(""); }}
        />
      )}
    </div>
  );
}
