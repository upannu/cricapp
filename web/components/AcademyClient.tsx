"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Papa from "papaparse";
import type { Academy, AgeGroup, AcademyStage, Player, BowlingStyle, Coach, Plan } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { fetchAcademies, fetchPlayers, fetchCoaches, upsertAcademy, upsertCoach, setCoachesAcademy, insertPlayer, insertPlayers, updateAcademyFields, fetchActivePlans } from "@/lib/db";
import type { CertificationLevel } from "@/lib/types";
import { DateInput } from "@/components/DateInput";
import { RowActionsMenu } from "@/components/RowActionsMenu";
import { ConfirmModal } from "@/components/ConfirmModal";
import { StatsGrid } from "@/components/StatsGrid";
import { StatCard } from "@/components/StatCard";
import { SortableHeader } from "@/components/SortableHeader";
import { PaginationFooter } from "@/components/PaginationFooter";
import { useSort } from "@/lib/useSort";
import { EditIcon, CreditCardIcon, PowerIcon, PowerOffIcon } from "@/components/icons";
import { getPlatformFeePercent } from "@/lib/utils";
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

type AcademySortKey = "name" | "stage" | "status" | "players" | "coaches" | "location";
type ConfirmToggle = { id: string; name: string; newStatus: "Active" | "Inactive" };

function compareAcademies(a: Academy, b: Academy, sortKey: AcademySortKey): number {
  switch (sortKey) {
    case "name":     return a.name.localeCompare(b.name);
    case "stage":    return STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage);
    case "status":   return a.status.localeCompare(b.status);
    case "players":  return a.playerIds.length - b.playerIds.length;
    case "coaches":  return (a.coachIds?.length ?? 0) - (b.coachIds?.length ?? 0);
    case "location": return a.location.localeCompare(b.location);
  }
}

const DEFAULT_ACADEMIES_PER_PAGE = 10;

