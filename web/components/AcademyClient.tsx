"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Papa from "papaparse";
import type { Academy, AgeGroup, AcademyStage, Player, BowlingStyle, Coach, Plan, Net } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { fetchAcademies, fetchPlayers, fetchCoaches, upsertAcademy, upsertCoach, setCoachesAcademy, insertPlayer, insertPlayers, updateAcademyFields, fetchActivePlans, fetchNets, upsertNet, deleteNet } from "@/lib/db";
import type { CertificationLevel } from "@/lib/types";
import { DateInput } from "@/components/DateInput";
import { RowActionsMenu } from "@/components/RowActionsMenu";
import { ConfirmModal } from "@/components/ConfirmModal";
import { ListSummary } from "@/components/ListSummary";
import { getPlatformFeePercent, isValidEmail } from "@/lib/utils";
import { sessionsLimitForPlan } from "@/lib/plan-features";
import { currencyForCountry, COUNTRY_OPTIONS, DEFAULT_CURRENCY, formatMoney } from "@/lib/currency";

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
  name: string; description: string; location: string; phone: string;
  playerIds: string[]; coachIds: string[]; headCoachId: string;
  stage: AcademyStage; startDate: string;
  status: "Active" | "Inactive";
  country: string;
  sessionFeeAud: number;
  sessionTypeFees: Partial<Record<string, number>>;
  ageFees: Partial<Record<AgeGroup, number>>;
  payoutModel: "head_coach" | "split_by_coach";
};

const EMPTY_DRAFT: DraftAcademy = {
  name: "", description: "", location: "", phone: "",
  playerIds: [], coachIds: [], headCoachId: "",
  stage: "Foundation",
  startDate: new Date().toISOString().split("T")[0],
  status: "Active", country: "AU", sessionFeeAud: 0, sessionTypeFees: {}, ageFees: {},
  payoutModel: "head_coach",
};

type NewPlayerDraft = {
  name: string; email: string; ageGroup: AgeGroup; bowlingStyle: BowlingStyle; club: string;
};

