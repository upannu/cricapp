"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { Session, SessionType, Player, Coach } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { fetchSessions, fetchPlayers, fetchCoaches } from "@/lib/db";
import { formatDate } from "@/lib/utils";

const SESSION_TYPES: SessionType[] = [
  "Net Session",
  "Match Practice",
  "Individual Drill",
  "Warm-up / Conditioning",
  "Video Review",
];

const TYPE_STYLES: Record<SessionType, string> = {
  "Net Session": "bg-pace-green/20 text-pace-green",
  "Match Practice": "bg-fire/20 text-fire",
  "Individual Drill": "bg-blue-500/20 text-blue-400",
  "Warm-up / Conditioning": "bg-amber/20 text-amber",
  "Video Review": "bg-purple-500/20 text-purple-400",
};

let _sessPlayers: Player[] = [];
let _sessCoaches: Coach[] = [];
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

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      resolve();
    };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = time;
  });
}

function extractFrames(url: string, angle: string): Promise<{ angle: string; base64: string; mediaType: string }[]> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.preload = "auto";
    video.src = url;

    video.addEventListener("loadedmetadata", async () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas not supported");

        const duration = video.duration || 1;
        const timestamps = [duration * 0.35, duration * 0.65];
        const frames: { angle: string; base64: string; mediaType: string }[] = [];

        for (const t of timestamps) {
          await seekTo(video, Math.min(t, Math.max(duration - 0.05, 0)));
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
          frames.push({ angle, base64: dataUrl.split(",")[1] ?? "", mediaType: "image/jpeg" });
        }
        resolve(frames);
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
    video.addEventListener("error", () => reject(new Error(`Could not load the ${angle} video for analysis`)));
  });
}

export function SessionsClient() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [reportStatus, setReportStatus] = useState<Record<string, "success" | "error">>({});
  const [reportError, setReportError] = useState("");

  useEffect(() => {
    const coachName = user?.role === "coach" ? user.name : undefined;
    Promise.all([
      fetchSessions(),
      fetchPlayers(coachName),
      fetchCoaches(),
    ]).then(([s, p, c]) => {
      setSessions(s);
      _sessPlayers = p; _sessCoaches = c;
    });
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps
  const [playerFilter, setPlayerFilter] = useState("all");
  const [coachFilter, setCoachFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<SessionType | "all">("all");
  const [search, setSearch] = useState("");

  const visibleCoaches = _sessCoaches;

  async function handleGenerateReport(session: Session) {
    setGeneratingId(session.id);
    setReportError("");
    try {
      const allFrames: { angle: string; base64: string; mediaType: string }[] = [];
      for (const vid of session.videos) {
        if (!vid.url) continue;
        const frames = await extractFrames(vid.url, vid.angle);
        allFrames.push(...frames);
      }
      if (allFrames.length === 0) {
        throw new Error("No analyzable video found on this session.");
      }

      const res = await fetch("/api/ai-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, playerId: session.playerId, frames: allFrames }),
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
    }
  }

  const filtered = sessions.filter((s) => {
    const player = playerById(s.playerId);
    if (playerFilter !== "all" && s.playerId !== playerFilter) return false;
    if (typeFilter !== "all" && s.type !== typeFilter) return false;
    if (coachFilter !== "all" && player?.coachAssigned !== coachFilter) return false;
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
            <option key={c.id} value={c.name}>{c.name}</option>
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
          onChange={(e) => setTypeFilter(e.target.value as SessionType | "all")}
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
                        {player?.coachAssigned && (
                          <span className="text-zinc-500">👤 {player.coachAssigned}</span>
                        )}
                        {player?.coachAssigned && <span className="text-zinc-700">·</span>}
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
                                  </div>
                                  {vid?.url && (
                                    <a
                                      href={vid.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold text-pace-green hover:opacity-80 transition-opacity"
                                    >
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                        <polygon points="5,3 19,12 5,21" />
                                      </svg>
                                      Play
                                    </a>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

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
                        <button
                          type="button"
                          onClick={() => handleGenerateReport(session)}
                          disabled={generatingId === session.id}
                          className="px-4 py-2 text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-lg hover:bg-purple-500/30 transition-colors disabled:opacity-60 cursor-pointer"
                        >
                          {generatingId === session.id ? "Analyzing video…" : "✨ Generate AI Report"}
                        </button>
                      )}
                      {reportStatus[session.id] === "success" && player && (
                        <Link
                          href={`/players/${player.id}/reports`}
                          className="text-xs font-semibold text-pace-green hover:opacity-80"
                        >
                          ✓ Report ready — view it
                        </Link>
                      )}
                      {reportStatus[session.id] === "error" && (
                        <span className="text-xs font-semibold text-red-400">{reportError}</span>
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
