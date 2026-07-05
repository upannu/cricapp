"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import type { Session, BookingType, Player, Coach, Academy, CameraCalibration, VideoAnnotation, VoiceNote, Assessment } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { fetchSessions, fetchPlayers, fetchCoaches, fetchReports, fetchAcademies, fetchCameraCalibration, fetchVideoAnnotations, fetchVoiceNotes, fetchAssessments, updateSessionRpe } from "@/lib/db";
import { formatDate, getCoachOrAcademyLabel } from "@/lib/utils";
import { extractPoseSequence, type PoseFrame } from "@/lib/pose";
import { computeBiomechanics } from "@/lib/biomechanics";
import { renderSkeletonFrame } from "@/lib/skeleton-overlay";
import { trackBall } from "@/lib/ball-tracking";
import { renderPitchMap } from "@/lib/pitch-map";
import { CameraCalibrationModal } from "@/components/CameraCalibrationModal";
import { VideoAnnotator } from "@/components/VideoAnnotator";
import { VoiceNoteRecorder } from "@/components/VoiceNoteRecorder";
import { AssessmentForm } from "@/components/AssessmentForm";
import { canGenerateAiReports } from "@/lib/plan-features";

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
  "Warm-up / Conditioning": "bg-zinc-700 text-zinc-300",
};

let _sessPlayers: Player[] = [];
let _sessCoaches: Coach[] = [];
let _sessAcademies: Academy[] = [];
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

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Failed to encode image."));
    reader.readAsDataURL(blob);
  });
}

const ANGLE_PRIORITY = ["side", "front", "back"] as const;

const PHASE_TIME_KEYS = [
  ["backFootContact", "backFootContactSec"],
  ["frontFootContact", "frontFootContactSec"],
  ["release", "releaseSec"],
  ["followThrough", "followThroughSec"],
] as const;