type CsvRowStatus = "ready" | "warning" | "skipped" | "duplicate";
type ParsedCsvRow = {
  rowNum: number;
  name: string;
  email: string;
  ageGroup: AgeGroup;
  bowlingStyle: BowlingStyle;
  club: string;
  phone: string;
  status: CsvRowStatus;
  issues: string[];
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
const EMPTY_NEW_PLAYER: NewPlayerDraft = {
  name: "", email: "", ageGroup: "U14", bowlingStyle: "Right Arm Fast", club: "",
};

const CERT_LEVELS: CertificationLevel[] = ["Level 1", "Level 2", "Level 3", "Elite"];

type NewCoachDraft = {
  name: string; email: string; phone: string;
  certificationLevel: CertificationLevel; specialization: string;
};
const EMPTY_NEW_COACH: NewCoachDraft = {
  name: "", email: "", phone: "", certificationLevel: "Level 1", specialization: "",
};

type SortOption = "name" | "players" | "newest" | "stage";
type ConfirmToggle = { id: string; name: string; newStatus: "Active" | "Inactive" };

type NetDraft = { name: string; dimensions: string };
const EMPTY_NET_DRAFT: NetDraft = { name: "", dimensions: "" };

export function AcademyClient() {
  const { user } = useAuth();

  // Data
  const [academies,   setAcademies]   = useState<Academy[]>([]);
  const [allPlayers,  setAllPlayers]  = useState<Player[]>([]);
  const [allCoaches,  setAllCoaches]  = useState<Coach[]>([]);
  const [orgPlans,    setOrgPlans]    = useState<Plan[]>([]);
  const [allPlans,    setAllPlans]    = useState<Plan[]>([]);
  const [nets,        setNets]        = useState<Net[]>([]);

  // Accordion — an academy_admin only ever sees their own single academy in this list (filtered
  // below), so there's no "which one" ambiguity to click through; start it expanded. A
  // platform_admin sees every academy, where the same default would just open a random one of
  // many, so that view keeps starting fully collapsed.
  const [expandedId,      setExpandedId]      = useState<string | null>(
    () => (user?.role === "academy_admin" ? user.academyId ?? null : null)
  );
  const [tabMap,          setTabMap]          = useState<Record<string, "players" | "coaches" | "pricing" | "nets">>({});
  const [activeGroupView, setActiveGroupView] = useState<{ academyId: string; ageGroup: AgeGroup } | null>(null);

  // Nets inline add/edit form
  const [showNetForm,  setShowNetForm]  = useState<string | null>(null); // holds academyId while open
  const [editingNetId, setEditingNetId] = useState<string | null>(null);
  const [netDraft,     setNetDraft]     = useState<NetDraft>(EMPTY_NET_DRAFT);
  const [netError,     setNetError]     = useState("");
  const [confirmDeleteNetId, setConfirmDeleteNetId] = useState<string | null>(null);

  // Confirm status toggle
  const [confirmToggle, setConfirmToggle] = useState<ConfirmToggle | null>(null);
  const [toggling,      setToggling]      = useState(false);

  // Modal
  const [showModal,      setShowModal]      = useState(false);
  const [editingId,      setEditingId]      = useState<string | null>(null);
  const [draft,          setDraft]          = useState<DraftAcademy>(EMPTY_DRAFT);
  const [formError,      setFormError]      = useState("");
  const [saving,         setSaving]         = useState(false);
  const [savedId,        setSavedId]        = useState<string | null>(null);
  const [ownerMissing,   setOwnerMissing]   = useState(false);

  // New coach inline form
  const [showNewCoach,  setShowNewCoach]  = useState(false);
  const [newCoachDraft, setNewCoachDraft] = useState<NewCoachDraft>(EMPTY_NEW_COACH);
  const [newCoachError, setNewCoachError] = useState("");
  const [savingCoach,   setSavingCoach]   = useState(false);
  const [ownerSuggested, setOwnerSuggested] = useState(false);

  // Player management inside modal
  const [playerSearch,    setPlayerSearch]    = useState("");
  const [playerAgeFilter, setPlayerAgeFilter] = useState<AgeGroup | "All">("All");
  const [showNewPlayer,   setShowNewPlayer]   = useState(false);
  const [newPlayerDraft,  setNewPlayerDraft]  = useState<NewPlayerDraft>(EMPTY_NEW_PLAYER);
  const [newPlayerError,  setNewPlayerError]  = useState("");

  // Inline "add player"/"add coach" directly from an expanded academy row's Players/Coaches tab
  // — separate state from the Edit Academy modal's own forms above, since these persist
  // immediately against the real academy row (there's no surrounding "Save Changes" step here to
  // defer to, same reasoning as the CSV import path below).
  const [tabAddPlayerFor, setTabAddPlayerFor] = useState<string | null>(null); // holds academyId while open
  const [tabPlayerDraft,  setTabPlayerDraft]  = useState<NewPlayerDraft>(EMPTY_NEW_PLAYER);
  const [tabPlayerError,  setTabPlayerError]  = useState("");
  const [tabSavingPlayer, setTabSavingPlayer] = useState(false);
  const [tabAddCoachFor,  setTabAddCoachFor]  = useState<string | null>(null); // holds academyId while open
  const [tabCoachDraft,   setTabCoachDraft]   = useState<NewCoachDraft>(EMPTY_NEW_COACH);
  const [tabCoachError,   setTabCoachError]   = useState("");
  const [tabSavingCoach,  setTabSavingCoach]  = useState(false);
  const [addingSelfFor,   setAddingSelfFor]   = useState<string | null>(null); // holds academyId while "Add Yourself as Head Coach" is in flight
  const [addSelfError,    setAddSelfError]    = useState("");

  // CSV import
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [csvRows,       setCsvRows]       = useState<ParsedCsvRow[]>([]);
  const [csvFileName,   setCsvFileName]   = useState("");
  const [csvError,      setCsvError]      = useState("");
  const [csvImporting,  setCsvImporting]  = useState(false);
  const [csvImportedCount, setCsvImportedCount] = useState<number | null>(null);

  // Filters
  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | "Active" | "Inactive">("All");
  const [stageFilter,  setStageFilter]  = useState<"All" | AcademyStage>("All");
  const [sortBy,       setSortBy]       = useState<SortOption>("name");

  useEffect(() => {
    const coachId = user?.role === "coach" ? user.coachId : undefined;
    const academyId = user?.role === "academy_admin" ? user.academyId : undefined;
    Promise.all([fetchAcademies(), fetchPlayers(coachId, academyId), fetchCoaches(academyId), fetchActivePlans(), fetchNets()]).then(([a, p, c, plans, n]) => {
      setAcademies(a); setAllPlayers(p); setAllCoaches(c);
      setOrgPlans(plans.filter((x) => x.audience === "organization"));
      setAllPlans(plans);
      setNets(n);
    });
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Accordion ──────────────────────────────────────────────────────────────
  // An academy_admin's own academy auto-expands (see the expandedId initializer above) straight
  // to Pricing rather than Players — the session-fee/age-group rates are what they open this page
  // to check most often, and unlike Players/Coaches there's no other page that surfaces it.
  function getTab(id: string) {
    if (tabMap[id]) return tabMap[id];
    return user?.role === "academy_admin" && user.academyId === id ? "pricing" : "players";
  }
  function setTab(id: string, tab: "players" | "coaches" | "pricing" | "nets") {
    setTabMap((prev) => ({ ...prev, [id]: tab }));
  }

  // ── Nets ────────────────────────────────────────────────────────────────
  function openAddNet(academyId: string) {
    setEditingNetId(null);
    setNetDraft(EMPTY_NET_DRAFT);
    setNetError("");
    setShowNetForm(academyId);
  }
  function openEditNet(net: Net) {
    setEditingNetId(net.id);
    setNetDraft({ name: net.name, dimensions: net.dimensions });
    setNetError("");
    setShowNetForm(net.academyId);
  }
  function closeNetForm() {
    setShowNetForm(null);
    setEditingNetId(null);
    setNetError("");
  }
  async function handleSaveNet(academyId: string) {
    if (!netDraft.name.trim()) { setNetError("Please give this net a name."); return; }
    setNetError("");
    const id = editingNetId ?? `net${Date.now()}`;
    const net: Net = { id, academyId, name: netDraft.name.trim(), dimensions: netDraft.dimensions.trim() };
    try {
      await upsertNet({ id: net.id, academy_id: academyId, name: net.name, dimensions: net.dimensions });
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
  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
    setActiveGroupView(null);
  }

  // ── 3-dot actions ──────────────────────────────────────────────────────────
  function handleMenuAction(action: "edit" | "toggleStatus", academy: Academy) {
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
    setPlayerSearch(""); setPlayerAgeFilter("All"); setShowNewPlayer(false);
    setShowNewCoach(false); setNewCoachDraft(EMPTY_NEW_COACH); setNewCoachError("");
    setFormError(""); setOwnerMissing(false); setOwnerSuggested(false);
    setShowModal(true);
  }

  function openEdit(academy: Academy) {
    setEditingId(academy.id);
    const coachIds = academy.coachIds ?? [];
    // if headCoachId missing but coaches exist, pre-select the first one and flag it
    const headCoachId = academy.headCoachId || (coachIds.length > 0 ? coachIds[0] : "");
    const suggested   = !academy.headCoachId && coachIds.length > 0;
    setDraft({
      name: academy.name, description: academy.description, location: academy.location,
      phone: academy.phone ?? "",
      playerIds: [...academy.playerIds], coachIds: [...coachIds],
      headCoachId,
      stage: academy.stage, startDate: academy.startDate, status: academy.status,
      country: academy.country ?? "AU",
      sessionFeeAud: academy.sessionFeeAud,
      sessionTypeFees: { ...academy.sessionTypeFees },
      ageFees: { ...academy.ageFees },
      payoutModel: academy.payoutModel ?? "head_coach",
    });
    setPlayerSearch(""); setPlayerAgeFilter("All"); setShowNewPlayer(false);
    setShowNewCoach(false); setNewCoachDraft(EMPTY_NEW_COACH); setNewCoachError("");
    setFormError(""); setOwnerMissing(false); setOwnerSuggested(suggested);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false); setEditingId(null);
    setShowNewPlayer(false); setShowNewCoach(false);
    setFormError(""); setOwnerMissing(false); setOwnerSuggested(false);
  }

  // Country is locked once a Connect payout account exists for this academy (Stripe can't move a
  // connected account's country) — true if either the head coach or any assigned coach (covers
  // both payout_model values) already has one. Computed once here so the UI's disabled-dropdown
  // state and handleSave's actual enforcement can never disagree. See lib/currency.ts.
  const academyCountryLocked = !!editingId && (
    draft.coachIds.some((cid) => allCoaches.find((c) => c.id === cid)?.stripeConnectAccountId)
    || !!allCoaches.find((c) => c.id === draft.headCoachId)?.stripeConnectAccountId
  );

  // ── Save ───────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!draft.name.trim()) { setFormError("Academy Name is required."); return; }
    const nameTaken = academies.some((a) => a.id !== editingId && a.name.trim().toLowerCase() === draft.name.trim().toLowerCase());
    if (nameTaken) { setFormError(`An academy named "${draft.name.trim()}" already exists.`); return; }
    if (!draft.headCoachId) { setOwnerMissing(true); return; }
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
    // Keep whatever's already on the row rather than the draft's (disabled-but-still-present)
    // value when locked, so a stale/injected draft value can never slip through.
    const existingAcademy = editingId ? academies.find((a) => a.id === editingId) : undefined;
    const country = (existingAcademy && academyCountryLocked) ? (existingAcademy.country ?? "AU") : draft.country;
    const currency = currencyForCountry(country);
    const newAcademy: Academy = {
      id, name: draft.name.trim(), description: draft.description, location: draft.location,
      phone: draft.phone.trim() || undefined,
      playerIds: draft.playerIds, playerCounts, coachIds: draft.coachIds,
      headCoachId: draft.headCoachId,
      stage: draft.stage, coachName: headCoach?.name ?? "",
      startDate: draft.startDate, status: draft.status,
      country, currency,
      sessionFeeAud: draft.sessionFeeAud,
      sessionTypeFees: draft.sessionTypeFees,
      ageFees: cleanedAgeFees,
      payoutModel: draft.payoutModel,
    };

    try {
      await upsertAcademy({
        id, name: newAcademy.name, description: newAcademy.description, location: newAcademy.location,
        phone: newAcademy.phone || null,
        player_ids: newAcademy.playerIds, player_counts: playerCounts as Record<string, number>,
        coach_ids: newAcademy.coachIds, head_coach_id: newAcademy.headCoachId,
        coach_name: newAcademy.coachName,
        stage: newAcademy.stage, start_date: newAcademy.startDate, status: newAcademy.status,
        country: newAcademy.country, currency: newAcademy.currency,
        session_fee_aud: newAcademy.sessionFeeAud,
        session_type_fees: newAcademy.sessionTypeFees as Record<string, number>,
        age_fees: cleanedAgeFees as Record<string, number>,
        payout_model: newAcademy.payoutModel,
      });
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? String(err);
      setFormError(`Save failed: ${msg}`);
      setSaving(false); return;
    }

    // Coaches created inline via "+ Create New Coach" are inserted with academy_id: null;
    // back-fill it now that the academy row (and its coach_ids array) has been saved, so
    // scoped views (fetchCoaches(academyId), the Coaches page) can actually find them.
    const coachesNeedingBackfill = newAcademy.coachIds.filter((cid) => {
      const c = allCoaches.find((ac) => ac.id === cid);
      return c && c.academyId !== id;
    });
    if (coachesNeedingBackfill.length > 0) {
      try {
        await setCoachesAcademy(id, coachesNeedingBackfill);
        setAllCoaches((prev) => prev.map((c) =>
          coachesNeedingBackfill.includes(c.id) ? { ...c, academyId: id } : c
        ));
      } catch (err) {
        const msg = (err as { message?: string })?.message ?? String(err);
        setFormError(`Academy saved, but linking coaches failed: ${msg}`);
        setSaving(false); return;
      }
    }

    setAcademies((prev) =>
      editingId ? prev.map((a) => (a.id === editingId ? newAcademy : a)) : [...prev, newAcademy]
    );
    setSaving(false); setSavedId(id); closeModal();
    setTimeout(() => setSavedId(null), 2500);
  }

  // ── Player / coach toggles ─────────────────────────────────────────────────
  function setOwner(coachId: string) {
    if (coachId) { setOwnerMissing(false); setOwnerSuggested(false); }
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
    const freeSessionsLimit = sessionsLimitForPlan("Free", allPlans);
    const newPlayer: Player = {
      id: newId, name: newPlayerDraft.name.trim(), email: newPlayerDraft.email.trim(),
      phone: "", ageGroup: newPlayerDraft.ageGroup, bowlingStyle: newPlayerDraft.bowlingStyle,
      battingHand: "Right Hand", playingLevel: "Club", heightCm: null, weightKg: null,
      club: newPlayerDraft.club.trim(), addedDate: now, coachId: "",
      currency: currencyForCountry(draft.country),
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
    setAllPlayers((prev) => [...prev, newPlayer]);
    setDraft((prev) => ({ ...prev, playerIds: [...prev.playerIds, newId] }));
    setNewPlayerDraft(EMPTY_NEW_PLAYER); setNewPlayerError(""); setShowNewPlayer(false);

    if (newPlayer.email.trim()) {
      fetch("/api/players/notify-added", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: newId, academyId: editingId }),
      }).catch(() => {});
      // A guardian who already has a parent/player account under this same email — signed up
      // before this player existed — never gets linked to them automatically otherwise; nothing
      // re-checks after the initial signup/approval. Best-effort, never blocks the add itself.
      fetch("/api/players/relink-guardians", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerIds: [newId] }),
      }).catch(() => {});
    }
  }

  // Same shape as handleAddNewPlayer above, but for the inline form in an expanded academy row's
  // own Players tab — writes straight to the real academy row instead of staging into `draft`,
  // since there's no modal/Save-Changes step wrapping this one.
  async function handleTabAddPlayer(academyId: string) {
    if (!tabPlayerDraft.name.trim()) { setTabPlayerError("Name is required."); return; }
    const email = tabPlayerDraft.email.trim();
    if (email && !isValidEmail(email)) { setTabPlayerError("Enter a valid email address, or leave it blank."); return; }
    const academy = academies.find((a) => a.id === academyId);
    if (!academy) return;
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
      const allForCount = [...allPlayers, newPlayer].filter((p) => mergedPlayerIds.includes(p.id));
      for (const p of allForCount) playerCounts[p.ageGroup] = (playerCounts[p.ageGroup] ?? 0) + 1;
      await updateAcademyFields(academyId, {
        player_ids: mergedPlayerIds,
        player_counts: playerCounts as Record<string, number>,
      });

      setAllPlayers((prev) => [...prev, newPlayer]);
      setAcademies((prev) => prev.map((a) =>
        a.id === academyId ? { ...a, playerIds: mergedPlayerIds, playerCounts: playerCounts as Partial<Record<AgeGroup, number>> } : a
      ));
      setTabPlayerDraft(EMPTY_NEW_PLAYER);
      setTabAddPlayerFor(null);

      if (newPlayer.email.trim()) {
        fetch("/api/players/notify-added", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId: newId, academyId }),
        }).catch(() => {});
        // See handleAddNewPlayer above for why this exists.
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

  // Same shape as handleAddNewCoach below, but for the inline form in an expanded academy row's
  // own Coaches tab — writes straight to the real academy row instead of staging into `draft`.
  async function handleTabAddCoach(academyId: string) {
    if (!tabCoachDraft.name.trim()) { setTabCoachError("Name is required."); return; }
    const academy = academies.find((a) => a.id === academyId);
    if (!academy) return;
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
      await updateAcademyFields(academyId, { coach_ids: mergedCoachIds, head_coach_id: newId });

      setAllCoaches((prev) => [...prev, newCoach]);
      setAcademies((prev) => prev.map((a) =>
        a.id === academyId ? { ...a, coachIds: mergedCoachIds, headCoachId: newId } : a
      ));
      setTabCoachDraft(EMPTY_NEW_COACH);
      setTabAddCoachFor(null);
    } catch (err) {
      setTabCoachError((err as { message?: string })?.message ?? String(err));
    } finally {
      setTabSavingCoach(false);
    }
  }

  // One-click alternative to handleTabAddCoach for the common case: the person setting up the
  // academy IS the head coach. Creates a coaches row from the signed-in user's own name/email —
  // no separate form, nothing to re-type — and sets it as owner exactly like handleTabAddCoach
  // does. Only ever offered while the roster is empty (see the render below), so there's no
  // existing owner this could accidentally displace.
  async function handleAddSelfAsCoach(academyId: string) {
    if (!user) return;
    const academy = academies.find((a) => a.id === academyId);
    if (!academy) return;
    if (allCoaches.some((c) => c.email.toLowerCase() === user.email.toLowerCase())) {
      setAddSelfError(`You already have a coach profile (${user.email}) — assign it as owner from the dropdown in Edit Academy instead.`);
      return;
    }
    setAddSelfError(""); setAddingSelfFor(academyId);
    const newId = `c_${Date.now()}`;
    const now = new Date().toISOString().split("T")[0];
    const newCoach: Coach = {
      id: newId, name: user.name, email: user.email, phone: "",
      specialization: "", ageGroupsFocus: [], location: "",
      status: "Active", joinedDate: now, certificationLevel: "Level 1",
      bio: "", academyId: "", marketplaceVisible: false, available: true,
      stripeConnectOnboarded: false, currency: academy.currency, subPlan: "Free",
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
      await updateAcademyFields(academyId, { coach_ids: mergedCoachIds, head_coach_id: newId });

      setAllCoaches((prev) => [...prev, newCoach]);
      setAcademies((prev) => prev.map((a) =>
        a.id === academyId ? { ...a, coachIds: mergedCoachIds, headCoachId: newId } : a
      ));
    } catch (err) {
      setAddSelfError((err as { message?: string })?.message ?? String(err));
    } finally {
      setAddingSelfFor(null);
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
        const existingEmails = new Set(allPlayers.map((p) => p.email.trim().toLowerCase()).filter(Boolean));
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
      const freeSessionsLimit = sessionsLimitForPlan("Free", allPlans);
      const newPlayers: Player[] = importable.map((row, i) => ({
        id: `p_${Date.now()}_${i}`, name: row.name, email: row.email,
        phone: row.phone, ageGroup: row.ageGroup, bowlingStyle: row.bowlingStyle,
        battingHand: "Right Hand", playingLevel: "Club", heightCm: null, weightKg: null,
        club: row.club, addedDate: now, coachId: "",
        currency: currencyForCountry(draft.country),
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
      }));

      await insertPlayers(newPlayers.map((p) => ({
        id: p.id, name: p.name, email: p.email, phone: p.phone,
        bowling_style: p.bowlingStyle, age_group: p.ageGroup,
        club: p.club, coach_id: null, guardian_consent_status: "Pending",
        added_date: now, sessions_count: 0, last_active: now, xp: 0,
        sub_plan: "Free", sub_start_date: now, sub_end_date: p.subscription.endDate,
        sub_sessions_used: 0, sub_sessions_limit: freeSessionsLimit,
        bio_ball_speed_kmh: 0, bio_front_knee_angle_deg: 0, bio_action_type: "Side-on",
        bio_injury_risk: "Low", bio_last_session: now,
        acad_stage: "Foundation", acad_completion_percent: 0, acad_total_sessions: 0,
        acad_xp: 0, acad_articles_read: 0,
        currency: p.currency,
      })));

      // Import happens immediately against the real academy row — unlike the rest of this form,
      // it doesn't wait for the outer "Save Changes" click, since losing a bulk-imported roster
      // to an accidentally-closed modal would be a much bigger deal than losing one manual add.
      const newPlayerIds = newPlayers.map((p) => p.id);
      const mergedPlayerIds = [...new Set([...draft.playerIds, ...newPlayerIds])];
      const playerCounts: Partial<Record<AgeGroup, number>> = {};
      const allForCount = [...allPlayers, ...newPlayers].filter((p) => mergedPlayerIds.includes(p.id));
      for (const p of allForCount) playerCounts[p.ageGroup] = (playerCounts[p.ageGroup] ?? 0) + 1;
      if (editingId) {
        await updateAcademyFields(editingId, {
          player_ids: mergedPlayerIds,
          player_counts: playerCounts as Record<string, number>,
        });
      }

      setAllPlayers((prev) => [...prev, ...newPlayers]);
      setDraft((prev) => ({ ...prev, playerIds: mergedPlayerIds }));
      setCsvImportedCount(newPlayers.length);
      setCsvRows([]);
      setCsvFileName("");

      const emailedIds: string[] = [];
      for (const p of newPlayers) {
        if (!p.email.trim()) continue;
        emailedIds.push(p.id);
        fetch("/api/players/notify-added", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId: p.id, academyId: editingId }),
        }).catch(() => {});
      }
      // One batched call for the whole CSV import — see handleAddNewPlayer above for why this exists.
      if (emailedIds.length > 0) {
        fetch("/api/players/relink-guardians", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerIds: emailedIds }),
        }).catch(() => {});
      }
    } catch (err) {
      setCsvError((err as { message?: string })?.message ?? String(err));
    } finally {
      setCsvImporting(false);
    }
  }

  async function handleAddNewCoach() {
    if (!newCoachDraft.name.trim()) { setNewCoachError("Name is required."); return; }
    const email = newCoachDraft.email.trim();
    // Nothing in the schema stops two coach rows sharing an email — and when that happens, every
    // email-based lookup elsewhere (invite approval, login linking) can only ever resolve to one
    // of them, silently orphaning whichever wasn't picked. Catch it here instead.
    if (email && allCoaches.some((c) => c.email.toLowerCase() === email.toLowerCase())) {
      setNewCoachError(`Another coach already uses ${email} — each coach needs a unique email.`);
      return;
    }
    setNewCoachError(""); setSavingCoach(true);
    const newId  = `c_${Date.now()}`;
    const now    = new Date().toISOString().split("T")[0];
    const newCoach: Coach = {
      id: newId, name: newCoachDraft.name.trim(), email: newCoachDraft.email.trim(),
      phone: newCoachDraft.phone.trim(), specialization: newCoachDraft.specialization.trim(),
      ageGroupsFocus: [], location: "", status: "Active", joinedDate: now,
      certificationLevel: newCoachDraft.certificationLevel, bio: "", academyId: "",
      marketplaceVisible: false, available: true, stripeConnectOnboarded: false,
      currency: currencyForCountry(draft.country),
      subPlan: "Free",
    };
    try {
      await upsertCoach({
        id: newId, name: newCoach.name, email: newCoach.email, phone: newCoach.phone,
        specialization: newCoach.specialization, age_groups_focus: [],
        location: "", status: "Active", joined_date: now,
        certification_level: newCoach.certificationLevel, bio: "", academy_id: null,
        marketplace_visible: false, currency: newCoach.currency,
      });
    } catch (err) {
      setNewCoachError((err as { message?: string })?.message ?? String(err));
      setSavingCoach(false); return;
    }
    setAllCoaches((prev) => [...prev, newCoach]);
    // auto-set as owner and add to coachIds
    setDraft((prev) => ({
      ...prev,
      headCoachId: newId,
      coachIds: prev.coachIds.includes(newId) ? prev.coachIds : [...prev.coachIds, newId],
    }));
    setOwnerMissing(false); setOwnerSuggested(false);
    setNewCoachDraft(EMPTY_NEW_COACH); setSavingCoach(false); setShowNewCoach(false);
  }

  // Draft-scoped analog of handleAddSelfAsCoach (above) for the Edit/New Academy modal's Owner
  // picker: same one-click self-as-coach shortcut, but stages into `draft` the same way
  // handleAddNewCoach does rather than writing to the academy row directly — this modal is used
  // for brand-new academies too, where there's no saved row yet to write to.
  async function handleAddSelfAsCoachToDraft() {
    if (!user) return;
    if (allCoaches.some((c) => c.email.toLowerCase() === user.email.toLowerCase())) {
      setNewCoachError(`You already have a coach profile (${user.email}) — select it from the dropdown instead.`);
      return;
    }
    setNewCoachError(""); setSavingCoach(true);
    const newId = `c_${Date.now()}`;
    const now = new Date().toISOString().split("T")[0];
    const newCoach: Coach = {
      id: newId, name: user.name, email: user.email, phone: "",
      specialization: "", ageGroupsFocus: [], location: "", status: "Active", joinedDate: now,
      certificationLevel: "Level 1", bio: "", academyId: "",
      marketplaceVisible: false, available: true, stripeConnectOnboarded: false,
      currency: currencyForCountry(draft.country), subPlan: "Free",
    };
    try {
      await upsertCoach({
        id: newId, name: newCoach.name, email: newCoach.email, phone: newCoach.phone,
        specialization: newCoach.specialization, age_groups_focus: [],
        location: "", status: "Active", joined_date: now,
        certification_level: newCoach.certificationLevel, bio: "", academy_id: null,
        marketplace_visible: false, currency: newCoach.currency,
      });
    } catch (err) {
      setNewCoachError((err as { message?: string })?.message ?? String(err));
      setSavingCoach(false); return;
    }
    setAllCoaches((prev) => [...prev, newCoach]);
    setDraft((prev) => ({
      ...prev,
      headCoachId: newId,
      coachIds: prev.coachIds.includes(newId) ? prev.coachIds : [...prev.coachIds, newId],
    }));
    setOwnerMissing(false); setOwnerSuggested(false); setSavingCoach(false);
  }

  // ── Filter / sort ──────────────────────────────────────────────────────────
  const displayed = [...academies]
    .filter((a) => {
      // academy_admin only sees their assigned academy
      if (user?.role === "academy_admin" && user.academyId && a.id !== user.academyId) return false;
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

  // map coachId → academy names they're already in (excluding the one being edited)
  const coachAcademyMap = allCoaches.reduce((acc, c) => {
    const names = academies
      .filter((a) => a.id !== editingId && (a.coachIds ?? []).includes(c.id))
      .map((a) => a.name);
    if (names.length) acc[c.id] = names;
    return acc;
  }, {} as Record<string, string[]>);

  // player list in modal: filter by search + selected age group
  const ageGroupsWithPlayers = AGE_GROUPS.filter((g) => allPlayers.some((p) => p.ageGroup === g));
  const filteredPlayers = allPlayers.filter((p) => {
    if (playerAgeFilter !== "All" && p.ageGroup !== playerAgeFilter) return false;
    const q = playerSearch.toLowerCase();
    return !q || p.name.toLowerCase().includes(q) || p.club.toLowerCase().includes(q);
  });

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
          <ListSummary parts={[`${displayed.length} shown`, `${academies.length} total`, `${activeCount} active`]} />
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
        <div className="space-y-2">
          {displayed.map((academy) => {
            const isExpanded      = expandedId === academy.id;
            const tab             = getTab(academy.id);
            const canManage       = user?.role === "platform_admin" || (user?.role === "academy_admin" && user.academyId === academy.id);
            const assignedPlayers = allPlayers.filter((p) => academy.playerIds.includes(p.id));
            const assignedCoaches = allCoaches.filter((c) => (academy.coachIds ?? []).includes(c.id));
            const headCoach       = allCoaches.find((c) => c.id === academy.headCoachId);
            const countsByGroup   = assignedPlayers.reduce((acc, p) => {
              acc[p.ageGroup] = (acc[p.ageGroup] ?? 0) + 1; return acc;
            }, {} as Partial<Record<AgeGroup, number>>);
            const ageGroupsPresent = AGE_GROUPS.filter((g) => (countsByGroup[g] ?? 0) > 0);
            const groupViewActive  = activeGroupView?.academyId === academy.id ? activeGroupView.ageGroup : null;

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
                      <div className="text-sm font-bold text-white">{academy.sessionFeeAud > 0 ? formatMoney(academy.sessionFeeAud, academy.currency) : "—"}</div>
                      <div className="text-[10px] text-zinc-500">Fee/session</div>
                    </div>
                  </div>

                  {(user?.role === "platform_admin" || (user?.role === "academy_admin" && user.academyId === academy.id)) && (
                    <Link
                      href={`/academies/${academy.id}/billing`}
                      onClick={(e) => e.stopPropagation()}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 border border-zinc-700 hover:text-white hover:border-zinc-500 transition-colors flex-shrink-0"
                    >
                      Billing
                    </Link>
                  )}

                  {/* An academy_admin had no way to add players/coaches to their own academy at
                      all — the only edit affordance was the platform_admin-only ⋮ menu below. */}
                  {user?.role === "academy_admin" && user.academyId === academy.id && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); openEdit(academy); }}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 border border-zinc-700 hover:text-white hover:border-zinc-500 transition-colors flex-shrink-0 cursor-pointer"
                    >
                      Edit
                    </button>
                  )}

                  {/* ⋮ menu — the infrequent, platform_admin-only actions (a direct Billing/Edit
                      button above already covers what gets clicked most). */}
                  {user?.role === "platform_admin" && (
                    <div onClick={(e) => e.stopPropagation()}>
                      <RowActionsMenu items={[
                        {
                          label: "Edit Academy",
                          icon: (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          ),
                          onClick: () => handleMenuAction("edit", academy),
                        },
                        {
                          label: academy.status === "Active" ? "Deactivate" : "Activate",
                          dividerBefore: true,
                          variant: academy.status === "Active" ? "warning" : "success",
                          icon: academy.status === "Active" ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="10" /><line x1="8" y1="12" x2="16" y2="12" />
                            </svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="10" />
                              <line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
                            </svg>
                          ),
                          onClick: () => handleMenuAction("toggleStatus", academy),
                        },
                      ]} />
                    </div>
                  )}
                </div>

                {/* ── Expanded panel ── */}
                {isExpanded && (
                  <div className="border-t border-zinc-700/60 px-5 pb-5">
                    <div className="flex gap-1 pt-4 mb-4">
                      {(["players", "coaches", "pricing", "nets"] as const).map((t) => (
                        <button key={t} type="button" onClick={() => setTab(academy.id, t)}
                          className={`px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors cursor-pointer ${
                            tab === t ? "bg-pace-green text-black" : "bg-ink text-zinc-400 hover:text-white"
                          }`}>
                          {t === "players" ? `Players (${assignedPlayers.length})`
                            : t === "coaches" ? `Coaches (${assignedCoaches.length})`
                            : t === "pricing" ? "Pricing"
                            : `Nets (${nets.filter((n) => n.academyId === academy.id).length})`}
                        </button>
                      ))}
                    </div>

                    {/* Players tab */}
                    {tab === "players" && (
                      <>
                        {canManage && (
                          <div className="flex justify-end mb-3">
                            <button type="button"
                              onClick={() => { setTabAddPlayerFor(tabAddPlayerFor === academy.id ? null : academy.id); setTabPlayerError(""); }}
                              className="text-xs font-semibold text-pace-green hover:opacity-80 cursor-pointer">
                              {tabAddPlayerFor === academy.id ? "Cancel" : "+ Add Player"}
                            </button>
                          </div>
                        )}
                        {tabAddPlayerFor === academy.id && (
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
                            <button type="button" onClick={() => handleTabAddPlayer(academy.id)} disabled={tabSavingPlayer}
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
                        )}
                      </>
                    )}

                    {/* Coaches tab */}
                    {tab === "coaches" && (
                      <>
                        {canManage && (
                          <div className="flex justify-end mb-3">
                            <button type="button"
                              onClick={() => { setTabAddCoachFor(tabAddCoachFor === academy.id ? null : academy.id); setTabCoachError(""); }}
                              className="text-xs font-semibold text-pace-green hover:opacity-80 cursor-pointer">
                              {tabAddCoachFor === academy.id ? "Cancel" : "+ Add Coach"}
                            </button>
                          </div>
                        )}
                        {tabAddCoachFor === academy.id && (
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
                            <button type="button" onClick={() => handleTabAddCoach(academy.id)} disabled={tabSavingCoach}
                              className="px-4 py-2 bg-pace-green text-black text-xs font-bold rounded-lg hover:opacity-90 cursor-pointer disabled:opacity-60">
                              {tabSavingCoach ? "Adding…" : "Create & Assign"}
                            </button>
                          </div>
                        )}
                        {assignedCoaches.length === 0 ? (
                          canManage && tabAddCoachFor !== academy.id ? (
                            <div className="space-y-2">
                              {addSelfError && <p className="text-red-400 text-xs">{addSelfError}</p>}
                              <button type="button"
                                onClick={() => handleAddSelfAsCoach(academy.id)}
                                disabled={addingSelfFor === academy.id}
                                className="w-full flex items-center gap-3 px-4 py-3 bg-ink border border-zinc-700 rounded-xl hover:border-pace-green transition-colors cursor-pointer disabled:opacity-60 text-left">
                                <span className="w-8 h-8 rounded-lg bg-pace-green/15 text-pace-green flex items-center justify-center text-sm font-bold flex-shrink-0">★</span>
                                <span className="min-w-0">
                                  <span className="block text-sm font-semibold text-white">
                                    {addingSelfFor === academy.id ? "Adding…" : "Add Yourself as Head Coach"}
                                  </span>
                                  <span className="block text-xs text-zinc-500">Uses your own name &amp; email — one click</span>
                                </span>
                              </button>
                              <button type="button"
                                onClick={() => { setTabAddCoachFor(academy.id); setTabCoachError(""); }}
                                className="w-full flex items-center gap-3 px-4 py-3 bg-ink border border-zinc-700 rounded-xl hover:border-pace-green transition-colors cursor-pointer text-left">
                                <span className="w-8 h-8 rounded-lg bg-zinc-700/60 text-zinc-400 flex items-center justify-center text-sm font-bold flex-shrink-0">+</span>
                                <span className="min-w-0">
                                  <span className="block text-sm font-semibold text-white">Create New Coach</span>
                                  <span className="block text-xs text-zinc-500">For someone you&apos;ve hired to coach here</span>
                                </span>
                              </button>
                            </div>
                          ) : !canManage ? (
                            <p className="text-zinc-500 text-sm py-8 text-center">No coaches assigned yet.</p>
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
                            const feePct = getPlatformFeePercent(academy.id, academies, orgPlans);
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
                    {tab === "nets" && (() => {
                      const academyNets = nets.filter((n) => n.academyId === academy.id);
                      return (
                        <div className="space-y-3">
                          {academyNets.length === 0 && showNetForm !== academy.id && (
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

                          {showNetForm === academy.id ? (
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
                                <button type="button" onClick={() => handleSaveNet(academy.id)}
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
                            <button type="button" onClick={() => openAddNet(academy.id)}
                              className="px-4 py-2 text-sm font-semibold text-pace-green border border-pace-green/30 rounded-xl hover:bg-pace-green/10 transition-colors cursor-pointer">
                              + Add Net
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

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
            ? `"${confirmToggle.name}" will be marked Inactive. All players and data are preserved.`
            : `"${confirmToggle.name}" will be set back to Active.`}
          confirmLabel={confirmToggle.newStatus === "Inactive" ? "Yes, Deactivate" : "Yes, Activate"}
          confirmVariant={confirmToggle.newStatus === "Inactive" ? "warning" : "default"}
          loading={toggling}
          onConfirm={handleConfirmToggle}
          onCancel={() => setConfirmToggle(null)}
        />
      )}

      {/* ── Owner missing popup ── */}
      {ownerMissing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOwnerMissing(false)} />
          <div className="relative bg-surface rounded-2xl w-full max-w-xs shadow-2xl border border-red-500/30 p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center mx-auto mb-4">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <h3 className="text-white font-bold mb-2">Academy Owner Required</h3>
            <p className="text-zinc-400 text-sm mb-5">
              Every academy must have a Head Coach / Owner before it can be saved. Please select one from the Coaches section.
            </p>
            <button type="button" onClick={() => setOwnerMissing(false)}
              className="w-full px-4 py-2.5 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 cursor-pointer">
              Got it
            </button>
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
              <div className="flex items-center gap-3">
                {editingId && (user?.role === "platform_admin" || (user?.role === "academy_admin" && user.academyId === editingId)) && (
                  <Link
                    href={`/academies/${editingId}/billing`}
                    className="text-xs font-semibold text-pace-green hover:opacity-80 transition-opacity"
                  >
                    Manage Billing →
                  </Link>
                )}
                <button type="button" onClick={closeModal}
                  className="text-zinc-400 hover:text-white transition-colors cursor-pointer text-xl leading-none p-1">✕</button>
              </div>
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
                    <label className={lbl}>Country</label>
                    <select value={draft.country} disabled={academyCountryLocked}
                      onChange={(e) => setDraft({ ...draft, country: e.target.value })}
                      className={`${sel} ${academyCountryLocked ? "opacity-60 cursor-not-allowed" : ""}`}>
                      {COUNTRY_OPTIONS.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                    </select>
                    <p className="text-xs text-zinc-500 mt-1">
                      Players are billed and the academy paid out in {(COUNTRY_OPTIONS.find((c) => c.code === draft.country)?.currency ?? DEFAULT_CURRENCY).toUpperCase()}.
                      {academyCountryLocked && " Locked — a coach here already has a Stripe payout account set up."}
                    </p>
                  </div>
                  <div>
                    <label className={lbl}>Phone</label>
                    <input type="tel" value={draft.phone}
                      onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                      className={inp} placeholder="e.g. 0412 345 678" />
                    <p className="text-xs text-zinc-500 mt-1">Used as a fallback SMS contact for payment reminders when a player has no coach assigned.</p>
                  </div>
                  <div>
                    <label className={lbl}>Start Date</label>
                    <DateInput value={draft.startDate}
                      onChange={(v) => setDraft({ ...draft, startDate: v })}
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
                <div className="flex items-center justify-between mb-3">
                  <p className={sectionLbl} style={{marginBottom: 0}}>Coaches</p>
                  <button type="button"
                    onClick={() => { setShowNewCoach((v) => !v); setNewCoachError(""); }}
                    className="text-xs font-semibold text-pace-green hover:opacity-80 cursor-pointer">
                    {showNewCoach ? "Cancel" : "+ Create New Coach"}
                  </button>
                </div>

                {/* Inline create-coach form */}
                {showNewCoach && (
                  <div className="bg-ink rounded-xl p-4 mb-4 border border-pace-green/30">
                    <p className="text-xs font-semibold uppercase tracking-wider text-pace-green mb-3">New Coach</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className={lbl}>Full Name *</label>
                        <input type="text" value={newCoachDraft.name}
                          onChange={(e) => setNewCoachDraft({ ...newCoachDraft, name: e.target.value })}
                          className={inp} placeholder="Coach full name" />
                      </div>
                      <div>
                        <label className={lbl}>Email</label>
                        <input type="email" value={newCoachDraft.email}
                          onChange={(e) => setNewCoachDraft({ ...newCoachDraft, email: e.target.value })}
                          className={inp} placeholder="coach@email.com" />
                      </div>
                      <div>
                        <label className={lbl}>Phone</label>
                        <input type="tel" value={newCoachDraft.phone}
                          onChange={(e) => setNewCoachDraft({ ...newCoachDraft, phone: e.target.value })}
                          className={inp} placeholder="04xx xxx xxx" />
                      </div>
                      <div>
                        <label className={lbl}>Certification Level</label>
                        <select value={newCoachDraft.certificationLevel}
                          onChange={(e) => setNewCoachDraft({ ...newCoachDraft, certificationLevel: e.target.value as CertificationLevel })}
                          className={sel}>
                          {CERT_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <label className={lbl}>Specialization</label>
                        <input type="text" value={newCoachDraft.specialization}
                          onChange={(e) => setNewCoachDraft({ ...newCoachDraft, specialization: e.target.value })}
                          className={inp} placeholder="e.g. Fast Bowling, Biomechanics" />
                      </div>
                    </div>
                    {newCoachError && <p className="text-red-400 text-xs mb-2">{newCoachError}</p>}
                    <button type="button" onClick={handleAddNewCoach} disabled={savingCoach}
                      className="px-4 py-2 bg-pace-green text-black text-xs font-bold rounded-lg hover:opacity-90 cursor-pointer disabled:opacity-60">
                      {savingCoach ? "Creating…" : "Create & Set as Owner"}
                    </button>
                  </div>
                )}

                {allCoaches.length === 0 && !showNewCoach ? (
                  <div className="space-y-2">
                    {newCoachError && <p className="text-red-400 text-xs">{newCoachError}</p>}
                    <button type="button"
                      onClick={handleAddSelfAsCoachToDraft}
                      disabled={savingCoach}
                      className="w-full flex items-center gap-3 px-4 py-3 bg-ink border border-zinc-700 rounded-xl hover:border-pace-green transition-colors cursor-pointer disabled:opacity-60 text-left">
                      <span className="w-8 h-8 rounded-lg bg-pace-green/15 text-pace-green flex items-center justify-center text-sm font-bold flex-shrink-0">★</span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-white">{savingCoach ? "Adding…" : "Add Yourself as Head Coach"}</span>
                        <span className="block text-xs text-zinc-500">Uses your own name &amp; email — one click</span>
                      </span>
                    </button>
                    <button type="button"
                      onClick={() => { setShowNewCoach(true); setNewCoachError(""); }}
                      className="w-full flex items-center gap-3 px-4 py-3 bg-ink border border-zinc-700 rounded-xl hover:border-pace-green transition-colors cursor-pointer text-left">
                      <span className="w-8 h-8 rounded-lg bg-zinc-700/60 text-zinc-400 flex items-center justify-center text-sm font-bold flex-shrink-0">+</span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-white">Create New Coach</span>
                        <span className="block text-xs text-zinc-500">For someone you&apos;ve hired to coach here</span>
                      </span>
                    </button>
                  </div>
                ) : allCoaches.length > 0 ? (
                  <>
                    {/* Step 1 — Academy Owner (always visible, required) */}
                    <div className="mb-4">
                      <label className={lbl}>Academy Owner (Head Coach) *</label>
                      <p className="text-zinc-500 text-xs mb-2">The main person responsible for running this academy.</p>

                      {/* Suggested owner notice */}
                      {ownerSuggested && (
                        <div className="mb-2 flex items-start gap-2 px-3 py-2.5 bg-amber/10 border border-amber/30 rounded-xl">
                          <svg className="text-amber flex-shrink-0 mt-0.5" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                          </svg>
                          <p className="text-amber text-xs">We&apos;ve pre-selected a coach as owner. Please confirm or change.</p>
                        </div>
                      )}

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
                            const inAcademies = coachAcademyMap[c.id] ?? [];
                            return (
                              <button key={c.id} type="button" onClick={() => toggleCoach(c.id)}
                                className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                                  selected ? "border-pace-green/50 bg-pace-green/10" : "border-zinc-700 bg-ink hover:border-zinc-500"
                                }`}>
                                <div className="w-8 h-8 rounded-full bg-pace-green/40 flex items-center justify-center text-black text-xs font-bold flex-shrink-0 mt-0.5">
                                  {c.name.split(" ").map((n) => n[0]).join("")}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-semibold text-white truncate">{c.name}</div>
                                  <div className="text-xs text-zinc-400 truncate">{c.specialization || c.certificationLevel}</div>
                                  {inAcademies.length > 0 && (
                                    <div className="text-[10px] text-zinc-500 mt-0.5 truncate">
                                      In: {inAcademies.join(", ")}
                                    </div>
                                  )}
                                </div>
                                <span className={`text-xs font-bold flex-shrink-0 mt-0.5 ${selected ? "text-pace-green" : "text-zinc-600"}`}>
                                  {selected ? "✓" : "+"}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                ) : null}
              </section>

              {/* Pricing */}
              <section>
                <p className={sectionLbl}>Pricing</p>
                <div className="bg-ink rounded-xl p-4 space-y-4">
                  <div>
                    <label className={lbl}>Default Session Fee ({currencyForCountry(draft.country).toUpperCase()})</label>
                    <div className="flex items-center gap-4">
                      <div className="relative max-w-xs flex-1">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 text-sm font-semibold">$</span>
                        <input type="number" min={0} step={5}
                          value={draft.sessionFeeAud === 0 ? "" : draft.sessionFeeAud}
                          onChange={(e) => setDraft({ ...draft, sessionFeeAud: parseFloat(e.target.value) || 0 })}
                          className={`${inp} pl-8`} placeholder="0.00" />
                      </div>
                      {draft.sessionFeeAud > 0 && (() => {
                        const feePct = editingId ? getPlatformFeePercent(editingId, academies, orgPlans) : 10;
                        const draftCurrency = currencyForCountry(draft.country);
                        return (
                          <div className="text-xs text-zinc-400 space-y-0.5">
                            <div>Platform ({feePct}%): <span className="text-amber font-semibold">{formatMoney(draft.sessionFeeAud * (feePct / 100), draftCurrency)}</span></div>
                            <div>Academy: <span className="text-pace-green font-semibold">{formatMoney(draft.sessionFeeAud * (1 - feePct / 100), draftCurrency)}</span></div>
                          </div>
                        );
                      })()}
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

              {/* Payout Model */}
              <section>
                <p className={sectionLbl}>Payout Model</p>
                <div className="bg-ink rounded-xl p-4 space-y-2">
                  <label className="flex items-start gap-2.5 cursor-pointer select-none">
                    <input
                      type="radio"
                      name="payoutModel"
                      checked={draft.payoutModel === "head_coach"}
                      onChange={() => setDraft({ ...draft, payoutModel: "head_coach" })}
                      className="w-4 h-4 mt-0.5 accent-pace-green cursor-pointer"
                    />
                    <span>
                      <span className="text-sm text-white font-medium block">Head Coach Receives All</span>
                      <span className="text-xs text-zinc-500">
                        {allCoaches.find((c) => c.id === draft.headCoachId)?.name ?? "The head coach"} receives all booking and pack revenue for this academy.
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2.5 cursor-pointer select-none">
                    <input
                      type="radio"
                      name="payoutModel"
                      checked={draft.payoutModel === "split_by_coach"}
                      onChange={() => setDraft({ ...draft, payoutModel: "split_by_coach" })}
                      className="w-4 h-4 mt-0.5 accent-pace-green cursor-pointer"
                    />
                    <span>
                      <span className="text-sm text-white font-medium block">Split by Servicing Coach</span>
                      <span className="text-xs text-zinc-500">Each coach receives revenue for the bookings and packs tied to them directly.</span>
                    </span>
                  </label>
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
                  <div className="flex items-center gap-3">
                    {editingId && (
                      <button type="button" onClick={() => { setShowCsvImport((v) => !v); setCsvError(""); setCsvRows([]); setCsvFileName(""); setCsvImportedCount(null); }}
                        className="text-xs font-semibold text-pace-green hover:opacity-80 cursor-pointer">
                        {showCsvImport ? "Cancel" : "Import CSV"}
                      </button>
                    )}
                    <button type="button" onClick={() => { setShowNewPlayer((v) => !v); setNewPlayerError(""); }}
                      className="text-xs font-semibold text-pace-green hover:opacity-80 cursor-pointer">
                      {showNewPlayer ? "Cancel" : "+ Add New Player"}
                    </button>
                  </div>
                </div>

                {(() => {
                  const editingAcademy = academies.find((a) => a.id === editingId);
                  const activePlan = orgPlans.find((p) => p.id === editingAcademy?.planId);
                  if (!activePlan?.seatCap || draft.playerIds.length <= activePlan.seatCap) return null;
                  return (
                    <div className="mb-3 px-3 py-2 rounded-lg bg-amber/10 border border-amber/30 text-amber text-xs">
                      {draft.playerIds.length} bowlers assigned, but the {activePlan.name} plan is capped at {activePlan.seatCap}.{" "}
                      <Link href={`/academies/${editingId}/billing`} className="underline hover:opacity-80">Upgrade the license</Link> to cover the extra seats.
                    </div>
                  );
                })()}

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

                {showCsvImport && editingId && (
                  <div className="bg-ink rounded-xl p-4 mb-3 border border-pace-green/30">
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

                {/* Age group filter chips */}
                {ageGroupsWithPlayers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    <button type="button"
                      onClick={() => setPlayerAgeFilter("All")}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        playerAgeFilter === "All" ? "bg-pace-green text-black" : "bg-ink text-zinc-400 border border-zinc-700 hover:border-zinc-500"
                      }`}>All</button>
                    {ageGroupsWithPlayers.map((g) => (
                      <button key={g} type="button"
                        onClick={() => setPlayerAgeFilter(g === playerAgeFilter ? "All" : g)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                          playerAgeFilter === g ? "bg-pace-green text-black" : "bg-ink text-zinc-400 border border-zinc-700 hover:border-zinc-500"
                        }`}>{g}</button>
                    ))}
                  </div>
                )}
                <input type="text" value={playerSearch} onChange={(e) => setPlayerSearch(e.target.value)}
                  className={`${inp} mb-2`} placeholder="Search by name or club…" />
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                  {filteredPlayers.length === 0 && (
                    <p className="text-zinc-500 text-xs text-center py-4">No players match this filter.</p>
                  )}
                  {filteredPlayers.map((p) => {
                    const assigned = draft.playerIds.includes(p.id);
                    const inAcademy = academies.find(
                      (a) => a.id !== editingId && a.playerIds.includes(p.id)
                    );
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
                            <div className="text-xs text-zinc-400">
                              {p.ageGroup} · {p.club || p.bowlingStyle}
                              {inAcademy && <span className="text-zinc-500"> · In: {inAcademy.name}</span>}
                            </div>
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
