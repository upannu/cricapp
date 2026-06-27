"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Player, Session, SessionVideo } from "@/lib/types";
import { addStoredSession } from "@/lib/session-store";

const SESSION_TYPES = [
  "Net Session",
  "Match Practice",
  "Individual Drill",
  "Warm-up / Conditioning",
  "Video Review",
] as const;

const CAMERA_ANGLES = [
  {
    id: "front",
    label: "Front Camera",
    description: "Behind umpire, facing down pitch · 8–10m",
    icon: "⬆",
    sampleDuration: "0:47",
    sampleName: "sample_front_angle.mp4",
  },
  {
    id: "side",
    label: "Side Camera",
    description: "Square on to crease, off-stump side · 5–7m",
    icon: "➡",
    sampleDuration: "0:52",
    sampleName: "sample_side_angle.mp4",
  },
  {
    id: "back",
    label: "Back Camera",
    description: "Behind bowler, facing run-up · 3–4m",
    icon: "⬇",
    sampleDuration: "0:44",
    sampleName: "sample_back_angle.mp4",
  },
] as const;

type AngleId = "front" | "side" | "back";
type VideoState = { kind: "file"; file: File } | { kind: "sample"; name: string; duration: string } | null;

// Visual icons per angle for the mock video player
const ANGLE_VISUALS: Record<AngleId, { bg: string; lines: string[] }> = {
  front: {
    bg: "from-slate-900 to-slate-800",
    lines: ["Pitch view", "Down the wicket"],
  },
  side: {
    bg: "from-slate-900 to-zinc-800",
    lines: ["Side-on view", "Off-stump angle"],
  },
  back: {
    bg: "from-zinc-900 to-slate-800",
    lines: ["Behind bowler", "Run-up view"],
  },
};

