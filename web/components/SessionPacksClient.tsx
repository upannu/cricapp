"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Papa from "papaparse";
import type { SessionPack, BookingType, Player, Coach, Academy, PaymentStatus, Plan, PackFeeDue, GroupSession, MembershipPlanTemplate } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { fetchSessionPacks, fetchPlayers, fetchAcademies, fetchCoaches, fetchActivePlans, fetchPackFeeDues, upsertSessionPack, insertSessionPacks, updatePackPaymentStatus, markPackPaid, fetchGroupSessions, setGroupSessionRoster, fetchCurrentMembershipPlanTemplates } from "@/lib/db";
import { formatDate, getCoachOrAcademyLabel, getPlatformFeePercent, isPackCreditExpired, matchPlayerByNameOrEmail } from "@/lib/utils";
import { DateInput } from "@/components/DateInput";
import { StatsGrid } from "@/components/StatsGrid";
import { StatCard } from "@/components/StatCard";
import { DEFAULT_CURRENCY, formatMoney, sumMoneyByCurrency } from "@/lib/currency";
import { DAY_TOKENS } from "@/lib/cron-time";
import { SortableHeader } from "@/components/SortableHeader";
import { useSort } from "@/lib/useSort";
import { PaginationFooter } from "@/components/PaginationFooter";
import { RowActionsMenu } from "@/components/RowActionsMenu";
import { SelectPill } from "@/components/SelectPill";
import { ConfirmModal } from "@/components/ConfirmModal";
import { EyeIcon, EditIcon, CreditCardIcon, RepeatIcon } from "@/components/icons";

const PACK_CSV_TEMPLATE = "player,totalSessions\nJohn Smith,10\njane@example.com,\n";
type PackCsvStatus = "ready" | "duplicate" | "skipped";
type PackCsvRow = {
  rowNum: number; playerInput: string; player: Player | undefined;
  totalSessions: number; feePerSession: number; csvStatus: PackCsvStatus; issue: string;
};
type BulkPackSettings = { academyId: string; purchaseDate: string; totalSessions: number; agreedDays: string[]; groupSessionIds: string[] };

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
let _packPlans: Plan[] = [];
let _packGroupSessions: GroupSession[] = [];
let _packPlanTemplates: MembershipPlanTemplate[] = [];

// A Membership is always for "Net Session" (see the fixed badge in the form below) — so the
// squad training sessions it can bind to are this academy's active Net Session group sessions.
// Binding to a real GroupSession (rather than a freeform weekday picker) is what keeps a
// player's agreedDays in sync with a session that actually exists and that they're actually
// rostered on — see group-session-players sync in handleSave/handlePackCsvImport below (and the
// per-player roster editor on MembershipProfileClient's own View page).
function groupSessionsForAcademy(academyId: string): GroupSession[] {
  return _packGroupSessions.filter((g) => g.academyId === academyId && g.active && g.sessionType === "Net Session");
}

function deriveAgreedDays(groupSessionIds: string[]): string[] {
  const days = groupSessionIds
    .map((id) => _packGroupSessions.find((g) => g.id === id))
    .filter((g): g is GroupSession => !!g)
    .map((g) => DAY_TOKENS[g.dayOfWeek]);
  return Array.from(new Set(days));
}

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

function sessionsRemaining(pk: SessionPack) {
  const usableCredits = isPackCreditExpired(pk) ? 0 : pk.sessionCredits;
  return pk.totalSessions - pk.sessionsUsed + usableCredits;
}

type PackSortKey = "player" | "academy" | "coach" | "remaining" | "status";

function comparePackRows(a: { player: Player; pack?: SessionPack }, b: { player: Player; pack?: SessionPack }, sortKey: PackSortKey): number {
  switch (sortKey) {
    case "player": return a.player.name.localeCompare(b.player.name);
    case "academy": return (academyById(a.pack?.academyId ?? "")?.name ?? "").localeCompare(academyById(b.pack?.academyId ?? "")?.name ?? "");
    case "coach": return getCoachOrAcademyLabel(a.player, _packCoaches, _packAcademies).localeCompare(getCoachOrAcademyLabel(b.player, _packCoaches, _packAcademies));
    case "remaining": return (a.pack ? sessionsRemaining(a.pack) : -1) - (b.pack ? sessionsRemaining(b.pack) : -1);
    case "status": return (a.pack?.status ?? "").localeCompare(b.pack?.status ?? "");
    default: return 0;
  }
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("");
}

type DraftPack = Omit<SessionPack, "id" | "status" | "sessionsUsed" | "sessionCredits" | "paidDate"> & { groupSessionIds: string[] };

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
  groupSessionIds: [],
};

type FilterType = "All" | "Active" | "Exhausted" | "No Membership";
type PageTab = "Memberships" | "Fees Due" | "Platform Fees";

