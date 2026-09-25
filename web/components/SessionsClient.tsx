"use client";

import { Fragment, useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import type { Session, BookingType, Player, Coach, Academy, Plan, CameraCalibration, VideoAnnotation, VoiceNote, Assessment } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { fetchSessions, fetchPlayers, fetchCoaches, fetchReports, fetchAcademies, fetchActivePlans, fetchVideoAnnotations, fetchVoiceNotes, deleteVoiceNote, fetchAssessments, updateSessionRpe } from "@/lib/db";
import { formatDate, getCoachOrAcademyLabel } from "@/lib/utils";
import { runReportPipeline } from "@/lib/report-pipeline";
import { CameraCalibrationModal } from "@/components/CameraCalibrationModal";
import { VideoAnnotator } from "@/components/VideoAnnotator";
import { VoiceNoteRecorder } from "@/components/VoiceNoteRecorder";
import { AssessmentForm } from "@/components/AssessmentForm";
import { StatsGrid } from "@/components/StatsGrid";
import { StatCard } from "@/components/StatCard";
import { PaginationFooter } from "@/components/PaginationFooter";
import { SortableHeader } from "@/components/SortableHeader";
import { useSort } from "@/lib/useSort";
import { RowActionsMenu, type RowActionItem } from "@/components/RowActionsMenu";
import { ConfirmModal } from "@/components/ConfirmModal";
import { EyeIcon, TrashIcon, RepeatIcon } from "@/components/icons";
import { aiReportsIncludedForPlayer } from "@/lib/plan-features";

const DEFAULT_SESSIONS_PER_PAGE = 10;

const SESSION_TYPES: BookingType[] = [
  "Net Session",
  "Individual Coaching",
  "Video Review",
  "Fitness Assessment",
  "Match Practice",
  "Warm-up / Conditioning",
];

const TYPE_STYLES: Record<BookingType, string> = {
  "Net Session": "bg-pace-green/20 text-pace-green",
  "Individual Coaching": "bg-blue-500/20 text-blue-400",
  "Video Review": "bg-purple-500/20 text-purple-400",
  "Fitness Assessment": "bg-fire/20 text-fire",
  "Match Practice": "bg-amber/20 text-amber",
  "Warm-up / Conditioning": "bg-white/10 text-hp-paper/70",
};

let _sessPlayers: Player[] = [];
let _sessCoaches: Coach[] = [];
let _sessAcademies: Academy[] = [];
let _sessPlans: Plan[] = [];
function playerById(id: string) { return _sessPlayers.find((p) => p.id === id); }

function thisWeekCount(sessions: Session[]): number {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return sessions.filter((s) => new Date(s.date).getTime() >= weekAgo).length;
}

function totalVideos(sessions: Session[]): number {
  return sessions.reduce((sum, s) => sum + s.videos.length, 0);
}

function avgSpeed(sessions: Session[]): string {
  const withSpeed = sessions.filter((s) => s.ballSpeedKmh !== null);
  if (withSpeed.length === 0) return "—";
  const avg = withSpeed.reduce((s, sess) => s + (sess.ballSpeedKmh ?? 0), 0) / withSpeed.length;
  return `${avg.toFixed(1)} km/h`;
}

type SortKey = "player" | "type" | "coach" | "date" | "speed";

export function SessionsClient() {
  const { user } = useAuth();
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [generatingStage, setGeneratingStage] = useState("");
  const [reportStatus, setReportStatus] = useState<Record<string, "success" | "error">>({});
  const [reportError, setReportError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirmSession, setDeleteConfirmSession] = useState<Session | null>(null);
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});
  const [calibrationRequest, setCalibrationRequest] = useState<{ videoUrl: string; academyId: string } | null>(null);
  const calibrationResolveRef = useRef<((cal: CameraCalibration | null) => void) | null>(null);

  // useCallback (not a plain closure) so the ref write inside it is recognized as isolated to an
  // actual invocation (an event handler eventually calling handleGenerateReport) rather than
  // something the render body's data flow — building each row's ⋮ menu items — appears to touch.
  const requestCalibration = useCallback((videoUrl: string, academyId: string): Promise<CameraCalibration | null> => {
    return new Promise((resolve) => {
      calibrationResolveRef.current = resolve;
      setCalibrationRequest({ videoUrl, academyId });
    });
  }, []);

  // Coach workflow extras — lazily loaded per session once it's expanded
  const [sessionExtras, setSessionExtras] = useState<Record<string, { annotations: VideoAnnotation[]; voiceNotes: VoiceNote[]; assessments: Assessment[] }>>({});
  const [annotatingVideo, setAnnotatingVideo] = useState<{ session: Session; angle: "front" | "side" | "back"; url: string } | null>(null);
  const [voiceNoteSession, setVoiceNoteSession] = useState<Session | null>(null);
  const [confirmDeleteVoiceNoteId, setConfirmDeleteVoiceNoteId] = useState<string | null>(null);
  const [deletingVoiceNoteId, setDeletingVoiceNoteId] = useState<string | null>(null);
  const [assessmentSession, setAssessmentSession] = useState<Session | null>(null);
  const [editingRpeId, setEditingRpeId] = useState<string | null>(null);

  async function handleSetRpe(session: Session, rpe: number | null) {
    setEditingRpeId(null);
    setSessions((prev) => prev.map((s) => (s.id === session.id ? { ...s, rpe } : s)));
    try {
      await updateSessionRpe(session.id, rpe);
    } catch {
      // Revert on failure — non-critical enough not to need a dedicated error banner
      setSessions((prev) => prev.map((s) => (s.id === session.id ? { ...s, rpe: session.rpe } : s)));
    }
  }

  useEffect(() => {
    if (!expandedId || sessionExtras[expandedId]) return;
    const session = sessions.find((s) => s.id === expandedId);
    if (!session) return;
    Promise.all([
      fetchVideoAnnotations(expandedId),
      fetchVoiceNotes(expandedId),
      fetchAssessments(session.playerId),
    ]).then(([annotations, voiceNotes, assessments]) => {
      setSessionExtras((prev) => ({
        ...prev,
        [expandedId]: { annotations, voiceNotes, assessments: assessments.filter((a) => a.sessionId === expandedId) },
      }));
    });
  }, [expandedId, sessions, sessionExtras]);

  useEffect(() => {
    const coachId = user?.role === "coach" ? user.coachId : undefined;
    const academyId = user?.role === "academy_admin" ? user.academyId : undefined;
    // Players are already scoped to the coach's/academy's own roster below — sessions must
    // be scoped the same way, or a coach/academy admin sees other people's players' session
    // data with no name to show for it (was fetching every session in the system, unscoped).
    Promise.all([
      fetchPlayers(coachId, academyId),
      fetchCoaches(academyId),
      fetchAcademies(),
      fetchActivePlans(),
    ]).then(([p, c, ac, pl]) => {
      _sessPlayers = p; _sessCoaches = c; _sessAcademies = ac; _sessPlans = pl;
      const scopedPlayerIds = (coachId || academyId) ? p.map((pl) => pl.id) : undefined;
      return Promise.all([fetchSessions(undefined, scopedPlayerIds), fetchReports(undefined, scopedPlayerIds)]);
    }).then(([s, r]) => {
      setSessions(s);
      const alreadyReported: Record<string, "success"> = {};
      for (const report of r) {
        if (report.sessionId) alreadyReported[report.sessionId] = "success";
      }
      setReportStatus((prev) => ({ ...alreadyReported, ...prev }));
    });
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps
  const [playerFilter, setPlayerFilter] = useState("all");
  const [coachFilter, setCoachFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<BookingType | "all">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sessionsPerPage, setSessionsPerPage] = useState(DEFAULT_SESSIONS_PER_PAGE);
  const { sortKey, sortDir, handleSort } = useSort<SortKey>("date", "desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkGenerateOpen, setBulkGenerateOpen] = useState(false);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkGenerateProgress, setBulkGenerateProgress] = useState("");

  const visibleCoaches = _sessCoaches;

  const handleGenerateReport = useCallback(async (session: Session, useAssessmentCredit = false) => {
    setGeneratingId(session.id);
    setGeneratingStage("Loading pose model…");
    setReportError("");
    try {
      const player = playerById(session.playerId);
      if (!player) throw new Error("Player not found.");

      await runReportPipeline({
        session, player, academies: _sessAcademies,
        onProgress: setGeneratingStage,
        useAssessmentCredit,
        requestCalibration,
      });

      if (useAssessmentCredit) {
        const target = _sessPlayers.find((p) => p.id === session.playerId);
        if (target) target.assessmentCredits = Math.max(0, target.assessmentCredits - 1);
      }
      setReportStatus((prev) => ({ ...prev, [session.id]: "success" }));
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? String(err);
      setReportError(msg);
      setReportStatus((prev) => ({ ...prev, [session.id]: "error" }));
    } finally {
      setGeneratingId(null);
      setGeneratingStage("");
    }
  }, [requestCalibration]);

  async function handleDeleteSession(session: Session) {
    setDeletingId(session.id);
    setDeleteErrors((prev) => ({ ...prev, [session.id]: "" }));
    try {
      const res = await fetch("/api/sessions/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, playerId: session.playerId }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed to delete session");

      setSessions((prev) => prev.filter((s) => s.id !== session.id));
      setDeleteConfirmSession(null);
      if (expandedId === session.id) setExpandedId(null);
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? String(err);
      setDeleteErrors((prev) => ({ ...prev, [session.id]: msg }));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDeleteVoiceNote(sessionId: string, noteId: string) {
    setDeletingVoiceNoteId(noteId);
    try {
      await deleteVoiceNote(noteId);
      setSessionExtras((prev) => {
        const extras = prev[sessionId];
        if (!extras) return prev;
        return { ...prev, [sessionId]: { ...extras, voiceNotes: extras.voiceNotes.filter((n) => n.id !== noteId) } };
      });
      setConfirmDeleteVoiceNoteId(null);
    } catch {
      // best-effort — leave the confirm state so the user can retry
    } finally {
      setDeletingVoiceNoteId(null);
    }
  }

  const filtered = sessions.filter((s) => {
    const player = playerById(s.playerId);
    if (playerFilter !== "all" && s.playerId !== playerFilter) return false;
    if (typeFilter !== "all" && s.type !== typeFilter) return false;
    if (coachFilter !== "all" && player?.coachId !== coachFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const matchPlayer = player?.name.toLowerCase().includes(q);
      const matchNotes = s.notes.toLowerCase().includes(q);
      const matchType = s.type.toLowerCase().includes(q);
      if (!matchPlayer && !matchNotes && !matchType) return false;
    }
    return true;
  });

  const sortedSessions = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "player": cmp = (playerById(a.playerId)?.name ?? "").localeCompare(playerById(b.playerId)?.name ?? ""); break;
      case "type":   cmp = a.type.localeCompare(b.type); break;
      case "coach": {
        const coachName = (s: Session) => (s.coachId ? _sessCoaches.find((c) => c.id === s.coachId)?.name : undefined) ?? "";
        cmp = coachName(a).localeCompare(coachName(b));
        break;
      }
      case "speed":  cmp = (a.ballSpeedKmh ?? -1) - (b.ballSpeedKmh ?? -1); break;
      default:       cmp = a.date.localeCompare(b.date);
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  // Clamp rather than reset so a shrinking result set can never strand the view on a
  // now-nonexistent page (mirrors PlayersClient's pagination — see there for rationale).
  const totalPages = Math.max(1, Math.ceil(filtered.length / sessionsPerPage));
  const currentPage = Math.min(page, totalPages);
  const pagedSessions = sortedSessions.slice((currentPage - 1) * sessionsPerPage, currentPage * sessionsPerPage);

  // "Select all" (and its indeterminate state) covers every row currently matching the active
  // search/filters, not just the visible page — same convention Memberships/Players already use.
  const allSelected = sortedSessions.length > 0 && sortedSessions.every((s) => selectedIds.has(s.id));
  const someSelected = sortedSessions.some((s) => selectedIds.has(s.id)) && !allSelected;

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
      if (allSelected) sortedSessions.forEach((s) => next.delete(s.id));
      else sortedSessions.forEach((s) => next.add(s.id));
      return next;
    });
  }

  function clearSelection() { setSelectedIds(new Set()); }

  const selectedSessionsList = sortedSessions.filter((s) => selectedIds.has(s.id));
  // Bulk-generate only covers sessions whose player has AI reports included in their plan —
  // deliberately excludes the assessment-credit path (a scarce, paid resource) from bulk
  // spending; a credit-funded report still has to be a deliberate one-at-a-time choice via the
  // row's own ⋮ menu.
  const selectedReportEligible = selectedSessionsList.filter((s) => {
    if (s.videos.length === 0 || reportStatus[s.id] === "success") return false;
    const player = playerById(s.playerId);
    return !!player && aiReportsIncludedForPlayer(player, _sessPlans, _sessAcademies, _sessCoaches);
  });

  async function handleConfirmBulkDelete() {
    setBulkDeleting(true);
    const succeededIds: string[] = [];
    for (const session of selectedSessionsList) {
      try {
        const res = await fetch("/api/sessions/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: session.id, playerId: session.playerId }),
        });
        const data = await res.json();
        if (res.ok && !data.error) succeededIds.push(session.id);
      } catch {
        // best-effort — a session that fails to delete just stays selected so it's visible
      }
    }
    setSessions((prev) => prev.filter((s) => !succeededIds.includes(s.id)));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      succeededIds.forEach((id) => next.delete(id));
      return next;
    });
    setBulkDeleting(false);
    setBulkDeleteOpen(false);
  }

  async function handleConfirmBulkGenerateReports() {
    setBulkGenerateOpen(false);
    setBulkGenerating(true);
    const targets = selectedReportEligible;
    for (let i = 0; i < targets.length; i++) {
      setBulkGenerateProgress(`Generating report ${i + 1} of ${targets.length}…`);
      await handleGenerateReport(targets[i]);
    }
    setBulkGenerating(false);
    setBulkGenerateProgress("");
    clearSelection();
  }

  function handleExportCsv() {
    const rows = selectedSessionsList.map((s) => {
      const player = playerById(s.playerId);
      const coach = s.coachId ? _sessCoaches.find((c) => c.id === s.coachId) : undefined;
      return {
        player: player?.name ?? "", type: s.type, date: s.date,
        coach: coach?.name ?? (player ? getCoachOrAcademyLabel(player, _sessCoaches, _sessAcademies) : ""),
        ballSpeedKmh: s.ballSpeedKmh ?? "", rpe: s.rpe ?? "", notes: s.notes,
      };
    });
    const blob = new Blob([Papa.unparse(rows)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `sessions-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Report generation deliberately isn't offered here — its onClick closes over
  // handleGenerateReport, which transitively writes a ref (calibrationResolveRef, via
  // requestCalibration) when invoked. React Compiler's ref-safety lint (react-hooks/refs) is fine
  // with that exact same handler attached directly to a native <button>'s onClick (see the
  // Report column's cell above), but flags it the moment it's threaded through a plain object
  // passed as a *prop* into another component like RowActionsMenu — so those actions live as
  // real buttons in the Report column instead of menu items here.
  function buildRowActions(session: Session, player: Player | undefined): RowActionItem[] {
    const items: RowActionItem[] = [];
    if (player) {
      items.push({ label: "View Player Profile", icon: <EyeIcon />, onClick: () => router.push(`/players/${player.id}`) });
      items.push({ label: "Log New Session", onClick: () => router.push(`/players/${player.id}/new-session`) });
    }
    items.push({ label: "Voice Note", onClick: () => setVoiceNoteSession(session) });
    items.push({ label: "Assessment", onClick: () => setAssessmentSession(session) });
    items.push({ label: "Delete Session", icon: <TrashIcon />, variant: "danger", dividerBefore: true, onClick: () => setDeleteConfirmSession(session) });
    return items;
  }

  return (
    <>
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display font-black uppercase text-2xl text-hp-paper tracking-wide mb-1">Coaching Sessions</h1>
        </div>
      </div>

      {/* Stats strip */}
      <StatsGrid columns={4}>
        <StatCard label="Total sessions" value={sessions.length} color="text-hp-paper" />
        <StatCard label="This week" value={thisWeekCount(sessions)} color="text-pace-green" />
        <StatCard label="Videos uploaded" value={totalVideos(sessions)} color="text-amber" />
        <StatCard label="Avg ball speed" value={avgSpeed(sessions)} color="text-fire" />
      </StatsGrid>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search player, notes or type…"
          className="flex-1 min-w-48 bg-hp-ink px-4 py-2.5 text-hp-paper placeholder-hp-paper/35 border border-white/12 focus:border-hp-cg focus:outline-none text-sm"
        />
        <select
          value={coachFilter}
          onChange={(e) => setCoachFilter(e.target.value)}
          className={selectCls}
        >
          <option value="all">All Coaches</option>
          {visibleCoaches.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          value={playerFilter}
          onChange={(e) => setPlayerFilter(e.target.value)}
          className={selectCls}
        >
          <option value="all">All Players</option>
          {_sessPlayers.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as BookingType | "all")}
          className={selectCls}
        >
          <option value="all">All Types</option>
          {SESSION_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 bg-blue-500/10 border border-blue-500/30 px-4 py-3">
          <span className="text-blue-400 text-sm font-semibold">
            {selectedIds.size} session{selectedIds.size !== 1 ? "s" : ""} selected
          </span>
          {selectedReportEligible.length > 0 && (
            <button
              type="button"
              onClick={() => setBulkGenerateOpen(true)}
              disabled={bulkGenerating}
              className="px-3 py-1.5 text-xs font-semibold text-black bg-pace-green hover:opacity-90 transition-opacity disabled:opacity-60 cursor-pointer"
            >
              {bulkGenerating ? (bulkGenerateProgress || "Generating…") : `Generate AI Reports (${selectedReportEligible.length})`}
            </button>
          )}
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3 py-1.5 text-xs font-semibold text-hp-paper/70 border border-white/15 hover:bg-white/5 transition-colors cursor-pointer"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => setBulkDeleteOpen(true)}
            className="px-3 py-1.5 text-xs font-semibold text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-colors cursor-pointer"
          >
            Delete ({selectedIds.size})
          </button>
          <button
            type="button"
            onClick={clearSelection}
            className="text-xs text-hp-paper/50 hover:text-hp-paper transition-colors cursor-pointer sm:ml-auto"
          >
            Clear
          </button>
        </div>
      )}

      {/* Session table */}
      {filtered.length === 0 ? (
        <div className="bg-hp-surface border border-white/8 p-16 text-center">
          <p className="text-hp-paper/60 text-sm">No sessions match your filters.</p>
        </div>
      ) : (
        <div className="bg-hp-surface border border-white/8 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/12">
                  <th className="px-4 py-3 pl-6 text-center whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = someSelected; }}
                      onChange={toggleAll}
                      className="w-3.5 h-3.5 accent-hp-cg cursor-pointer"
                      title="Select all"
                    />
                  </th>
                  <SortableHeader label="Player" sortKey="player" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                  <SortableHeader label="Type" sortKey="type" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                  <SortableHeader label="Coach" sortKey="coach" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                  <SortableHeader label="Date" sortKey="date" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                  <SortableHeader label="Ball Speed" sortKey="speed" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                  <th className="text-left text-xs font-semibold text-hp-paper/70 uppercase tracking-wider px-4 py-3 whitespace-nowrap">Report</th>
                  <th className="sticky right-0 z-10 bg-hp-surface text-left text-xs font-semibold text-hp-paper/70 uppercase tracking-wider px-4 py-3 pr-6 whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedSessions.map((session) => {
                  const player = playerById(session.playerId);
                  const isExpanded = expandedId === session.id;
                  const isSelected = selectedIds.has(session.id);
                  const initials = player?.name.split(" ").map((n) => n[0]).join("") ?? "?";
                  const sessionCoach = session.coachId ? _sessCoaches.find((c) => c.id === session.coachId) : undefined;

                  return (
                    <Fragment key={session.id}>
                      <tr className={`border-b border-white/8 last:border-0 transition-colors ${isSelected ? "bg-blue-500/5" : "hover:bg-white/[0.03]"}`}>
                        <td className="px-4 py-3 pl-6 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(session.id)}
                            className="w-4 h-4 accent-hp-cg cursor-pointer"
                            title="Select for bulk actions"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <button type="button" onClick={() => setExpandedId(isExpanded ? null : session.id)}
                            className="flex items-center gap-3 text-left cursor-pointer group">
                            <div className="w-9 h-9 rounded-full bg-hp-cg/20 flex items-center justify-center text-hp-cg text-sm font-bold flex-shrink-0">
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <p className="text-hp-paper text-sm font-medium whitespace-nowrap group-hover:text-hp-cg transition-colors">
                                {player?.name ?? "Unknown Player"}
                              </p>
                              <p className="text-hp-paper/45 text-xs truncate max-w-[14rem]">{session.notes || "No notes"}</p>
                            </div>
                            <span className={`text-hp-paper/45 text-xs transition-transform duration-200 flex-shrink-0 ${isExpanded ? "rotate-180" : ""}`}>▾</span>
                          </button>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${TYPE_STYLES[session.type]}`}>
                            {session.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-hp-paper/70 text-xs whitespace-nowrap">
                          {sessionCoach ? sessionCoach.name : player ? getCoachOrAcademyLabel(player, _sessCoaches, _sessAcademies) : "—"}
                        </td>
                        <td className="px-4 py-3 text-hp-paper/70 text-xs whitespace-nowrap">{formatDate(session.date)}</td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap">
                          {session.ballSpeedKmh !== null ? (
                            <span className="text-pace-green font-mono font-semibold">{session.ballSpeedKmh} km/h</span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          {session.videos.length === 0 ? (
                            <span className="text-xs text-hp-paper/35">—</span>
                          ) : generatingId === session.id ? (
                            <span className="text-xs text-hp-paper/50">{generatingStage || "Analyzing…"}</span>
                          ) : reportStatus[session.id] === "success" && player ? (
                            <div className="flex items-center gap-2">
                              <Link href={`/players/${player.id}/reports`} className="text-xs font-semibold text-pace-green hover:underline">
                                ✓ View
                              </Link>
                              <button type="button" onClick={() => handleGenerateReport(session)}
                                title="Generates a fresh report from this session's video — the old one stays too."
                                className="text-xs text-hp-paper/45 hover:text-hp-paper transition-colors cursor-pointer">
                                🔄
                              </button>
                            </div>
                          ) : player && !aiReportsIncludedForPlayer(player, _sessPlans, _sessAcademies, _sessCoaches) && player.assessmentCredits > 0 ? (
                            <button type="button" onClick={() => handleGenerateReport(session, true)}
                              title="Spends one purchased Individual Action Assessment credit"
                              className="text-xs font-semibold text-purple-300 hover:text-purple-200 transition-colors cursor-pointer">
                              🎫 Use Credit ({player.assessmentCredits})
                            </button>
                          ) : player && !aiReportsIncludedForPlayer(player, _sessPlans, _sessAcademies, _sessCoaches) ? (
                            <Link href={`/players/${player.id}/subscription`} className="text-xs font-semibold text-hp-paper/45 hover:text-hp-paper transition-colors"
                              title="AI reports require Player Pro or higher">
                              🔒 Upgrade
                            </Link>
                          ) : (
                            <button type="button" onClick={() => handleGenerateReport(session)}
                              className="text-xs font-semibold text-purple-300 hover:text-purple-200 transition-colors cursor-pointer">
                              ✨ Generate
                            </button>
                          )}
                        </td>
                        <td className="sticky right-0 z-10 bg-hp-surface px-4 py-3 pr-6" onClick={(e) => e.stopPropagation()}>
                          <RowActionsMenu items={buildRowActions(session, player)} />
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr key={`${session.id}-detail`} className="border-b border-white/8 last:border-0">
                          <td colSpan={8} className="px-5 pb-5 pt-4 bg-hp-ink/40">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {/* Coach notes */}
                              <div className="bg-hp-ink p-4">
                                <p className="text-xs font-mono font-semibold uppercase tracking-widest text-hp-paper/45 mb-2">
                                  Coach Notes
                                </p>
                                <p className="text-sm text-hp-paper/70 leading-relaxed">
                                  {session.notes || "No notes recorded."}
                                </p>
                              </div>

                              {/* Metrics */}
                              <div className="bg-hp-ink p-4">
                                <p className="text-xs font-mono font-semibold uppercase tracking-widest text-hp-paper/45 mb-3">
                                  Metrics
                                </p>
                                <div className="space-y-2">
                                  <MetricRow
                                    label="Ball speed"
                                    value={session.ballSpeedKmh !== null ? `${session.ballSpeedKmh} km/h` : "—"}
                                    highlight={session.ballSpeedKmh !== null}
                                  />
                                  <MetricRow
                                    label="Front knee angle"
                                    value={session.frontKneeAngleDeg !== null ? `${session.frontKneeAngleDeg}°` : "—"}
                                  />
                                  <MetricRow label="XP earned" value={`+${session.xpEarned}`} />
                                  <MetricRow
                                    label="Videos"
                                    value={`${session.videos.length} / 3`}
                                  />
                                  <MetricRow label="Coach" value={sessionCoach?.name ?? "—"} />
                                  <MetricRow
                                    label="Time"
                                    value={session.time ? `${session.time}${session.durationMins ? ` · ${session.durationMins} min` : ""}` : "—"}
                                  />
                                  <div className="flex items-center justify-between gap-4">
                                    <span className="text-xs text-hp-paper/45">RPE</span>
                                    {editingRpeId === session.id ? (
                                      <div className="flex flex-wrap gap-1 justify-end">
                                        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                                          <button
                                            key={n}
                                            type="button"
                                            onClick={() => handleSetRpe(session, n)}
                                            className={`w-6 h-6 text-[10px] font-bold border cursor-pointer ${
                                              session.rpe === n ? "bg-hp-cg border-hp-cg text-hp-paper" : "bg-hp-surface border-white/12 text-hp-paper/45 hover:border-white/30"
                                            }`}
                                          >
                                            {n}
                                          </button>
                                        ))}
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => setEditingRpeId(session.id)}
                                        className="text-xs font-semibold font-mono text-hp-paper hover:text-hp-cg transition-colors cursor-pointer"
                                      >
                                        {session.rpe != null ? `${session.rpe}/10 ✎` : "Log RPE"}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Videos */}
                              {session.videos.length > 0 && (
                                <div className="sm:col-span-2 bg-hp-ink p-4">
                                  <p className="text-xs font-mono font-semibold uppercase tracking-widest text-hp-paper/45 mb-3">
                                    Uploaded Videos
                                  </p>
                                  <div className="flex flex-wrap gap-3">
                                    {(["front", "side", "back"] as const).map((angle) => {
                                      const vid = session.videos.find((v) => v.angle === angle);
                                      const ANGLE_LABELS = { front: "Front · 8–10m", side: "Side · 5–7m", back: "Back · 3–4m" };
                                      return (
                                        <div
                                          key={angle}
                                          className={`flex items-center gap-3 px-4 py-3 border flex-1 min-w-40 ${
                                            vid
                                              ? "border-pace-green/40 bg-pace-green/5"
                                              : "border-white/12 opacity-40"
                                          }`}
                                        >
                                          <span className={`text-sm font-bold ${vid ? "text-pace-green" : "text-hp-paper/45"}`}>
                                            {vid ? "✓" : "○"}
                                          </span>
                                          <div className="flex-1 min-w-0">
                                            <div className={`text-xs font-semibold ${vid ? "text-hp-paper" : "text-hp-paper/45"}`}>
                                              {ANGLE_LABELS[angle]}
                                            </div>
                                            {vid && (
                                              <div className="text-xs text-hp-paper/50 truncate max-w-36">
                                                {vid.label}
                                              </div>
                                            )}
                                            {vid && (vid.width || vid.fps != null || vid.transcoded !== undefined) && (
                                              <div className="text-[10px] text-hp-paper/45 truncate max-w-36 mt-0.5">
                                                {[
                                                  vid.width && vid.height ? `${vid.width}×${vid.height}` : null,
                                                  vid.fps != null ? `${vid.fps}fps` : null,
                                                  vid.transcoded === true ? "Normalized ✓" : vid.transcoded === false ? "Original file" : null,
                                                ].filter(Boolean).join(" · ")}
                                              </div>
                                            )}
                                          </div>
                                          {vid?.url && (
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                              <a
                                                href={vid.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-1 text-xs font-semibold text-pace-green hover:opacity-80 transition-opacity"
                                              >
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                                  <polygon points="5,3 19,12 5,21" />
                                                </svg>
                                                Play
                                              </a>
                                              <button
                                                type="button"
                                                onClick={() => setAnnotatingVideo({ session, angle, url: vid.url! })}
                                                className="text-xs font-semibold text-hp-paper/45 hover:text-hp-paper transition-colors cursor-pointer"
                                              >
                                                ✏ Markup
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Coach workflow: markups, voice notes, assessments */}
                            {(() => {
                              const extras = sessionExtras[session.id];
                              if (!extras) return null;
                              const hasAny = extras.annotations.length > 0 || extras.voiceNotes.length > 0 || extras.assessments.length > 0;
                              if (!hasAny) return null;
                              return (
                                <div className="mt-4 space-y-4">
                                  {extras.annotations.length > 0 && (
                                    <div className="bg-hp-ink p-4">
                                      <p className="text-xs font-mono font-semibold uppercase tracking-widest text-hp-paper/45 mb-3">Video Markups</p>
                                      <div className="flex flex-wrap gap-3">
                                        {extras.annotations.map((a) => (
                                          <a key={a.id} href={a.imageUrl} target="_blank" rel="noopener noreferrer" className="block w-32">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={a.imageUrl} alt={`Markup at ${a.timestampSec.toFixed(1)}s`} className="w-32 h-auto rounded-lg border border-white/12" />
                                            {a.note && <p className="text-[10px] text-hp-paper/45 mt-1 truncate">{a.note}</p>}
                                          </a>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {extras.voiceNotes.length > 0 && (
                                    <div className="bg-hp-ink p-4">
                                      <p className="text-xs font-mono font-semibold uppercase tracking-widest text-hp-paper/45 mb-3">Voice Notes</p>
                                      <div className="space-y-3">
                                        {extras.voiceNotes.map((n) => (
                                          <div key={n.id}>
                                            <div className="flex items-center gap-2">
                                              <audio src={n.audioUrl} controls className="w-full h-8 mb-1.5" />
                                              {confirmDeleteVoiceNoteId === n.id ? (
                                                <>
                                                  <button
                                                    type="button"
                                                    onClick={() => handleDeleteVoiceNote(session.id, n.id)}
                                                    disabled={deletingVoiceNoteId === n.id}
                                                    className="shrink-0 px-2 py-1 text-[10px] font-semibold bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors disabled:opacity-60 cursor-pointer"
                                                  >
                                                    {deletingVoiceNoteId === n.id ? "Deleting…" : "Confirm"}
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => setConfirmDeleteVoiceNoteId(null)}
                                                    disabled={deletingVoiceNoteId === n.id}
                                                    className="shrink-0 px-2 py-1 text-[10px] font-semibold text-hp-paper/45 border border-white/12 hover:text-hp-paper transition-colors cursor-pointer"
                                                  >
                                                    Cancel
                                                  </button>
                                                </>
                                              ) : (
                                                <button
                                                  type="button"
                                                  onClick={() => setConfirmDeleteVoiceNoteId(n.id)}
                                                  title="Delete this voice note"
                                                  className="shrink-0 px-2 py-1 text-[10px] font-semibold text-hp-paper/45 border border-white/12 hover:text-red-400 hover:border-red-500/40 transition-colors cursor-pointer"
                                                >
                                                  Delete
                                                </button>
                                              )}
                                            </div>
                                            {n.transcript && <p className="text-xs text-hp-paper/50 leading-relaxed">{n.transcript}</p>}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {extras.assessments.length > 0 && (
                                    <div className="bg-hp-ink p-4">
                                      <p className="text-xs font-mono font-semibold uppercase tracking-widest text-hp-paper/45 mb-3">Formal Assessments</p>
                                      <div className="space-y-3">
                                        {extras.assessments.map((a) => (
                                          <div key={a.id}>
                                            <div className="flex flex-wrap gap-2 mb-1.5">
                                              {Object.entries(a.ratings).map(([cat, score]) => (
                                                <span key={cat} className="px-2 py-0.5 text-xs bg-hp-surface text-hp-paper/70 border border-white/12">
                                                  {cat}: {score}/5
                                                </span>
                                              ))}
                                            </div>
                                            {a.overallRecommendation && <p className="text-xs text-hp-paper/50 leading-relaxed">{a.overallRecommendation}</p>}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}

                            {reportStatus[session.id] === "error" && (
                              <p className="mt-4 text-xs font-semibold text-red-400">{reportError}</p>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Results count + pagination */}
      <PaginationFooter
        show={filtered.length > 0}
        label={
          <p className="text-xs text-hp-paper/45">
            Showing {(currentPage - 1) * sessionsPerPage + 1}–{Math.min(currentPage * sessionsPerPage, filtered.length)} of {filtered.length} sessions
          </p>
        }
        page={currentPage}
        totalPages={totalPages}
        onPageChange={setPage}
        itemsPerPage={sessionsPerPage}
        onItemsPerPageChange={(n) => { setSessionsPerPage(n); setPage(1); }}
        className="mt-6"
      />
    </div>

    {calibrationRequest && (
      <CameraCalibrationModal
        videoUrl={calibrationRequest.videoUrl}
        academyId={calibrationRequest.academyId}
        angle="front"
        onDone={(cal) => {
          calibrationResolveRef.current?.(cal);
          calibrationResolveRef.current = null;
          setCalibrationRequest(null);
        }}
        onCancel={() => {
          calibrationResolveRef.current?.(null);
          calibrationResolveRef.current = null;
          setCalibrationRequest(null);
        }}
      />
    )}

    {annotatingVideo && (
      <VideoAnnotator
        videoUrl={annotatingVideo.url}
        angle={annotatingVideo.angle}
        sessionId={annotatingVideo.session.id}
        playerId={annotatingVideo.session.playerId}
        onClose={() => setAnnotatingVideo(null)}
        onSaved={(annotation) => {
          setSessionExtras((prev) => {
            const existing = prev[annotation.sessionId] ?? { annotations: [], voiceNotes: [], assessments: [] };
            return { ...prev, [annotation.sessionId]: { ...existing, annotations: [annotation, ...existing.annotations] } };
          });
          setAnnotatingVideo(null);
        }}
      />
    )}

    {voiceNoteSession && (
      <VoiceNoteRecorder
        sessionId={voiceNoteSession.id}
        playerId={voiceNoteSession.playerId}
        onClose={() => setVoiceNoteSession(null)}
        onSaved={(note) => {
          const sid = voiceNoteSession.id;
          setSessionExtras((prev) => {
            const existing = prev[sid] ?? { annotations: [], voiceNotes: [], assessments: [] };
            return { ...prev, [sid]: { ...existing, voiceNotes: [note, ...existing.voiceNotes] } };
          });
          setVoiceNoteSession(null);
        }}
      />
    )}

    {assessmentSession && (
      <AssessmentForm
        sessionId={assessmentSession.id}
        playerId={assessmentSession.playerId}
        onClose={() => setAssessmentSession(null)}
        onSaved={(assessment) => {
          const sid = assessmentSession.id;
          setSessionExtras((prev) => {
            const existing = prev[sid] ?? { annotations: [], voiceNotes: [], assessments: [] };
            return { ...prev, [sid]: { ...existing, assessments: [assessment, ...existing.assessments] } };
          });
          setAssessmentSession(null);
        }}
      />
    )}

    {deleteConfirmSession && (
      <ConfirmModal
        icon={<TrashIcon width={22} height={22} className="text-red-400" />}
        iconBg="bg-red-500/20"
        title="Delete this session?"
        message={`This deletes ${playerById(deleteConfirmSession.playerId)?.name ?? "this player"}'s session and its videos. This can't be undone.`}
        confirmLabel="Delete"
        confirmBusyLabel="Deleting…"
        confirmVariant="danger"
        loading={deletingId === deleteConfirmSession.id}
        error={deleteErrors[deleteConfirmSession.id]}
        onConfirm={() => handleDeleteSession(deleteConfirmSession)}
        onCancel={() => setDeleteConfirmSession(null)}
      />
    )}

    {bulkDeleteOpen && (
      <ConfirmModal
        icon={<TrashIcon width={22} height={22} className="text-red-400" />}
        iconBg="bg-red-500/20"
        title="Delete selected sessions?"
        message={`This deletes ${selectedSessionsList.length} session${selectedSessionsList.length === 1 ? "" : "s"} and their videos. This can't be undone.`}
        confirmLabel="Delete"
        confirmBusyLabel="Deleting…"
        confirmVariant="danger"
        loading={bulkDeleting}
        onConfirm={handleConfirmBulkDelete}
        onCancel={() => setBulkDeleteOpen(false)}
      />
    )}

    {bulkGenerateOpen && (
      <ConfirmModal
        icon={<RepeatIcon width={22} height={22} className="text-pace-green" />}
        iconBg="bg-pace-green/20"
        title="Generate AI Reports?"
        message={`Generates an AI biomechanics report for ${selectedReportEligible.length} selected session${selectedReportEligible.length === 1 ? "" : "s"} with uploaded video and no report yet. This can take a while for several sessions — each one processes in turn.`}
        confirmLabel="Generate"
        confirmBusyLabel="Generating…"
        loading={bulkGenerating}
        onConfirm={handleConfirmBulkGenerateReports}
        onCancel={() => setBulkGenerateOpen(false)}
      />
    )}
    </>
  );
}


function MetricRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs text-hp-paper/45">{label}</span>
      <span className={`text-xs font-semibold font-mono ${highlight ? "text-pace-green" : "text-hp-paper"}`}>
        {value}
      </span>
    </div>
  );
}

const selectCls =
  "bg-hp-ink px-4 py-2.5 text-hp-paper border border-white/12 focus:border-hp-cg focus:outline-none text-sm cursor-pointer";