export function NewSessionForm({ player }: { player: Player }) {
  const router = useRouter();
  const today = new Date().toISOString().split("T")[0];

  const [sessionDate, setSessionDate] = useState(today);
  const [sessionType, setSessionType] = useState<string>(SESSION_TYPES[0]);
  const [notes, setNotes] = useState("");
  const [uploads, setUploads] = useState<Record<AngleId, VideoState>>({
    front: null,
    side: null,
    back: null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const initials = player.name
    .split(" ")
    .map((n) => n[0] ?? "")
    .join("");

  function handleFileChange(angle: AngleId, file: File | null) {
    setUploads((prev) => ({
      ...prev,
      [angle]: file ? { kind: "file", file } : null,
    }));
  }

  function useSample(angle: AngleId, name: string, duration: string) {
    setUploads((prev) => ({
      ...prev,
      [angle]: { kind: "sample", name, duration },
    }));
  }

  function clearAngle(angle: AngleId) {
    setUploads((prev) => ({ ...prev, [angle]: null }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    // Build the videos array from whatever was uploaded
    const videos: SessionVideo[] = (["front", "side", "back"] as AngleId[]).flatMap((angle) => {
      const s = uploads[angle];
      if (!s) return [];
      return [{ angle, label: s.kind === "file" ? s.file.name : s.name }];
    });

    const session: Session = {
      id: `s_${Date.now()}`,
      playerId: player.id,
      date: sessionDate,
      type: sessionType as Session["type"],
      notes,
      videos,
      ballSpeedKmh: null,
      frontKneeAngleDeg: null,
      xpEarned: 50 + videos.length * 20,
    };

    addStoredSession(session);

    setTimeout(() => {
      setSubmitting(false);
      setSubmitted(true);
      setTimeout(() => router.push(`/players/${player.id}`), 1200);
    }, 1000);
  }

  const uploadedCount = Object.values(uploads).filter(Boolean).length;

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Link
          href={`/players/${player.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
        >
          ← Back to Profile
        </Link>
      </div>

      {/* Player identity */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-full bg-pace-green flex items-center justify-center text-black font-bold text-xl flex-shrink-0">
          {initials}
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">New Session</h1>
          <p className="text-zinc-400 text-sm">
            {player.name} · {player.bowlingStyle}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Session details */}
        <div className="bg-surface rounded-2xl p-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-5">
            Session Details
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Session Date">
              <input
                type="date"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                className={inputCls}
                required
              />
            </Field>

            <Field label="Session Type">
              <select
                value={sessionType}
                onChange={(e) => setSessionType(e.target.value)}
                className={selectCls}
              >
                {SESSION_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </Field>

            <div className="sm:col-span-2">
              <Field label="Coach Notes">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className={`${inputCls} resize-none h-24`}
                  placeholder="Key observations, focus areas, drills covered…"
                />
              </Field>
            </div>
          </div>
        </div>

        {/* Video upload */}
        <div className="bg-surface rounded-2xl p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Video Upload — 3 Angles
            </h2>
            <span className="text-xs text-zinc-500">{uploadedCount}/3 uploaded</span>
          </div>
          <p className="text-xs text-zinc-500 mb-5">
            Min. 60 fps · 1080p · MP4 H.264 · All 3 angles required for AI analysis
          </p>

          <div className="space-y-4">
            {CAMERA_ANGLES.map((cam) => {
              const state = uploads[cam.id];
              const uploaded = state !== null;
              const isSample = state?.kind === "sample";
              const visual = ANGLE_VISUALS[cam.id];

              return (
                <div
                  key={cam.id}
                  className={`rounded-xl border transition-colors ${
                    uploaded
                      ? "border-pace-green/40 bg-pace-green/5"
                      : "border-zinc-700"
                  }`}
                >
                  {/* Top row: angle info + buttons */}
                  <div className="flex items-center gap-4 p-4">
                    {/* Icon */}
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg flex-shrink-0 ${
                        uploaded ? "bg-pace-green/20" : "bg-ink"
                      }`}
                    >
                      {uploaded ? (
                        <span className="text-pace-green text-sm font-bold">✓</span>
                      ) : (
                        <span className="text-zinc-500">{cam.icon}</span>
                      )}
                    </div>

                    {/* Label */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${uploaded ? "text-pace-green" : "text-white"}`}>
                        {cam.label}
                      </p>
                      <p className="text-xs text-zinc-500">{cam.description}</p>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Use Sample button */}
                      {!uploaded && (
                        <button
                          type="button"
                          onClick={() => useSample(cam.id, cam.sampleName, cam.sampleDuration)}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-pace-green/40 text-pace-green hover:bg-pace-green/10 transition-colors cursor-pointer"
                        >
                          Use Sample
                        </button>
                      )}

                      {/* Real upload label */}
                      {!isSample && (
                        <label className={`text-xs font-semibold px-3 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                          uploaded
                            ? "text-pace-green border-pace-green/40 hover:bg-pace-green/10"
                            : "text-zinc-400 border-zinc-600 hover:border-zinc-400"
                        }`}>
                          {uploaded ? "Change" : "Upload"}
                          <input
                            type="file"
                            accept="video/mp4,video/*"
                            className="sr-only"
                            onChange={(e) =>
                              handleFileChange(cam.id, e.target.files?.[0] ?? null)
                            }
                          />
                        </label>
                      )}

                      {/* Clear button when uploaded */}
                      {uploaded && (
                        <button
                          type="button"
                          onClick={() => clearAngle(cam.id)}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:border-red-500/40 hover:text-red-400 transition-colors cursor-pointer"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Mock video player (sample) or file name (real upload) */}
                  {state && (
                    <div className="px-4 pb-4">
                      {state.kind === "sample" ? (
                        <MockVideoPlayer
                          label={cam.label}
                          duration={state.duration}
                          bg={visual.bg}
                          lines={visual.lines}
                          icon={cam.icon}
                        />
                      ) : (
                        <div className="flex items-center gap-2 px-3 py-2 bg-ink rounded-lg">
                          <span className="text-pace-green text-xs">📎</span>
                          <span className="text-xs text-zinc-300 truncate">{state.file.name}</span>
                          <span className="text-xs text-zinc-500 ml-auto flex-shrink-0">
                            {(state.file.size / (1024 * 1024)).toFixed(1)} MB
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {uploadedCount > 0 && uploadedCount < 3 && (
            <p className="text-xs text-amber mt-3">
              ⚠ Upload all 3 angles for full AI biomechanics analysis
            </p>
          )}
          {uploadedCount === 3 && (
            <p className="text-xs text-pace-green mt-3">
              ✓ All 3 angles ready — AI analysis will run after saving
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting || submitted}
            className={`px-6 py-3 rounded-xl text-sm font-bold transition-all cursor-pointer ${
              submitted
                ? "bg-pace-green/60 text-black"
                : submitting
                  ? "bg-pace-green/80 text-black"
                  : "bg-pace-green text-black hover:opacity-90"
            }`}
          >
            {submitted ? "✓ Session Saved" : submitting ? "Saving…" : "Save Session"}
          </button>
          <Link
            href={`/players/${player.id}`}
            className="px-6 py-3 rounded-xl text-sm font-medium text-zinc-400 border border-zinc-700 hover:text-white hover:border-zinc-500 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

// ─── Mock video player ─────────────────────────────────────────────────────────

function MockVideoPlayer({
  label,
  duration,
  bg,
  lines,
  icon,
}: {
  label: string;
  duration: string;
  bg: string;
  lines: string[];
  icon: string;
}) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  function handlePlay() {
    if (playing) {
      setPlaying(false);
      return;
    }
    setPlaying(true);
    // Animate progress bar over ~4s to simulate playback
    let p = progress;
    const interval = setInterval(() => {
      p += 2;
      setProgress(Math.min(p, 100));
      if (p >= 100) {
        clearInterval(interval);
        setPlaying(false);
      }
    }, 80);
  }

  return (
    <div className={`rounded-xl overflow-hidden bg-gradient-to-br ${bg} border border-zinc-700`}>
      {/* Video frame */}
      <div className="relative h-36 flex items-center justify-center">
        {/* Background grid lines (simulates cricket pitch lines) */}
        <div className="absolute inset-0 opacity-10">
          <div className="h-full w-full" style={{
            backgroundImage: "linear-gradient(0deg, transparent 24%, rgba(255,255,255,.05) 25%, rgba(255,255,255,.05) 26%, transparent 27%, transparent 74%, rgba(255,255,255,.05) 75%, rgba(255,255,255,.05) 76%, transparent 77%), linear-gradient(90deg, transparent 24%, rgba(255,255,255,.05) 25%, rgba(255,255,255,.05) 26%, transparent 27%, transparent 74%, rgba(255,255,255,.05) 75%, rgba(255,255,255,.05) 76%, transparent 77%)",
            backgroundSize: "30px 30px",
          }} />
        </div>

        {/* Angle label watermark */}
        <div className="absolute top-2 left-3 flex items-center gap-1.5">
          <span className="text-white/40 text-xs">{icon}</span>
          <span className="text-white/40 text-xs font-semibold">{label}</span>
        </div>

        {/* REC indicator */}
        <div className="absolute top-2 right-3 flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-white/60 text-xs font-mono">SAMPLE</span>
        </div>

        {/* Centre content */}
        <div className="text-center z-10">
          <button
            type="button"
            onClick={handlePlay}
            className="w-12 h-12 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-sm flex items-center justify-center transition-colors cursor-pointer mb-2 mx-auto"
          >
            {playing ? (
              <div className="flex gap-1">
                <div className="w-1 h-4 bg-white rounded-sm" />
                <div className="w-1 h-4 bg-white rounded-sm" />
              </div>
            ) : (
              <div className="w-0 h-0 border-t-[7px] border-t-transparent border-l-[12px] border-l-white border-b-[7px] border-b-transparent ml-1" />
            )}
          </button>
          <div className="text-white/50 text-xs">{lines[0]}</div>
          <div className="text-white/30 text-xs">{lines[1]}</div>
        </div>

        {/* Duration badge */}
        <div className="absolute bottom-2 right-3 bg-black/50 rounded px-1.5 py-0.5 text-white/80 text-xs font-mono">
          {duration}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-zinc-700">
        <div
          className="h-full bg-pace-green transition-all duration-75"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-3 px-3 py-2">
        <button
          type="button"
          onClick={handlePlay}
          className="text-white/60 hover:text-white text-xs transition-colors cursor-pointer"
        >
          {playing ? "⏸" : "▶"}
        </button>
        <div className="flex-1 text-xs text-zinc-500 truncate">{
          playing ? "Playing sample…" : progress > 0 ? "Paused" : "Sample footage"
        }</div>
        <span className="text-xs text-zinc-500 font-mono">{duration}</span>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full bg-ink rounded-xl px-4 py-3 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm";

const selectCls =
  "w-full bg-ink rounded-xl px-4 py-3 text-white border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors text-sm cursor-pointer";