export function SessionsClient() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [generatingStage, setGeneratingStage] = useState("");
  const [reportStatus, setReportStatus] = useState<Record<string, "success" | "error">>({});
  const [reportError, setReportError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});
  const [calibrationRequest, setCalibrationRequest] = useState<{ videoUrl: string; academyId: string } | null>(null);
  const calibrationResolveRef = useRef<((cal: CameraCalibration | null) => void) | null>(null);

  function requestCalibration(videoUrl: string, academyId: string): Promise<CameraCalibration | null> {
    return new Promise((resolve) => {
      calibrationResolveRef.current = resolve;
      setCalibrationRequest({ videoUrl, academyId });
    });
  }

  // Coach workflow extras — lazily loaded per session once it's expanded
  const [sessionExtras, setSessionExtras] = useState<Record<string, { annotations: VideoAnnotation[]; voiceNotes: VoiceNote[]; assessments: Assessment[] }>>({});
  const [annotatingVideo, setAnnotatingVideo] = useState<{ session: Session; angle: "front" | "side" | "back"; url: string } | null>(null);
  const [voiceNoteSession, setVoiceNoteSession] = useState<Session | null>(null);
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
    Promise.all([
      fetchSessions(),
      fetchPlayers(coachId),
      fetchCoaches(),
      fetchReports(),
      fetchAcademies(),
    ]).then(([s, p, c, r, ac]) => {
      setSessions(s);
      _sessPlayers = p; _sessCoaches = c; _sessAcademies = ac;
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

  const visibleCoaches = _sessCoaches;

  async function handleGenerateReport(session: Session) {
    setGeneratingId(session.id);
    setGeneratingStage("Loading pose model…");
    setReportError("");
    try {
      const player = playerById(session.playerId);
      if (!player) throw new Error("Player not found.");

      // Side-on view is best for the sagittal-plane joint angles most metrics
      // depend on (knee brace, trunk lean, arm path) — prefer it, fall back
      // to whichever other angle was actually uploaded.
      const chosenVideo = ANGLE_PRIORITY
        .map((a) => session.videos.find((v) => v.angle === a))
        .find((v) => v?.url);
      if (!chosenVideo?.url) throw new Error("No analyzable video found on this session.");
      const videoUrl = chosenVideo.url;

      setGeneratingStage("Tracking body position through the delivery…");
      const frames: PoseFrame[] = await extractPoseSequence(videoUrl, {
        onProgress: (ratio) => setGeneratingStage(`Tracking body position… ${Math.round(ratio * 100)}%`),
      });
      if (frames.length < 6) {
        throw new Error("Couldn't confidently detect a bowler in this clip — try a clearer, well-lit, unobstructed side-on video.");
      }

      setGeneratingStage("Computing biomechanics metrics…");
      const biomechanics = computeBiomechanics(frames, player.bowlingStyle);

      setGeneratingStage("Rendering skeleton overlay…");
      const skeletonFrames: { phase: string; base64: string; mediaType: string }[] = [];
      for (const [phase, key] of PHASE_TIME_KEYS) {
        const tSec = biomechanics.phases[key];
        if (tSec === null) continue;
        const nearest = frames.reduce((best, f) => (Math.abs(f.tSec - tSec) < Math.abs(best.tSec - tSec) ? f : best));
        try {
          const blob = await renderSkeletonFrame(videoUrl, tSec, nearest.landmarks);
          skeletonFrames.push({ phase, base64: await blobToBase64(blob), mediaType: "image/jpeg" });
        } catch {
          // Skip a frame that fails to render rather than aborting the whole report
        }
      }

      // Ball tracking + pitch map — needs the FRONT camera video specifically
      // (the only angle that shows the ball's flight down the pitch), and a
      // one-time calibration per academy to convert pixels to real distance.
      let ballTracking: {
        measured: boolean; confidence: "high" | "low" | "none"; speedKmh: number | null;
        bounceLengthZone: string | null; bounceLineApprox: string | null; note?: string;
      } | null = null;
      let pitchMapBase64: string | null = null;

      const frontVideo = session.videos.find((v) => v.angle === "front");
      if (frontVideo?.url) {
        const academy = _sessAcademies.find((a) => a.playerIds.includes(player.id));
        let calibration: CameraCalibration | null = null;
        if (academy) {
          setGeneratingStage("Checking camera calibration…");
          calibration = await fetchCameraCalibration(academy.id, "front").catch(() => null);
          if (!calibration) {
            calibration = await requestCalibration(frontVideo.url, academy.id);
          }
        }

        setGeneratingStage("Tracking ball flight…");
        const tracked = await trackBall(frontVideo.url, calibration, (ratio) =>
          setGeneratingStage(`Tracking ball flight… ${Math.round(ratio * 100)}%`),
        ).catch(() => null);

        if (tracked) {
          ballTracking = {
            measured: tracked.confidence !== "none" && tracked.speedKmh !== null,
            confidence: tracked.confidence,
            speedKmh: tracked.speedKmh,
            bounceLengthZone: tracked.lengthZone,
            bounceLineApprox: tracked.lineApprox,
            note: tracked.note,
          };
          if (tracked.lengthZone && tracked.lineApprox) {
            try {
              const mapBlob = await renderPitchMap(tracked.lengthZone, tracked.lineApprox);
              pitchMapBase64 = await blobToBase64(mapBlob);
            } catch {
              // Non-fatal — the report still shows the zone/line text without the image
            }
          }
        }
      }

      setGeneratingStage("Generating coaching summary…");
      const res = await fetch("/api/ai-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          playerId: session.playerId,
          angleUsed: chosenVideo.angle,
          biomechanics,
          ballTracking,
          pitchMapBase64,
          skeletonFrames,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed to generate report");

      setReportStatus((prev) => ({ ...prev, [session.id]: "success" }));
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? String(err);
      setReportError(msg);
      setReportStatus((prev) => ({ ...prev, [session.id]: "error" }));
    } finally {
      setGeneratingId(null);
      setGeneratingStage("");
    }
  }

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
      setConfirmDeleteId(null);
      if (expandedId === session.id) setExpandedId(null);
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? String(err);
      setDeleteErrors((prev) => ({ ...prev, [session.id]: msg }));
    } finally {
      setDeletingId(null);
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

  return (
    <>
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Sessions</h1>
          <p className="text-zinc-400 text-sm">All bowling sessions across your players</p>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total sessions" value={sessions.length} color="text-white" />
        <StatCard label="This week" value={thisWeekCount(sessions)} color="text-pace-green" />
        <StatCard label="Videos uploaded" value={totalVideos(sessions)} color="text-amber" />
        <StatCard label="Avg ball speed" value={avgSpeed(sessions)} color="text-fire" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search player, notes or type…"
          className="flex-1 min-w-48 bg-surface rounded-xl px-4 py-2.5 text-white placeholder-zinc-500 border border-zinc-700 focus:border-pace-green focus:outline-none text-sm"
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

      {/* Session list */}
      {filtered.length === 0 ? (
        <div className="bg-surface rounded-2xl p-16 text-center">
          <p className="text-zinc-400 text-sm">No sessions match your filters.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((session) => {
            const player = playerById(session.playerId);
            const isExpanded = expandedId === session.id;
            const initials = player?.name.split(" ").map((n) => n[0]).join("") ?? "?";

            return (
              <div
                key={session.id}
                className="bg-surface rounded-2xl border border-transparent hover:border-zinc-700 transition-colors"
              >
                {/* Summary row */}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : session.id)}
                  className="w-full text-left p-5 cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-pace-green/20 flex items-center justify-center text-pace-green text-sm font-bold flex-shrink-0">
                      {initials}
                    </div>

                    {/* Player + date */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-0.5">
                        <span className="text-white font-semibold text-sm">
                          {player?.name ?? "Unknown Player"}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-semibold ${TYPE_STYLES[session.type]}`}
                        >
                          {session.type}
                        </span>
                        {session.videos.length === 3 && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-pace-green/10 text-pace-green border border-pace-green/20">
                            ✓ 3 angles
                          </span>
                        )}
                        {session.videos.length > 0 && session.videos.length < 3 && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-zinc-700 text-zinc-400">
                            {session.videos.length} video{session.videos.length > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-zinc-400">
                        {player && (
                          <>
                            <span className="text-zinc-500">👤 {getCoachOrAcademyLabel(player, _sessCoaches, _sessAcademies)}</span>
                            <span className="text-zinc-700">·</span>
                          </>
                        )}
                        <span className="truncate max-w-xs">{session.notes || "No notes"}</span>
                      </div>
                    </div>

                    {/* Right side: speed + date + expand */}
                    <div className="flex items-center gap-4 flex-shrink-0">
                      {session.ballSpeedKmh !== null && (
                        <div className="text-right hidden sm:block">
                          <div className="text-pace-green font-mono font-bold text-sm">
                            {session.ballSpeedKmh} km/h
                          </div>
                          <div className="text-xs text-zinc-500">ball speed</div>
                        </div>
                      )}
                      <div className="text-right">
                        <div className="text-zinc-300 text-sm">{formatDate(session.date)}</div>
                        <div className="text-xs text-zinc-500">
                          +{session.xpEarned} XP
                        </div>
                      </div>
                      <span className={`text-zinc-400 text-sm transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}>
                        ▾
                      </span>
                    </div>
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-zinc-700/50 pt-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Coach notes */}
                      <div className="bg-ink rounded-xl p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                          Coach Notes
                        </p>
                        <p className="text-sm text-zinc-300 leading-relaxed">
                          {session.notes || "No notes recorded."}
                        </p>
                      </div>

                      {/* Metrics */}
                      <div className="bg-ink rounded-xl p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">
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
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-xs text-zinc-400">RPE</span>
                            {editingRpeId === session.id ? (
                              <div className="flex flex-wrap gap-1 justify-end">
                                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                                  <button
                                    key={n}
                                    type="button"
                                    onClick={() => handleSetRpe(session, n)}
                                    className={`w-6 h-6 rounded text-[10px] font-bold border cursor-pointer ${
                                      session.rpe === n ? "bg-pace-green border-pace-green text-black" : "bg-surface border-zinc-700 text-zinc-400 hover:border-zinc-500"
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
                                className="text-xs font-semibold font-mono text-white hover:text-pace-green transition-colors cursor-pointer"
                              >
                                {session.rpe != null ? `${session.rpe}/10 ✎` : "Log RPE"}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Videos */}
                      {session.videos.length > 0 && (
                        <div className="sm:col-span-2 bg-ink rounded-xl p-4">
                          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">
                            Uploaded Videos
                          </p>
                          <div className="flex flex-wrap gap-3">
                            {(["front", "side", "back"] as const).map((angle) => {
                              const vid = session.videos.find((v) => v.angle === angle);
                              const ANGLE_LABELS = { front: "Front · 8–10m", side: "Side · 5–7m", back: "Back · 3–4m" };
                              return (
                                <div
                                  key={angle}
                                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border flex-1 min-w-40 ${
                                    vid
                                      ? "border-pace-green/40 bg-pace-green/5"
                                      : "border-zinc-700 opacity-40"
                                  }`}
                                >
                                  <span className={`text-sm font-bold ${vid ? "text-pace-green" : "text-zinc-500"}`}>
                                    {vid ? "✓" : "○"}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <div className={`text-xs font-semibold ${vid ? "text-white" : "text-zinc-500"}`}>
                                      {ANGLE_LABELS[angle]}
                                    </div>
                                    {vid && (
                                      <div className="text-xs text-zinc-400 truncate max-w-36">
                                        {vid.label}
                                      </div>
                                    )}
                                    {vid && (vid.width || vid.fps != null || vid.transcoded !== undefined) && (
                                      <div className="text-[10px] text-zinc-500 truncate max-w-36 mt-0.5">
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
                                        className="text-xs font-semibold text-zinc-400 hover:text-white transition-colors cursor-pointer"
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
                            <div className="bg-ink rounded-xl p-4">
                              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">Video Markups</p>
                              <div className="flex flex-wrap gap-3">
                                {extras.annotations.map((a) => (
                                  <a key={a.id} href={a.imageUrl} target="_blank" rel="noopener noreferrer" className="block w-32">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={a.imageUrl} alt={`Markup at ${a.timestampSec.toFixed(1)}s`} className="w-32 h-auto rounded-lg border border-zinc-700" />
                                    {a.note && <p className="text-[10px] text-zinc-500 mt-1 truncate">{a.note}</p>}
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                          {extras.voiceNotes.length > 0 && (
                            <div className="bg-ink rounded-xl p-4">
                              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">Voice Notes</p>
                              <div className="space-y-3">
                                {extras.voiceNotes.map((n) => (
                                  <div key={n.id}>
                                    <audio src={n.audioUrl} controls className="w-full h-8 mb-1.5" />
                                    {n.transcript && <p className="text-xs text-zinc-400 leading-relaxed">{n.transcript}</p>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {extras.assessments.length > 0 && (
                            <div className="bg-ink rounded-xl p-4">
                              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">Formal Assessments</p>
                              <div className="space-y-3">
                                {extras.assessments.map((a) => (
                                  <div key={a.id}>
                                    <div className="flex flex-wrap gap-2 mb-1.5">
                                      {Object.entries(a.ratings).map(([cat, score]) => (
                                        <span key={cat} className="px-2 py-0.5 rounded-md text-xs bg-surface text-zinc-300 border border-zinc-700">
                                          {cat}: {score}/5
                                        </span>
                                      ))}
                                    </div>
                                    {a.overallRecommendation && <p className="text-xs text-zinc-400 leading-relaxed">{a.overallRecommendation}</p>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Footer actions */}
                    <div className="flex flex-wrap items-center gap-3 mt-4">
                      {player && (
                        <Link
                          href={`/players/${player.id}`}
                          className="px-4 py-2 text-xs font-semibold text-zinc-300 border border-zinc-600 rounded-lg hover:border-pace-green hover:text-pace-green transition-colors"
                        >
                          View Player Profile
                        </Link>
                      )}
                      {player && (
                        <Link
                          href={`/players/${player.id}/new-session`}
                          className="px-4 py-2 text-xs font-semibold bg-pace-green text-black rounded-lg hover:opacity-90 transition-opacity"
                        >
                          + New Session
                        </Link>
                      )}
                      {session.videos.length > 0 && (
                        reportStatus[session.id] === "success" && player ? (
                          <Link
                            href={`/players/${player.id}/reports`}
                            className="px-4 py-2 text-xs font-semibold bg-pace-green/20 text-pace-green border border-pace-green/30 rounded-lg hover:bg-pace-green/30 transition-colors"
                          >
                            ✓ View Report
                          </Link>
                        ) : player && !canGenerateAiReports(player.subscription.plan) ? (
                          <Link
                            href={`/players/${player.id}/subscription`}
                            className="px-4 py-2 text-xs font-semibold bg-zinc-700/50 text-zinc-400 border border-zinc-600 rounded-lg hover:text-white hover:border-zinc-500 transition-colors"
                            title="AI reports require Player Pro or higher"
                          >
                            🔒 AI Report (Upgrade)
                          </Link>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleGenerateReport(session)}
                            disabled={generatingId === session.id}
                            className="px-4 py-2 text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-lg hover:bg-purple-500/30 transition-colors disabled:opacity-60 cursor-pointer"
                          >
                            {generatingId === session.id ? (generatingStage || "Analyzing…") : "✨ Generate AI Report"}
                          </button>
                        )
                      )}
                      {reportStatus[session.id] === "error" && (
                        <span className="text-xs font-semibold text-red-400">{reportError}</span>
                      )}
                      <button
                        type="button"
                        onClick={() => setVoiceNoteSession(session)}
                        className="px-4 py-2 text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-500/20 transition-colors cursor-pointer"
                      >
                        🎙 Voice Note
                      </button>
                      <button
                        type="button"
                        onClick={() => setAssessmentSession(session)}
                        className="px-4 py-2 text-xs font-semibold bg-amber/10 text-amber border border-amber/30 rounded-lg hover:bg-amber/20 transition-colors cursor-pointer"
                      >
                        📋 Assessment
                      </button>

                      <div className="ml-auto flex items-center gap-2">
                        {confirmDeleteId === session.id ? (
                          <>
                            <span className="text-xs text-zinc-400">Delete this session and its videos?</span>
                            <button
                              type="button"
                              onClick={() => handleDeleteSession(session)}
                              disabled={deletingId === session.id}
                              className="px-3 py-1.5 text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/30 transition-colors disabled:opacity-60 cursor-pointer"
                            >
                              {deletingId === session.id ? "Deleting…" : "Confirm delete"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              disabled={deletingId === session.id}
                              className="px-3 py-1.5 text-xs font-semibold text-zinc-400 border border-zinc-700 rounded-lg hover:text-white transition-colors cursor-pointer"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(session.id)}
                            className="px-3 py-1.5 text-xs font-semibold text-zinc-500 border border-zinc-700 rounded-lg hover:text-red-400 hover:border-red-500/40 transition-colors cursor-pointer"
                          >
                            Delete Session
                          </button>
                        )}
                      </div>
                      {deleteErrors[session.id] && (
                        <span className="w-full text-xs font-semibold text-red-400">{deleteErrors[session.id]}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Results count */}
      {filtered.length > 0 && (
        <p className="text-xs text-zinc-500 text-center mt-6">
          Showing {filtered.length} of {sessions.length} sessions
        </p>
      )}
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
    </>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="bg-surface rounded-2xl p-5 text-center">
      <div className={`text-2xl font-bold mb-1 ${color}`}>{value}</div>
      <div className="text-xs text-zinc-400">{label}</div>
    </div>
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
      <span className="text-xs text-zinc-400">{label}</span>
      <span className={`text-xs font-semibold font-mono ${highlight ? "text-pace-green" : "text-white"}`}>
        {value}
      </span>
    </div>
  );
}

const selectCls =
  "bg-surface rounded-xl px-4 py-2.5 text-white border border-zinc-700 focus:border-pace-green focus:outline-none text-sm cursor-pointer";