export function AcademyClient() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Data
  const [academies,   setAcademies]   = useState<Academy[]>([]);
  const [allPlayers,  setAllPlayers]  = useState<Player[]>([]);
  const [allCoaches,  setAllCoaches]  = useState<Coach[]>([]);
  const [orgPlans,    setOrgPlans]    = useState<Plan[]>([]);
  const [allPlans,    setAllPlans]    = useState<Plan[]>([]);

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
  const { sortKey, sortDir, handleSort } = useSort<AcademySortKey>("name");
  const [page, setPage] = useState(1);
  const [academiesPerPage, setAcademiesPerPage] = useState(DEFAULT_ACADEMIES_PER_PAGE);

  useEffect(() => {
    const coachId = user?.role === "coach" ? user.coachId : undefined;
    const academyId = user?.role === "academy_admin" ? user.academyId : undefined;
    Promise.all([fetchAcademies(), fetchPlayers(coachId, academyId), fetchCoaches(academyId), fetchActivePlans()]).then(([a, p, c, plans]) => {
      setAcademies(a); setAllPlayers(p); setAllCoaches(c);
      setOrgPlans(plans.filter((x) => x.audience === "organization"));
      setAllPlans(plans);
    });
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 3-dot actions ──────────────────────────────────────────────────────────
  function handleMenuAction(action: "edit" | "toggleStatus", academy: Academy) {
    if (action === "edit") { openEdit(academy); return; }
    setFormError("");
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
      // upsertAcademy's .upsert() validates as if it were a fresh INSERT even against an existing
      // row, so a partial payload missing a NOT NULL column (name, description, location, ...)
      // fails outright — updateAcademyFields does a real UPDATE instead (same fix already made
      // for the identical bug on Coaches' own status/marketplace toggles).
      await updateAcademyFields(confirmToggle.id, { status: confirmToggle.newStatus });
      setAcademies((prev) =>
        prev.map((a) => a.id === confirmToggle.id ? { ...a, status: confirmToggle.newStatus } : a)
      );
      setConfirmToggle(null);
    } catch (err) {
      setFormError((err as { message?: string })?.message ?? String(err));
    } finally {
      setToggling(false);
    }
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

  // A row click now navigates straight to /academies/[id] instead of expanding inline — but Edit
  // Academy has no dedicated page of its own yet (unlike Coach/Player), so the profile page's own
  // "Edit Academy" button routes back here with ?edit=<id> to reopen this same modal, once the
  // academy list has actually loaded.
  useEffect(() => {
    if (academies.length === 0) return;
    const editId = searchParams.get("edit");
    if (!editId) return;
    const academy = academies.find((a) => a.id === editId);
    if (academy) openEdit(academy);
    router.replace("/academy");
  }, [academies, searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

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
      loginDisabled: false, disabledAt: null, disabledReason: null,
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
      loginDisabled: false, disabledAt: null, disabledReason: null,
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
      const cmp = compareAcademies(a, b, sortKey);
      return sortDir === "asc" ? cmp : -cmp;
    });
  const totalPages = Math.max(1, Math.ceil(displayed.length / academiesPerPage));
  const currentPage = Math.min(page, totalPages);
  const pageAcademies = displayed.slice((currentPage - 1) * academiesPerPage, currentPage * academiesPerPage);

  const activeCount = academies.filter((a) => a.status === "Active").length;
  const inactiveCount = academies.filter((a) => a.status === "Inactive").length;
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

  // additional coaches = all coaches except the current owner — excludes a removed coach too,
  // unless they're already toggled on (editing an academy that already has one shouldn't
  // silently drop them from view).
  const additionalCoaches = allCoaches.filter((c) =>
    c.id !== draft.headCoachId && (!c.loginDisabled || draft.coachIds.includes(c.id))
  );
  // Same idea for the head-coach/owner picker just below.
  const assignableCoaches = allCoaches.filter((c) => !c.loginDisabled || c.id === draft.headCoachId);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto px-6 py-8">

      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Academies</h1>
        </div>
        {user?.role === "platform_admin" && (
          <button type="button" onClick={openAdd}
            className="px-5 py-2.5 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 transition-opacity cursor-pointer">
            + New Academy
          </button>
        )}
      </div>

      {/* Stats */}
      <StatsGrid columns={4}>
        <StatCard label="Total academies" value={academies.length} />
        <StatCard label="Active programs" value={activeCount} color="text-pace-green"
          onClick={() => { setStatusFilter((prev) => (prev === "Active" ? "All" : "Active")); setPage(1); }} active={statusFilter === "Active"} />
        <StatCard label="Total players" value={grandTotal} color="text-amber" />
        <StatCard label="Inactive" value={inactiveCount} color="text-zinc-400"
          onClick={() => { setStatusFilter((prev) => (prev === "Inactive" ? "All" : "Inactive")); setPage(1); }} active={statusFilter === "Inactive"} />
      </StatsGrid>

      {/* Filter bar — the old "Sort: …" dropdown is gone now that the table's own column headers
          are click-to-sort (see SortableHeader below), same as Coaches/Players. */}
      <div className="bg-surface rounded-2xl p-4 mb-6 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name or location…"
            className="w-full bg-ink rounded-xl pl-9 pr-4 py-2.5 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none text-sm" />
        </div>
        <div className="flex gap-1">
          {(["All", "Active", "Inactive"] as const).map((s) => (
            <button key={s} type="button" onClick={() => { setStatusFilter(s); setPage(1); }}
              className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                statusFilter === s ? "bg-pace-green text-black" : "bg-ink text-zinc-400 hover:text-white border border-zinc-700"
              }`}>{s}</button>
          ))}
        </div>
        <select value={stageFilter} onChange={(e) => { setStageFilter(e.target.value as "All" | AcademyStage); setPage(1); }}
          className="bg-ink text-white text-sm rounded-xl px-3 py-2.5 border border-zinc-700 focus:border-pace-green focus:outline-none cursor-pointer">
          <option value="All">All Stages</option>
          {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {savedId && (
        <div className="mb-4 px-5 py-3 rounded-xl bg-pace-green/10 border border-pace-green/30 text-pace-green text-sm font-semibold">
          ✓ Academy saved successfully
        </div>
      )}

      {/* List — a real table now (sortable columns, sticky Actions, pagination below), matching
          Coaches/Players. The accordion detail management (Players/Coaches/Pricing/Nets tabs)
          still lives directly underneath a clicked row exactly as before, unchanged — this phase
          only replaces the outer shell; dedicated View/Edit pages come in a later phase. */}
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
        <div className="bg-surface rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-700/60">
                  <SortableHeader label="Academy" sortKey="name" activeKey={sortKey} direction={sortDir} onSort={handleSort} className="pl-6" />
                  <SortableHeader label="Stage" sortKey="stage" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                  <SortableHeader label="Status" sortKey="status" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                  <SortableHeader label="Players" sortKey="players" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                  <SortableHeader label="Coaches" sortKey="coaches" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                  <SortableHeader label="Location" sortKey="location" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                  <th className="sticky right-0 bg-surface text-right text-xs font-semibold text-zinc-300 uppercase tracking-wider px-4 py-3 pr-6 whitespace-nowrap shadow-[-8px_0_8px_-4px_rgba(0,0,0,0.3)]">Actions</th>
                </tr>
              </thead>
              <tbody>
          {pageAcademies.map((academy) => {
            const canManage       = user?.role === "platform_admin" || (user?.role === "academy_admin" && user.academyId === academy.id);
            const assignedPlayers = allPlayers.filter((p) => academy.playerIds.includes(p.id));
            const assignedCoaches = allCoaches.filter((c) => (academy.coachIds ?? []).includes(c.id));
            const rowBg = savedId === academy.id ? "bg-pace-green/5" : "bg-surface";

            // Billing/Edit Academy/Deactivate collapse into one ⋮ menu for whichever role can act
            // on this academy — previously Billing+Edit were separate always-visible buttons only
            // an academy_admin got, and Deactivate lived in a platform_admin-only menu; folding
            // them together matches Coaches' own row, where every secondary action sits behind one
            // ⋮ regardless of role, rather than each role getting a different set of loose buttons.
            const menuItems = [
              ...(canManage ? [{
                label: "Billing",
                icon: <CreditCardIcon width={14} height={14} />,
                onClick: () => router.push(`/academies/${academy.id}/billing`),
              }] : []),
              ...(canManage ? [{
                label: "Edit Academy",
                icon: <EditIcon width={14} height={14} />,
                onClick: () => handleMenuAction("edit", academy),
              }] : []),
              ...(user?.role === "platform_admin" ? [{
                label: academy.status === "Active" ? "Deactivate" : "Activate",
                dividerBefore: true,
                variant: academy.status === "Active" ? "warning" as const : "success" as const,
                icon: academy.status === "Active" ? <PowerOffIcon width={14} height={14} /> : <PowerIcon width={14} height={14} />,
                onClick: () => handleMenuAction("toggleStatus", academy),
              }] : []),
            ];

            return (
              <tr key={academy.id}
                className={`border-b border-zinc-700/40 last:border-0 transition-colors cursor-pointer select-none ${
                  savedId === academy.id ? "bg-pace-green/5" : "hover:bg-surface/80"
                }`}
                onClick={() => router.push(`/academies/${academy.id}`)}
              >
                <td className="px-4 py-4 pl-6">
                  <span className="text-white font-medium text-sm whitespace-nowrap">{academy.name}</span>
                </td>
                <td className="px-4 py-4 whitespace-nowrap">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STAGE_STYLES[academy.stage]}`}>{academy.stage}</span>
                </td>
                <td className="px-4 py-4 whitespace-nowrap">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                    academy.status === "Active" ? "bg-pace-green/20 text-pace-green" : "bg-zinc-700 text-zinc-400"
                  }`}>{academy.status}</span>
                </td>
                <td className="px-4 py-4 text-sm font-bold text-pace-green font-mono">{assignedPlayers.length}</td>
                <td className="px-4 py-4 text-sm font-bold text-blue-400 font-mono">{assignedCoaches.length}</td>
                <td className="px-4 py-4 text-sm text-zinc-400 whitespace-nowrap">{academy.location || <span className="text-zinc-600">—</span>}</td>
                <td className={`sticky right-0 px-4 py-4 pr-6 text-right transition-colors shadow-[-8px_0_8px_-4px_rgba(0,0,0,0.3)] ${rowBg}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex justify-end">
                    <RowActionsMenu items={menuItems} />
                  </div>
                </td>
              </tr>
            );
          })}
              </tbody>
            </table>
          </div>
          <PaginationFooter
            label={
              <p className="text-xs text-zinc-400">
                Showing {displayed.length === 0 ? 0 : (currentPage - 1) * academiesPerPage + 1}–{Math.min(currentPage * academiesPerPage, displayed.length)} of {displayed.length}
              </p>
            }
            page={currentPage}
            totalPages={totalPages}
            onPageChange={setPage}
            itemsPerPage={academiesPerPage}
            onItemsPerPageChange={(n) => { setAcademiesPerPage(n); setPage(1); }}
            className="px-6 py-3 border-t border-zinc-700/60"
          />
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
          error={formError}
          onConfirm={handleConfirmToggle}
          onCancel={() => { setConfirmToggle(null); setFormError(""); }}
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
                        {assignableCoaches.map((c) => (
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
                      <span className="text-xs text-zinc-500">Each coach receives revenue for the bookings and memberships tied to them directly.</span>
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