export function SessionPacksClient() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const formRef = useRef<HTMLDivElement>(null);

  const [dataLoaded, setDataLoaded] = useState(false);
  const [packs, setPacks] = useState<SessionPack[]>([]);
  const [feeDues, setFeeDues] = useState<PackFeeDue[]>([]);
  const [pageTab, setPageTab] = useState<PageTab>("Memberships");
  const [filter, setFilter] = useState<FilterType>("All");
  const [academyFilter, setAcademyFilter] = useState("");
  const [coachFilter, setCoachFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [packsPerPage, setPacksPerPage] = useState(10);
  const { sortKey, sortDir, handleSort } = useSort<PackSortKey>("player");
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<DraftPack>(EMPTY_DRAFT);
  // UI-only — which plan template pre-filled the fields below, if any. Not saved onto the
  // membership itself: session_packs copies totalSessions/feePerSession at creation time and
  // never live-references a template (see MembershipPlanTemplate's own doc comment), so a
  // template's later edits can't retroactively change an already-created membership's price.
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [formError, setFormError] = useState("");
  const [markPaidTarget, setMarkPaidTarget] = useState<{ packId: string; playerName: string } | null>(null);
  const [markPaidDate, setMarkPaidDate] = useState(today);
  const [markingPaid, setMarkingPaid] = useState(false);

  // Bulk row selection + actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMarkPaidOpen, setBulkMarkPaidOpen] = useState(false);
  const [bulkMarkPaidDate, setBulkMarkPaidDate] = useState(today);
  const [bulkMarkingPaid, setBulkMarkingPaid] = useState(false);
  const [bulkRenewOpen, setBulkRenewOpen] = useState(false);
  const [bulkRenewing, setBulkRenewing] = useState(false);

  // Bulk pack CSV import
  const [showBulkForm, setShowBulkForm] = useState(false);
  const [bulkSettings, setBulkSettings] = useState<BulkPackSettings>({ academyId: "", purchaseDate: today, totalSessions: 10, agreedDays: [], groupSessionIds: [] });
  const [packCsvRows, setPackCsvRows] = useState<PackCsvRow[]>([]);
  const [packCsvFileName, setPackCsvFileName] = useState("");
  const [packCsvError, setPackCsvError] = useState("");
  const [packCsvImporting, setPackCsvImporting] = useState(false);
  const [packCsvImportedCount, setPackCsvImportedCount] = useState<number | null>(null);

  useEffect(() => {
    const coachId = user?.role === "coach" ? user.coachId : undefined;
    const academyId = user?.role === "academy_admin" ? user.academyId : undefined;
    Promise.all([
      fetchPlayers(coachId, academyId),
      fetchAcademies(),
      fetchCoaches(academyId),
      fetchActivePlans(),
      fetchGroupSessions(academyId, coachId),
      fetchCurrentMembershipPlanTemplates(academyId),
    ]).then(([pl, ac, co, plans, gs, pt]) => {
      _packPlayers = pl; _packAcademies = ac; _packCoaches = co; _packPlans = plans; _packGroupSessions = gs;
      _packPlanTemplates = pt.filter((t) => t.status === "active");
      const scopedPlayerIds = (coachId || academyId) ? pl.map((p) => p.id) : undefined;
      return fetchSessionPacks(scopedPlayerIds);
    }).then((pk) => {
      setPacks(pk);
      setDataLoaded(true);
    });
    fetchPackFeeDues().then(setFeeDues).catch(() => {
      // RLS naturally scopes this to what the caller can see (platform_admin sees all, an
      // academy/coach sees only their own) — swallow rather than surface a loud error to a
      // player/parent role who has no rows to see anyway.
    });
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Opened from Attendance's "no active pack for this player" dead-end
  // (/session-packs?playerId=…) — jump straight into the New Pack form for that player, the same
  // prefill the per-row "+ New Pack" button does.
  useEffect(() => {
    if (!dataLoaded || user?.role === "coach") return;
    const pid = searchParams.get("playerId");
    if (!pid || !_packPlayers.some((p) => p.id === pid)) return;
    openAddForPlayer(pid);
    router.replace("/session-packs");
  }, [dataLoaded, searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  function resolvedPaymentStatus(pk: SessionPack): PaymentStatus {
    return pk.paymentStatus;
  }

  async function handleMarkPaid(packId: string, paidDate: string) {
    markPackPaid(packId, paidDate);
    setPacks((prev) => prev.map((pk) => pk.id === packId ? { ...pk, paymentStatus: "Paid", paidDate } : pk));
    // Paid outside Stripe (cash/bank transfer) means the platform's own fee cut was never
    // collected the way a real Checkout payment collects it automatically — record what's owed.
    try {
      const res = await fetch("/api/packs/record-fee-due", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ packId }),
      });
      const data = await res.json();
      if (res.ok && !data.error) {
        const fresh = await fetchPackFeeDues();
        setFeeDues(fresh);
      }
    } catch {
      // Best-effort — a coach's own "mark paid" flow shouldn't fail on this bookkeeping step.
    }
  }

  function handleReactivate(playerId: string) {
    // _packPlayers is a module-level cache, not React state — mutate it in place, then force a
    // re-render by touching `packs` so the scopedPlayers memo (keyed on [packs]) re-reads it.
    _packPlayers = _packPlayers.map((p) => p.id === playerId ? { ...p, loginDisabled: false, disabledAt: null, disabledReason: null } : p);
    setPacks((prev) => [...prev]);
  }


  const scopedPlayers = useMemo(() => _packPlayers, [packs]);
  const scopedPacks = packs;

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

  const searchTerm = search.trim().toLowerCase();
  const filteredPlayers = useMemo(() => {
    return scopedPlayers.filter((p) => {
      const pack = scopedPacks.find((pk) => pk.playerId === p.id);
      if (filter === "Active")   { if (pack?.status !== "Active") return false; }
      else if (filter === "Exhausted") { if (pack?.status !== "Exhausted") return false; }
      else if (filter === "No Membership")  { if (pack) return false; }
      if (academyFilter && pack?.academyId !== academyFilter) return false;
      if (coachFilter && p.coachId !== coachFilter) return false;
      if (searchTerm && !p.name.toLowerCase().includes(searchTerm)) return false;
      return true;
    });
  }, [filter, academyFilter, coachFilter, scopedPlayers, scopedPacks, searchTerm]);

  const sortedRows = useMemo(() => {
    const rows = filteredPlayers.map((player) => ({ player, pack: scopedPacks.find((pk) => pk.playerId === player.id) }));
    const sorted = [...rows].sort((a, b) => comparePackRows(a, b, sortKey));
    return sortDir === "asc" ? sorted : sorted.reverse();
  }, [filteredPlayers, scopedPacks, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / packsPerPage));
  const currentPage = Math.min(page, totalPages);
  const pageRows = sortedRows.slice((currentPage - 1) * packsPerPage, currentPage * packsPerPage);

  function handleSearchChange(v: string) { setSearch(v); setPage(1); }

  const academyFilterOptions: { value: string; label: string }[] = [
    { value: "", label: "Academy" },
    ...[..._packAcademies].sort((a, b) => a.name.localeCompare(b.name)).map((a) => ({ value: a.id, label: a.name })),
  ];
  const coachFilterOptions: { value: string; label: string }[] = [
    { value: "", label: "Coach" },
    ...[..._packCoaches].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ value: c.id, label: c.name })),
  ];
  const hasActiveFilters = filter !== "All" || academyFilter !== "" || coachFilter !== "";
  function clearAllFilters() { setFilter("All"); setAcademyFilter(""); setCoachFilter(""); setPage(1); }

  // ── Form helpers ──────────────────────────────────────────────────────────
  function openAdd() {
    const defaultAcademy = user?.role === "academy_admin" ? (user.academyId ?? "") : "";
    const fee = defaultAcademy ? feeForAcademyAndType(defaultAcademy, "Net Session") : 0;
    setDraft({ ...EMPTY_DRAFT, purchaseDate: today, academyId: defaultAcademy, sessionType: "Net Session", feePerSession: fee });
    setSelectedTemplateId("");
    setFormError("");
    setShowForm(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  // Open the New Pack form already scoped to one player — used by the per-row "+ New Pack" button
  // and by the ?playerId= deep link from Attendance's "no active pack" dead-end.
  function openAddForPlayer(playerId: string) {
    setDraft({
      ...EMPTY_DRAFT, playerId, purchaseDate: today,
      academyId: user?.role === "academy_admin" ? (user.academyId ?? "") : "",
      feePerSession: 0,
    });
    setSelectedTemplateId("");
    setFormError("");
    setShowForm(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function handleAcademyChange(academyId: string) {
    const fee = feeForAcademyAndType(academyId, draft.sessionType, draft.playerId);
    setDraft({ ...draft, academyId, feePerSession: fee });
    // Templates are academy-scoped — a previously-picked one from a different academy no longer applies.
    setSelectedTemplateId("");
  }

  function handleSelectTemplate(templateId: string) {
    setSelectedTemplateId(templateId);
    if (!templateId) return;
    const template = _packPlanTemplates.find((t) => t.id === templateId);
    if (!template) return;
    // A fee-waived academy's fee input is disabled and forced to 0 (see feeForAcademyAndType) —
    // a template's own stored fee must not silently override that, or a waived membership would
    // save with a real fee_per_session despite the UI showing "no session fee" right next to it.
    const fee = academyWaivesFees(draft.academyId) ? 0 : template.feePerSession;
    setDraft({ ...draft, totalSessions: template.totalSessions, feePerSession: fee });
  }

  // ── Bulk pack CSV import ────────────────────────────────────────────────
  function openBulkAdd() {
    const defaultAcademy = user?.role === "academy_admin" ? (user.academyId ?? "") : "";
    setBulkSettings({ academyId: defaultAcademy, purchaseDate: today, totalSessions: 10, agreedDays: [], groupSessionIds: [] });
    setPackCsvRows([]); setPackCsvFileName(""); setPackCsvError(""); setPackCsvImportedCount(null);
    setShowBulkForm(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function handleToggleBulkGroupSession(groupSessionId: string) {
    setBulkSettings((prev) => {
      const groupSessionIds = prev.groupSessionIds.includes(groupSessionId)
        ? prev.groupSessionIds.filter((id) => id !== groupSessionId)
        : [...prev.groupSessionIds, groupSessionId];
      return { ...prev, groupSessionIds, agreedDays: deriveAgreedDays(groupSessionIds) };
    });
  }

  function downloadPackCsvTemplate() {
    const blob = new Blob([PACK_CSV_TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "memberships-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handlePackCsvFile(file: File) {
    setPackCsvError(""); setPackCsvImportedCount(null); setPackCsvFileName(file.name);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          setPackCsvError(`Could not parse the file: ${results.errors[0].message}`);
          setPackCsvRows([]);
          return;
        }
        const seenPlayerIds = new Set<string>();
        const rows: PackCsvRow[] = results.data.map((raw, i) => {
          const get = (key: string) => raw[key] ?? raw[key.toLowerCase()] ?? raw[key.toUpperCase()] ?? "";
          const playerInput = get("player").trim() || get("name").trim() || get("email").trim();
          const totalSessionsRaw = get("totalSessions").trim();
          const totalSessions = totalSessionsRaw ? parseInt(totalSessionsRaw, 10) || bulkSettings.totalSessions : bulkSettings.totalSessions;

          let csvStatus: PackCsvStatus = "ready";
          let issue = "";
          const player = matchPlayerByNameOrEmail(scopedPlayers, playerInput);
          if (!player) { issue = "Player not found"; csvStatus = "skipped"; }

          if (csvStatus !== "skipped" && player) {
            if (seenPlayerIds.has(player.id)) {
              issue = "Duplicate player in this file — first occurrence used";
              csvStatus = "duplicate";
            } else {
              seenPlayerIds.add(player.id);
              const hasActivePack = scopedPacks.some((pk) =>
                pk.playerId === player.id && pk.academyId === bulkSettings.academyId
                && pk.sessionType === "Net Session" && pk.status === "Active");
              if (hasActivePack) {
                issue = "Already has an active membership for this academy — creating another would break attendance recording";
                csvStatus = "duplicate";
              }
            }
          }

          const feePerSession = player && csvStatus !== "skipped"
            ? feeForAcademyAndType(bulkSettings.academyId, "Net Session", player.id)
            : 0;

          return { rowNum: i + 2, playerInput, player, totalSessions, feePerSession, csvStatus, issue };
        });
        setPackCsvRows(rows);
      },
      error: (err) => {
        setPackCsvError(err.message);
        setPackCsvRows([]);
      },
    });
  }

  async function handlePackCsvImport() {
    if (!bulkSettings.academyId) { setPackCsvError("Please select an academy first."); return; }
    if (bulkSettings.groupSessionIds.length === 0) { setPackCsvError("Please select at least one squad training session."); return; }
    const ready = packCsvRows.filter((r) => r.csvStatus === "ready" && r.player);
    if (ready.length === 0) return;
    setPackCsvImporting(true);
    setPackCsvError("");
    try {
      const waived = academyWaivesFees(bulkSettings.academyId);
      const paymentStatus: PaymentStatus = waived ? "Paid" : "Pending";
      const paymentDueDate = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
      const newPacks: SessionPack[] = ready.map((row, i) => ({
        id: `sp_${Date.now()}_${i}`,
        playerId: row.player!.id,
        academyId: bulkSettings.academyId,
        sessionType: "Net Session",
        purchaseDate: bulkSettings.purchaseDate,
        totalSessions: row.totalSessions,
        sessionsUsed: 0,
        sessionCredits: 0,
        feePerSession: row.feePerSession,
        status: "Active",
        paymentStatus,
        paymentDueDate,
        paidDate: null,
        agreedDays: bulkSettings.agreedDays,
      }));

      await insertSessionPacks(newPacks.map((p) => ({
        id: p.id, player_id: p.playerId, academy_id: p.academyId,
        session_type: p.sessionType, purchase_date: p.purchaseDate,
        total_sessions: p.totalSessions, sessions_used: 0, session_credits: 0,
        fee_per_session: p.feePerSession, status: "Active",
        payment_status: p.paymentStatus, payment_due_date: p.paymentDueDate,
        agreed_days: p.agreedDays,
      })));

      // Best-effort, one per newly created pack — a failed notification should never undo or
      // error the import itself. Skipped entirely when the academy waives fees (nothing owed).
      if (!waived) {
        for (const p of newPacks) {
          fetch("/api/packs/notify-created", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ packId: p.id }),
          }).catch(() => {});
        }
      }

      // Roster sync — every imported player needs to actually be on each selected squad
      // training session's roster, not just have a pack that claims those days.
      for (const gsId of bulkSettings.groupSessionIds) {
        const gs = _packGroupSessions.find((g) => g.id === gsId);
        if (!gs) continue;
        const newIds = ready.map((r) => r.player!.id).filter((id) => !gs.playerIds.includes(id));
        if (newIds.length === 0) continue;
        const updatedRoster = [...gs.playerIds, ...newIds];
        await setGroupSessionRoster(gsId, updatedRoster);
        _packGroupSessions = _packGroupSessions.map((g) => g.id === gsId ? { ...g, playerIds: updatedRoster } : g);
      }

      setPacks((prev) => [...newPacks, ...prev]);
      setPackCsvImportedCount(newPacks.length);
      setPackCsvRows([]);
      setPackCsvFileName("");
    } catch (err) {
      setPackCsvError((err as { message?: string })?.message ?? String(err));
    } finally {
      setPackCsvImporting(false);
    }
  }

  function handleToggleDraftGroupSession(groupSessionId: string) {
    const groupSessionIds = draft.groupSessionIds.includes(groupSessionId)
      ? draft.groupSessionIds.filter((id) => id !== groupSessionId)
      : [...draft.groupSessionIds, groupSessionId];
    setDraft({ ...draft, groupSessionIds, agreedDays: deriveAgreedDays(groupSessionIds) });
  }

  function handlePlayerChange(playerId: string) {
    const fee = draft.academyId ? feeForAcademyAndType(draft.academyId, draft.sessionType, playerId) : 0;
    // Default the pack's payout coach to the player's own assigned coach — only meaningful once
    // the academy is in split-payout mode, but harmless (and useful) to populate regardless.
    const player = playerById(playerId);
    setDraft({ ...draft, playerId, feePerSession: fee || draft.feePerSession, coachId: player?.coachId ?? draft.coachId });
  }

  async function handleSave() {
    if (!draft.playerId) { setFormError("Please select a player."); return; }
    if (!draft.academyId) { setFormError("Please select an academy."); return; }
    if (draft.feePerSession <= 0 && !academyWaivesFees(draft.academyId)) {
      setFormError("Session fee must be greater than $0.");
      return;
    }
    if (draft.groupSessionIds.length === 0) {
      setFormError("Please select at least one squad training session.");
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
      paidDate: null,
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

    // Best-effort — a failed notification email/SMS should never undo or error the pack itself.
    // Skipped for a waived pack: nothing's actually owed, so there's nothing to notify about.
    if (!waived) {
      fetch("/api/packs/notify-created", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ packId: newPack.id }),
      }).catch(() => {});
    }

    // Roster sync — the player needs to actually be on each selected squad training session's
    // roster, not just have a pack that claims those days (see groupSessionsForAcademy).
    for (const gsId of draft.groupSessionIds) {
      const gs = _packGroupSessions.find((g) => g.id === gsId);
      if (!gs || gs.playerIds.includes(draft.playerId)) continue;
      const updatedRoster = [...gs.playerIds, draft.playerId];
      await setGroupSessionRoster(gsId, updatedRoster);
      _packGroupSessions = _packGroupSessions.map((g) => g.id === gsId ? { ...g, playerIds: updatedRoster } : g);
    }

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

  const canAddPack = user?.role !== "coach";

  // Used by the per-row "Renew Membership" action — carries the previous pack's academy/fee/
  // squad sessions forward rather than starting from a blank form.
  function openRenew(player: Player, pack: SessionPack) {
    setDraft({
      playerId: player.id, academyId: pack.academyId, sessionType: "Net Session", purchaseDate: today,
      totalSessions: 10, feePerSession: pack.feePerSession, paymentStatus: "Pending",
      paymentDueDate: new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
      agreedDays: pack.agreedDays,
      groupSessionIds: groupSessionsForAcademy(pack.academyId).filter((g) => g.playerIds.includes(player.id)).map((g) => g.id),
    });
    setFormError("");
    setShowForm(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  async function handleConfirmMarkPaid() {
    if (!markPaidTarget) return;
    setMarkingPaid(true);
    await handleMarkPaid(markPaidTarget.packId, markPaidDate);
    setMarkingPaid(false);
    setMarkPaidTarget(null);
  }

  // "Select all" (and its indeterminate state) covers every row currently matching the active
  // search/filters, not just the visible page — narrowing a search after selecting some players
  // deliberately leaves the now-hidden selections alone rather than silently dropping them, same
  // convention Players' own bulk-select already uses.
  const allSelected = sortedRows.length > 0 && sortedRows.every((r) => selectedIds.has(r.player.id));
  const someSelected = sortedRows.some((r) => selectedIds.has(r.player.id)) && !allSelected;

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
      if (allSelected) sortedRows.forEach((r) => next.delete(r.player.id));
      else sortedRows.forEach((r) => next.add(r.player.id));
      return next;
    });
  }

  function clearSelection() { setSelectedIds(new Set()); }

  const selectedRows = sortedRows.filter((r) => selectedIds.has(r.player.id));
  const selectedPacksPendingPayment = selectedRows.filter((r) => r.pack && r.pack.paymentStatus !== "Paid").map((r) => r.pack!);
  const selectedExhaustedRows = selectedRows.filter((r): r is { player: Player; pack: SessionPack } => !!r.pack && r.pack.status === "Exhausted");

  async function handleConfirmBulkMarkPaid() {
    setBulkMarkingPaid(true);
    // Sequential, not Promise.all — handleMarkPaid's own record-fee-due call and state update
    // shouldn't race across packs.
    for (const pack of selectedPacksPendingPayment) {
      await handleMarkPaid(pack.id, bulkMarkPaidDate);
    }
    setBulkMarkingPaid(false);
    setBulkMarkPaidOpen(false);
    clearSelection();
  }

  // Mirrors openRenew's own single-pack prefill, but applied directly (no form step) to every
  // selected Exhausted membership at once — each new pack carries forward that specific player's
  // prior academy/coach/fee/agreed days, not a single shared setting like the bulk CSV importer.
  async function handleConfirmBulkRenew() {
    setBulkRenewing(true);
    const renewed: SessionPack[] = [];
    for (const { player, pack } of selectedExhaustedRows) {
      const waived = academyWaivesFees(pack.academyId);
      const newPack: SessionPack = {
        id: `sp_${Date.now()}_${player.id}`,
        playerId: player.id, academyId: pack.academyId, coachId: pack.coachId,
        sessionType: "Net Session", purchaseDate: today, totalSessions: 10,
        sessionsUsed: 0, sessionCredits: 0, feePerSession: pack.feePerSession,
        status: "Active", paymentStatus: waived ? "Paid" : "Pending",
        paymentDueDate: new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
        paidDate: null, agreedDays: pack.agreedDays,
      };
      await upsertSessionPack({
        id: newPack.id, player_id: newPack.playerId, academy_id: newPack.academyId,
        coach_id: newPack.coachId ?? null, session_type: newPack.sessionType,
        purchase_date: newPack.purchaseDate, total_sessions: newPack.totalSessions,
        sessions_used: 0, session_credits: 0, fee_per_session: newPack.feePerSession,
        status: "Active", payment_status: newPack.paymentStatus, payment_due_date: newPack.paymentDueDate,
        agreed_days: newPack.agreedDays,
      });
      if (!waived) {
        fetch("/api/packs/notify-created", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ packId: newPack.id }),
        }).catch(() => {});
      }
      renewed.push(newPack);
    }
    setPacks((prev) => {
      const byPlayer = new Map(prev.map((pk) => [pk.playerId, pk] as const));
      for (const r of renewed) byPlayer.set(r.playerId, r);
      return Array.from(byPlayer.values());
    });
    setBulkRenewing(false);
    setBulkRenewOpen(false);
    clearSelection();
  }

  function handleExportCsv() {
    const rows = selectedRows.map(({ player, pack }) => ({
      name: player.name, ageGroup: player.ageGroup,
      academy: pack ? (academyById(pack.academyId)?.name ?? "") : "",
      coach: getCoachOrAcademyLabel(player, _packCoaches, _packAcademies),
      sessionsRemaining: pack ? sessionsRemaining(pack) : "",
      status: pack?.status ?? "No Membership",
      paymentStatus: pack?.paymentStatus ?? "",
    }));
    const blob = new Blob([Papa.unparse(rows)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `memberships-export-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function renderPackRow(player: Player, pack?: SessionPack) {
    const remaining = pack ? sessionsRemaining(pack) : null;
    const academy = pack ? academyById(pack.academyId) : undefined;
    const isSelected = selectedIds.has(player.id);
    return (
      <tr key={player.id} className={`border-b border-zinc-700/40 last:border-0 transition-colors ${isSelected ? "bg-blue-500/5" : "hover:bg-surface/80"}`}>
        <td className="px-4 py-4 pl-6 text-center">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleSelect(player.id)}
            className="w-4 h-4 accent-pace-green cursor-pointer"
            title="Select for bulk actions"
          />
        </td>
        <td className="px-4 py-4">
          <button type="button" onClick={() => router.push(pack ? `/session-packs/${pack.id}` : `/players/${player.id}`)}
            className="flex items-center gap-3 text-left cursor-pointer group">
            <div className="w-9 h-9 rounded-full bg-pace-green/20 text-pace-green flex items-center justify-center text-sm font-bold flex-shrink-0">
              {initials(player.name)}
            </div>
            <div>
              <p className="text-white text-sm font-medium whitespace-nowrap group-hover:text-pace-green transition-colors">{player.name}</p>
              <p className="text-zinc-400 text-xs">{player.ageGroup}</p>
            </div>
          </button>
        </td>
        <td className="px-4 py-4 text-zinc-300 text-xs whitespace-nowrap">{academy?.name ?? "—"}</td>
        <td className="px-4 py-4 text-zinc-300 text-xs whitespace-nowrap">{getCoachOrAcademyLabel(player, _packCoaches, _packAcademies)}</td>
        <td className="px-4 py-4 text-sm font-semibold whitespace-nowrap">
          {pack ? (
            <span className={remaining === 0 ? "text-red-400" : remaining! <= 2 ? "text-amber" : "text-white"}>{remaining}</span>
          ) : (
            <span className="text-zinc-600">—</span>
          )}
        </td>
        <td className="px-4 py-4">
          {pack ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${
                pack.status === "Active" ? "bg-pace-green/20 text-pace-green" : "bg-zinc-700 text-zinc-400"
              }`}>
                {pack.status}
              </span>
              {pack.paymentStatus !== "Paid" && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold border whitespace-nowrap ${
                  pack.paymentStatus === "Overdue"
                    ? "bg-red-500/15 text-red-400 border-red-500/30"
                    : "bg-amber/15 text-amber border-amber/30"
                }`}>
                  Fee {pack.paymentStatus}
                </span>
              )}
            </div>
          ) : (
            <span className="text-zinc-600 text-xs whitespace-nowrap">No Membership</span>
          )}
        </td>
        <td className="sticky right-0 z-10 bg-surface px-4 py-4 pr-6">
          <RowActionsMenu items={pack ? [
            { label: "View", icon: <EyeIcon />, onClick: () => router.push(`/session-packs/${pack.id}`) },
            { label: "Edit", icon: <EditIcon />, onClick: () => router.push(`/session-packs/${pack.id}/edit`) },
            ...(pack.paymentStatus !== "Paid" ? [{
              label: "Mark Paid (Cash)", icon: <CreditCardIcon />,
              onClick: () => { setMarkPaidTarget({ packId: pack.id, playerName: player.name }); setMarkPaidDate(today); },
            }] : []),
            ...(pack.status === "Exhausted" && canAddPack ? [{
              label: "Renew Membership", icon: <RepeatIcon />, dividerBefore: true,
              onClick: () => openRenew(player, pack),
            }] : []),
          ] : (canAddPack ? [
            { label: "+ New Membership", onClick: () => openAddForPlayer(player.id) },
          ] : [])} />
        </td>
      </tr>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Memberships</h1>
        </div>
        {canAddPack && (
          <div className="flex items-center gap-3">
            <Link href="/session-packs/plans"
              className="px-5 py-2.5 text-zinc-300 text-sm font-bold rounded-xl border border-zinc-700 hover:bg-zinc-800 transition-colors">
              Plan Templates
            </Link>
            <button type="button" onClick={openBulkAdd}
              className="px-5 py-2.5 text-pace-green text-sm font-bold rounded-xl border border-pace-green/40 hover:bg-pace-green/10 transition-colors cursor-pointer">
              Bulk Import Memberships
            </button>
            <button type="button" onClick={openAdd}
              className="px-5 py-2.5 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 transition-opacity cursor-pointer">
              + New Membership
            </button>
          </div>
        )}
      </div>

      {/* Stats */}
      <StatsGrid columns={4}>
        <StatCard label="Active memberships" value={String(activePacks.length)} color="text-pace-green"
          onClick={() => { setPageTab("Memberships"); setFilter("Active"); }}
          active={pageTab === "Memberships" && filter === "Active"} />
        <StatCard label="Sessions remaining" value={String(totalRemain)} color="text-white" />
        <StatCard label="Fees outstanding" value={sumMoneyByCurrency(feesDuePacks.map((pk) => ({ amount: pk.totalSessions * pk.feePerSession, currency: academyById(pk.academyId)?.currency ?? DEFAULT_CURRENCY })))} color={totalOutstanding > 0 ? "text-red-400" : "text-zinc-500"} />
        <StatCard label="Gross revenue" value={sumMoneyByCurrency(scopedPacks.map((pk) => ({ amount: pk.totalSessions * pk.feePerSession, currency: academyById(pk.academyId)?.currency ?? DEFAULT_CURRENCY })))} color="text-amber" />
      </StatsGrid>

      {/* Page tabs */}
      <div className="flex gap-2 mb-6">
        {(["Memberships", "Fees Due", "Platform Fees"] as PageTab[]).map((t) => {
          const isActive = pageTab === t;
          const pendingFeeDues = feeDues.filter((d) => d.status === "pending").length;
          const badge = t === "Fees Due" ? (feesDuePacks.length > 0 ? feesDuePacks.length : null)
            : t === "Platform Fees" ? (pendingFeeDues > 0 ? pendingFeeDues : null)
            : null;
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

      {/* Bulk import packs form */}
      {showBulkForm && (
        <div className="bg-surface rounded-2xl p-6 border border-pace-green/30 mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-pace-green mb-1">Bulk Import Memberships</h2>
          <p className="text-xs text-zinc-500 mb-6">Set the shared membership details below, then upload a player list — every matched player gets an identical Net Session membership (session count can be overridden per row).</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
            <div>
              <label className={lbl}>Academy *</label>
              <select
                value={bulkSettings.academyId}
                onChange={(e) => setBulkSettings({ ...bulkSettings, academyId: e.target.value })}
                className={sel}
                disabled={user?.role === "academy_admin"}
              >
                <option value="">— Select academy —</option>
                {_packAcademies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Purchase Date</label>
              <DateInput
                value={bulkSettings.purchaseDate}
                onChange={(v) => setBulkSettings({ ...bulkSettings, purchaseDate: v })}
                className={inp}
              />
            </div>
            <div>
              <label className={lbl}>Default Sessions per Membership</label>
              <select
                value={bulkSettings.totalSessions}
                onChange={(e) => setBulkSettings({ ...bulkSettings, totalSessions: parseInt(e.target.value) })}
                className={sel}
              >
                {[5, 10, 15, 20].map((n) => <option key={n} value={n}>{n} sessions</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={lbl}>Squad Training Session(s) *</label>
              <GroupSessionPicker
                academyId={bulkSettings.academyId}
                selectedIds={bulkSettings.groupSessionIds}
                coaches={_packCoaches}
                onToggle={handleToggleBulkGroupSession}
              />
            </div>
          </div>

          <div className="border-t border-zinc-700/50 pt-4">
            <div className="flex items-center justify-between mb-2">
              <label className={lbl}>Player CSV</label>
              <button type="button" onClick={downloadPackCsvTemplate}
                className="text-xs font-semibold text-pace-green hover:opacity-80 transition-opacity cursor-pointer">
                Download Template
              </button>
            </div>
            <input
              type="file" accept=".csv,text/csv"
              disabled={!bulkSettings.academyId || bulkSettings.agreedDays.length === 0}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePackCsvFile(f); }}
              className="text-sm text-zinc-300 w-full mb-2 disabled:opacity-50"
            />
            {(!bulkSettings.academyId || bulkSettings.agreedDays.length === 0) && (
              <p className="text-xs text-zinc-500 mb-2">Select an academy and at least one session day before uploading — these apply to every imported row.</p>
            )}
            {packCsvError && <p className="text-red-400 text-xs mb-2">{packCsvError}</p>}
            {packCsvImportedCount !== null && (
              <p className="text-pace-green text-xs mb-2">✓ Imported {packCsvImportedCount} membership{packCsvImportedCount === 1 ? "" : "s"} from {packCsvFileName}.</p>
            )}
            {packCsvRows.length > 0 && (
              <div className="border border-zinc-700 rounded-xl overflow-hidden mb-4">
                <table className="w-full text-xs">
                  <thead className="bg-ink text-zinc-500">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold">Player</th>
                      <th className="text-left px-3 py-2 font-semibold">Sessions</th>
                      <th className="text-left px-3 py-2 font-semibold">Fee/Session</th>
                      <th className="text-left px-3 py-2 font-semibold">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {packCsvRows.map((r) => (
                      <tr key={r.rowNum} className="border-t border-zinc-800">
                        <td className="px-3 py-2 text-zinc-300 truncate max-w-[160px]">{r.player?.name ?? r.playerInput}</td>
                        <td className="px-3 py-2 text-zinc-300">{r.totalSessions}</td>
                        <td className="px-3 py-2 text-zinc-300">{formatMoney(r.feePerSession, academyById(bulkSettings.academyId)?.currency ?? DEFAULT_CURRENCY)}</td>
                        <td className="px-3 py-2">
                          {r.csvStatus === "ready" && <span className="text-pace-green">Ready</span>}
                          {r.csvStatus === "duplicate" && <span className="text-amber" title={r.issue}>{r.issue}</span>}
                          {r.csvStatus === "skipped" && <span className="text-red-400" title={r.issue}>{r.issue}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button type="button" onClick={handlePackCsvImport}
              disabled={packCsvImporting || packCsvRows.filter((r) => r.csvStatus === "ready").length === 0}
              className="px-6 py-3 rounded-xl text-sm font-bold bg-pace-green text-black hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-60">
              {packCsvImporting ? "Importing…" : `Import ${packCsvRows.filter((r) => r.csvStatus === "ready").length} Membership${packCsvRows.filter((r) => r.csvStatus === "ready").length === 1 ? "" : "s"}`}
            </button>
            <button type="button" onClick={() => setShowBulkForm(false)}
              className="px-6 py-3 rounded-xl text-sm font-medium text-zinc-400 border border-zinc-700 hover:text-white hover:border-zinc-500 transition-colors cursor-pointer">
              Close
            </button>
          </div>
        </div>
      )}

      {/* New pack form */}
      {showForm && (
        <div className="bg-surface rounded-2xl p-6 border border-pace-green/30 mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-pace-green mb-6">New Membership</h2>

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
              <p className="text-xs text-zinc-500 mt-1.5">Memberships are only used for group net sessions — individual bookings are paid per session.</p>
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
              <p className="text-xs text-zinc-500 mt-1">Who this membership's revenue pays out to, if the academy splits payouts by coach.</p>
            </div>

            {draft.academyId && _packPlanTemplates.some((t) => t.academyId === draft.academyId) && (
              <div className="sm:col-span-2">
                <label className={lbl}>Plan Template</label>
                <select value={selectedTemplateId} onChange={(e) => handleSelectTemplate(e.target.value)} className={sel}>
                  <option value="">— Custom (no template) —</option>
                  {_packPlanTemplates.filter((t) => t.academyId === draft.academyId).map((t) => (
                    <option key={t.id} value={t.id}>{t.name} — {t.totalSessions} sessions @ {formatMoney(t.feePerSession, academyById(draft.academyId)?.currency)}</option>
                  ))}
                </select>
                <p className="text-xs text-zinc-500 mt-1">Pre-fills sessions and fee below — still editable, and won&apos;t change if the template is edited later.</p>
              </div>
            )}

            <div>
              <label className={lbl}>Purchase Date</label>
              <DateInput
                value={draft.purchaseDate}
                onChange={(v) => setDraft({ ...draft, purchaseDate: v })}
                className={inp}
              />
            </div>

            <div>
              <label className={lbl}>Sessions in Membership</label>
              <select
                value={draft.totalSessions}
                onChange={(e) => setDraft({ ...draft, totalSessions: parseInt(e.target.value) })}
                className={sel}
              >
                {[5, 10, 15, 20].map((n) => <option key={n} value={n}>{n} sessions</option>)}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className={lbl}>Squad Training Session(s) *</label>
              <GroupSessionPicker
                academyId={draft.academyId}
                selectedIds={draft.groupSessionIds}
                coaches={_packCoaches}
                onToggle={handleToggleDraftGroupSession}
              />
              {draft.agreedDays.length > 0 && (
                <p className="text-xs text-zinc-500 mt-1.5">
                  ≈{Math.ceil(draft.totalSessions / draft.agreedDays.length)} weeks at {draft.agreedDays.length} day{draft.agreedDays.length > 1 ? "s" : ""}/week
                </p>
              )}
            </div>

            <div>
              <label className={lbl}>Fee per Session ({(academyById(draft.academyId)?.currency ?? DEFAULT_CURRENCY).toUpperCase()})</label>
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
            const packCurrency = academyById(draft.academyId)?.currency ?? DEFAULT_CURRENCY;
            return (
              <div className="mb-5 bg-ink rounded-xl p-4 grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-lg font-bold text-white">{formatMoney(draft.feePerSession * draft.totalSessions, packCurrency)}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">Total collected</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-amber">{formatMoney(draft.feePerSession * draft.totalSessions * (feePct / 100), packCurrency)}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">Platform fee ({feePct}%)</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-pace-green">{formatMoney(draft.feePerSession * draft.totalSessions * (1 - feePct / 100), packCurrency)}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">Academy receives ({100 - feePct}%)</div>
                </div>
              </div>
            );
          })()}

          {formError && <p className="text-red-400 text-sm mb-3">{formError}</p>}

          <div className="flex items-center gap-3">
            <button type="button" onClick={handleSave}
              className="px-6 py-2.5 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 cursor-pointer">
              Create Membership
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
              <p className="text-zinc-400 text-sm">No outstanding payments across your memberships.</p>
            </div>
          ) : (
            <>
              {/* Outstanding summary */}
              <div className="grid grid-cols-3 gap-4 mb-2">
                <div className="bg-surface rounded-2xl p-5 text-center">
                  <div className="text-2xl font-bold text-red-400 mb-1">{sumMoneyByCurrency(feesDuePacks.map((pk) => ({ amount: pk.totalSessions * pk.feePerSession, currency: academyById(pk.academyId)?.currency ?? DEFAULT_CURRENCY })))}</div>
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
                                  <span>{pk.totalSessions} sessions × {formatMoney(pk.feePerSession, academy?.currency ?? DEFAULT_CURRENCY)}</span>
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
                                <MarkPaidButton onPaid={(paidDate) => handleMarkPaid(pk.id, paidDate)} />
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

      {/* ── PLATFORM FEES TAB — cash/bank-transfer packs where Stripe never collected the
           platform's own cut, so it's tracked here as a ledger instead ──────────────────── */}
      {pageTab === "Platform Fees" && (
        <div className="space-y-4">
          {feeDues.length === 0 ? (
            <div className="bg-surface rounded-2xl p-16 text-center">
              <p className="text-zinc-400 text-sm">No cash/bank-transfer memberships owe a platform fee.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 mb-2">
                <div className="bg-surface rounded-2xl p-5 text-center">
                  <div className="text-2xl font-bold text-amber mb-1">
                    {sumMoneyByCurrency(feeDues.filter((d) => d.status === "pending").map((d) => ({ amount: d.amountAud, currency: academyById(d.academyId)?.currency ?? DEFAULT_CURRENCY })))}
                  </div>
                  <div className="text-xs text-zinc-400">Pending</div>
                </div>
                <div className="bg-surface rounded-2xl p-5 text-center">
                  <div className="text-2xl font-bold text-pace-green mb-1">
                    {sumMoneyByCurrency(feeDues.filter((d) => d.status === "collected").map((d) => ({ amount: d.amountAud, currency: academyById(d.academyId)?.currency ?? DEFAULT_CURRENCY })))}
                  </div>
                  <div className="text-xs text-zinc-400">Collected</div>
                </div>
              </div>
              <div className="space-y-3">
                {feeDues.map((due) => {
                  const pack = packs.find((pk) => pk.id === due.packId);
                  const player = pack ? playerById(pack.playerId) : undefined;
                  const academy = academyById(due.academyId);
                  return (
                    <div key={due.id} className="bg-surface rounded-2xl p-5 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-white font-semibold text-sm">{academy?.name ?? "Unknown academy"}</div>
                        <div className="text-xs text-zinc-400">
                          {player?.name ?? "Unknown player"} · {due.feePercent}% platform fee
                          {due.status === "collected" && due.collectedDate && ` · collected ${formatDate(due.collectedDate)}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0">
                        <div className="text-lg font-bold text-amber">{formatMoney(due.amountAud, academy?.currency ?? DEFAULT_CURRENCY)}</div>
                        {due.status === "collected" ? (
                          <span className="text-xs font-semibold text-pace-green">✓ Collected</span>
                        ) : user?.role === "platform_admin" ? (
                          <MarkFeeCollectedButton
                            dueId={due.id}
                            onCollected={(collectedDate) =>
                              setFeeDues((prev) => prev.map((d) => (d.id === due.id ? { ...d, status: "collected", collectedDate } : d)))
                            }
                          />
                        ) : (
                          <span className="text-xs font-semibold text-amber">Pending</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── PACKS TAB ───────────────────────────────────────────────────────── */}
      {pageTab === "Memberships" && <>
      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 bg-blue-500/10 border border-blue-500/30 rounded-xl px-4 py-3">
          <span className="text-blue-400 text-sm font-semibold">
            {selectedIds.size} player{selectedIds.size !== 1 ? "s" : ""} selected
          </span>
          {selectedPacksPendingPayment.length > 0 && canAddPack && (
            <button
              type="button"
              onClick={() => { setBulkMarkPaidDate(today); setBulkMarkPaidOpen(true); }}
              className="px-3 py-1.5 text-xs font-semibold text-black bg-pace-green rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
            >
              Mark Paid ({selectedPacksPendingPayment.length})
            </button>
          )}
          {selectedExhaustedRows.length > 0 && canAddPack && (
            <button
              type="button"
              onClick={() => setBulkRenewOpen(true)}
              className="px-3 py-1.5 text-xs font-semibold text-amber border border-amber/30 rounded-lg hover:bg-amber/10 transition-colors cursor-pointer"
            >
              Renew ({selectedExhaustedRows.length})
            </button>
          )}
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3 py-1.5 text-xs font-semibold text-zinc-300 border border-zinc-600 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={clearSelection}
            className="text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer sm:ml-auto"
          >
            Clear
          </button>
        </div>
      )}
      <div className="bg-surface rounded-2xl overflow-hidden">
        {/* Search + filters — one unified bar, matching Players' own layout */}
        <div className="px-6 py-4 border-b border-zinc-700/60 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
          <div className="relative w-full sm:max-w-[280px]">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input type="text" value={search} onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search by player name…"
              className="w-full bg-ink rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none text-sm" />
          </div>
          <SelectPill
            value={filter} ariaLabel="Status" active={filter !== "All"}
            options={(["All", "Active", "Exhausted", "No Membership"] as FilterType[]).map((f) => ({ value: f, label: f }))}
            onChange={(v) => { setFilter(v); setPage(1); }}
          />
          <SelectPill
            value={academyFilter} options={academyFilterOptions} ariaLabel="Academy" active={academyFilter !== ""}
            onChange={(v) => { setAcademyFilter(v); setPage(1); }}
          />
          {user?.role !== "coach" && (
            <SelectPill
              value={coachFilter} options={coachFilterOptions} ariaLabel="Coach" active={coachFilter !== ""}
              onChange={(v) => { setCoachFilter(v); setPage(1); }}
            />
          )}
          {hasActiveFilters && (
            <button type="button" onClick={clearAllFilters}
              className="text-xs text-zinc-400 hover:text-white underline transition-colors cursor-pointer whitespace-nowrap">
              Reset filters
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-700/60">
                <th className="text-center px-4 py-3 pl-6 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected; }}
                    onChange={toggleAll}
                    className="w-3.5 h-3.5 accent-pace-green cursor-pointer"
                    title="Select all"
                  />
                </th>
                <SortableHeader label="Player" sortKey="player" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                <SortableHeader label="Academy" sortKey="academy" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                <SortableHeader label="Coach" sortKey="coach" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                <SortableHeader label="Sessions Remaining" sortKey="remaining" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                <SortableHeader label="Status" sortKey="status" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                <th className="sticky right-0 z-10 bg-surface text-left text-xs font-semibold text-zinc-300 uppercase tracking-wider px-4 py-3 pr-6 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map(({ player, pack }) => renderPackRow(player, pack))}
            </tbody>
          </table>
          {sortedRows.length === 0 && (
            <div className="px-6 py-16 text-center text-zinc-400 text-sm">
              {searchTerm || hasActiveFilters ? "No players match this search/filter." : "No players in your scope."}
            </div>
          )}
        </div>

        <PaginationFooter
          label={
            <p className="text-xs text-zinc-400">
              Showing {sortedRows.length === 0 ? 0 : (currentPage - 1) * packsPerPage + 1}–{Math.min(currentPage * packsPerPage, sortedRows.length)} of {sortedRows.length}
            </p>
          }
          page={currentPage}
          totalPages={totalPages}
          onPageChange={setPage}
          itemsPerPage={packsPerPage}
          onItemsPerPageChange={(n) => { setPacksPerPage(n); setPage(1); }}
          className="px-6 py-3 border-t border-zinc-700/60"
        />
      </div>
      </>}

      {markPaidTarget && (
        <ConfirmModal
          icon={<CreditCardIcon width={22} height={22} className="text-pace-green" />}
          iconBg="bg-pace-green/20"
          title="Mark as Paid (Cash)?"
          message={`Record ${markPaidTarget.playerName}'s membership fee as paid outside Stripe (cash/bank transfer).`}
          confirmLabel="Mark Paid"
          confirmBusyLabel="Saving…"
          loading={markingPaid}
          onConfirm={handleConfirmMarkPaid}
          onCancel={() => setMarkPaidTarget(null)}
        >
          <div>
            <label className={lbl}>Paid Date</label>
            <DateInput value={markPaidDate} onChange={setMarkPaidDate} className={inp} />
          </div>
        </ConfirmModal>
      )}

      {bulkMarkPaidOpen && (
        <ConfirmModal
          icon={<CreditCardIcon width={22} height={22} className="text-pace-green" />}
          iconBg="bg-pace-green/20"
          title="Mark Selected as Paid (Cash)?"
          message={`Record ${selectedPacksPendingPayment.length} membership fee${selectedPacksPendingPayment.length === 1 ? "" : "s"} as paid outside Stripe (cash/bank transfer).`}
          confirmLabel="Mark Paid"
          confirmBusyLabel="Saving…"
          loading={bulkMarkingPaid}
          onConfirm={handleConfirmBulkMarkPaid}
          onCancel={() => setBulkMarkPaidOpen(false)}
        >
          <div>
            <label className={lbl}>Paid Date</label>
            <DateInput value={bulkMarkPaidDate} onChange={setBulkMarkPaidDate} className={inp} />
          </div>
        </ConfirmModal>
      )}

      {bulkRenewOpen && (
        <ConfirmModal
          icon={<RepeatIcon width={22} height={22} className="text-amber" />}
          iconBg="bg-amber/20"
          title="Renew Selected Memberships?"
          message={`Create a fresh 10-session membership for ${selectedExhaustedRows.length} exhausted member${selectedExhaustedRows.length === 1 ? "ship" : "ships"}, carrying forward each one's own academy, fee, and squad training sessions.`}
          confirmLabel="Renew"
          confirmBusyLabel="Renewing…"
          confirmVariant="warning"
          loading={bulkRenewing}
          onConfirm={handleConfirmBulkRenew}
          onCancel={() => setBulkRenewOpen(false)}
        />
      )}
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

function MarkPaidButton({ onPaid }: { onPaid: (paidDate: string) => void }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [paidDate, setPaidDate] = useState(today);
  const [done, setDone] = useState(false);

  if (done) {
    return <span className="text-xs font-semibold text-pace-green flex items-center gap-1">✓ Marked paid</span>;
  }

  if (showConfirm) {
    return (
      <div className="flex items-center gap-2">
        <DateInput value={paidDate} onChange={setPaidDate} className="w-32 bg-ink rounded-lg px-3 py-1.5 text-xs border border-zinc-700 focus:border-pace-green focus:outline-none" />
        <button type="button" onClick={() => { onPaid(paidDate); setDone(true); }}
          className="px-3 py-1.5 text-xs font-bold bg-pace-green text-black rounded-lg hover:opacity-90 cursor-pointer transition-opacity">
          Confirm
        </button>
        <button type="button" onClick={() => setShowConfirm(false)}
          className="text-xs text-zinc-500 hover:text-white cursor-pointer">
          Cancel
        </button>
      </div>
    );
  }

  return (
    // Labeled explicitly as the cash/bank-transfer path, not just "Mark Paid" — sitting right
    // next to Pay Online (Stripe) with no distinction invited exactly the mistake this fixes: a
    // coach clicking this for a pack the player was actually paying online, creating a bogus
    // "still owes the platform its cut" ledger entry Stripe had already collected automatically
    // (see the webhook's own reconciliation for the other half of that fix). Matches
    // BookingsClient's own identically-shaped "Mark Paid (Cash)" button.
    <button type="button" onClick={() => setShowConfirm(true)}
      className="px-4 py-2 text-xs font-bold bg-pace-green text-black rounded-xl hover:opacity-90 cursor-pointer transition-opacity">
      Mark Paid (Cash)
    </button>
  );
}

function MarkFeeCollectedButton({ dueId, onCollected }: { dueId: string; onCollected: (collectedDate: string) => void }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [collectedDate, setCollectedDate] = useState(today);
  const [saving, setSaving] = useState(false);

  async function handleConfirm() {
    setSaving(true);
    try {
      await fetch("/api/packs/mark-fee-collected", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dueId, collectedDate }),
      });
      onCollected(collectedDate);
    } finally {
      setSaving(false);
    }
  }

  if (showConfirm) {
    return (
      <div className="flex items-center gap-2 flex-shrink-0">
        <DateInput value={collectedDate} onChange={setCollectedDate} className="w-32 bg-ink rounded-lg px-3 py-1.5 text-xs border border-zinc-700 focus:border-pace-green focus:outline-none" />
        <button type="button" onClick={handleConfirm} disabled={saving}
          className="px-3 py-1.5 text-xs font-bold bg-pace-green text-black rounded-lg hover:opacity-90 cursor-pointer transition-opacity disabled:opacity-60">
          {saving ? "…" : "Confirm"}
        </button>
        <button type="button" onClick={() => setShowConfirm(false)} className="text-xs text-zinc-500 hover:text-white cursor-pointer">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button type="button" onClick={() => setShowConfirm(true)}
      className="px-3 py-1.5 text-xs font-bold text-amber border border-amber/30 rounded-lg hover:bg-amber/10 cursor-pointer transition-colors flex-shrink-0">
      Mark Collected
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

// ─── Group Session Picker (Membership creation / bulk import) ────────────────
// Lets staff bind a Membership to real, pre-created squad training sessions instead of a
// freeform weekday pick — see groupSessionsForAcademy's own doc comment for why.

function GroupSessionPicker({ academyId, selectedIds, coaches, onToggle }: {
  academyId: string; selectedIds: string[]; coaches: Coach[]; onToggle: (groupSessionId: string) => void;
}) {
  if (!academyId) return <p className="text-xs text-zinc-500">Select an academy first.</p>;
  const sessions = groupSessionsForAcademy(academyId);
  if (sessions.length === 0) {
    return (
      <div className="bg-ink rounded-xl p-4">
        <p className="text-xs text-zinc-400 mb-1">This academy has no active squad training sessions yet.</p>
        <Link href="/attendance" className="text-xs text-pace-green font-semibold hover:underline">Create one in Attendance →</Link>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {sessions.map((g) => {
        const checked = selectedIds.includes(g.id);
        return (
          <label key={g.id} className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 cursor-pointer transition-colors ${
            checked ? "border-pace-green bg-pace-green/5" : "border-zinc-700 hover:border-zinc-500"
          }`}>
            <input type="checkbox" checked={checked} onChange={() => onToggle(g.id)} className="accent-pace-green" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white truncate">{g.name}</p>
              <p className="text-xs text-zinc-500">
                {DAY_TOKENS[g.dayOfWeek]} · {g.time} · {coaches.find((c) => c.id === g.coachId)?.name ?? "Unassigned"}
                {g.location ? ` · ${g.location}` : ""}
              </p>
            </div>
          </label>
        );
      })}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inp = "w-full bg-ink rounded-xl px-4 py-3 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm";
const sel = "w-full bg-ink rounded-xl px-4 py-3 text-white border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm cursor-pointer";
const lbl = "block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5";
