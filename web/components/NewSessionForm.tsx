"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Player, Session, SessionVideo } from "@/lib/types";
import { insertSession } from "@/lib/db";
import { createClient } from "@/lib/supabase";
import { probeVideoQuality, MIN_LONG_EDGE_PX, MIN_SHORT_EDGE_PX, MIN_FPS, type VideoQualityResult } from "@/lib/video-quality";
import { transcodeToH264 } from "@/lib/transcode";

const SESSION_TYPES = [
  "Net Session",
  "Individual Coaching",
  "Video Review",
  "Fitness Assessment",
  "Match Practice",
  "Warm-up / Conditioning",
] as const;

const CAMERA_ANGLES = [
  {
    id: "front" as const,
    label: "Front Camera",
    description: "Behind umpire, facing down pitch · 8–10m",
    icon: "⬆",
  },
  {
    id: "side" as const,
    label: "Side Camera",
    description: "Square on to crease, off-stump side · 5–7m",
    icon: "➡",
  },
  {
    id: "back" as const,
    label: "Back Camera",
    description: "Behind bowler, facing run-up · 3–4m",
    icon: "⬇",
  },
] as const;

type AngleId = "front" | "side" | "back";
type AngleStatus = "idle" | "checking" | "invalid" | "ready" | "transcoding" | "uploading" | "done" | "error";

interface AngleState {
  file: File | null;
  status: AngleStatus;
  quality?: VideoQualityResult;
  error?: string;
  progress?: number; // transcode progress, 0–1
}

const EMPTY_ANGLE: AngleState = { file: null, status: "idle" };

export function NewSessionForm({ player }: { player: Player }) {
  const router = useRouter();
  const supabase = createClient();
  const today = new Date().toISOString().split("T")[0];

  const [sessionDate, setSessionDate] = useState(today);
  const [sessionType, setSessionType] = useState<string>(SESSION_TYPES[0]);
  const [notes, setNotes]             = useState("");
  const [angles, setAngles] = useState<Record<AngleId, AngleState>>({
    front: { ...EMPTY_ANGLE }, side: { ...EMPTY_ANGLE }, back: { ...EMPTY_ANGLE },
  });
  const [submitting, setSubmitting]   = useState(false);
  const [submitted,  setSubmitted]    = useState(false);
  const [submitError, setSubmitError] = useState("");

  const initials = player.name.split(" ").map((n) => n[0] ?? "").join("");
  const selectedCount = Object.values(angles).filter((a) => a.file && a.status !== "invalid").length;
  const isBusy = Object.values(angles).some((a) => a.status === "checking" || a.status === "transcoding" || a.status === "uploading");
  const hasInvalid = Object.values(angles).some((a) => a.status === "invalid");

  function handleFileChange(angle: AngleId, file: File | null) {
    if (!file) {
      setAngles((prev) => ({ ...prev, [angle]: { ...EMPTY_ANGLE } }));
      return;
    }

    setAngles((prev) => ({ ...prev, [angle]: { file, status: "checking" } }));

    probeVideoQuality(file)
      .then((quality) => {
        setAngles((prev) => {
          if (prev[angle].file !== file) return prev; // user picked a different file while we were checking
          // Resolution/fps are warnings, not blocks — coaches often receive
          // footage via WhatsApp etc. which downscales aggressively regardless
          // of source quality, so refusing it outright would reject real footage.
          return { ...prev, [angle]: { file, status: "ready", quality } };
        });
      })
      .catch((err) => {
        // Only a genuinely unreadable file (corrupt / unsupported format) blocks —
        // there's nothing to upload or transcode if the browser can't decode it at all.
        setAngles((prev) => {
          if (prev[angle].file !== file) return prev;
          return { ...prev, [angle]: { file, status: "invalid", error: (err as { message?: string })?.message ?? "Could not read this video file." } };
        });
      });
  }

  function qualityWarning(quality: VideoQualityResult | undefined): string | null {
    if (!quality) return null;
    const warnings: string[] = [];
    if (!quality.meetsResolution) {
      warnings.push(`${quality.width}×${quality.height} is below the ${MIN_LONG_EDGE_PX}×${MIN_SHORT_EDGE_PX} (1080p) target`);
    }
    if (quality.meetsFps === false) {
      warnings.push(`estimated ${quality.fps} fps is below the ${MIN_FPS}+ fps target`);
    }
    if (warnings.length === 0) return null;
    return `⚠ ${warnings.join(" · ")} — AI analysis may be less accurate on this clip, but upload will proceed.`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (hasInvalid) { setSubmitError("Fix or remove the flagged video before saving."); return; }
    if (Object.values(angles).some((a) => a.status === "checking")) { setSubmitError("Still checking video quality — please wait a moment."); return; }

    setSubmitting(true);
    setSubmitError("");

    const sessionId = `s_${Date.now()}`;
    const videos: SessionVideo[] = [];

    for (const { id: angle } of CAMERA_ANGLES) {
      const angleState = angles[angle];
      const file = angleState.file;
      if (!file) continue;

      try {
        // 1. Normalize to H.264 MP4 client-side — falls back to the original file
        // if transcoding fails (e.g. out of memory on a low-end device), rather
        // than blocking the whole session save.
        setAngles((prev) => ({ ...prev, [angle]: { ...prev[angle], status: "transcoding", progress: 0 } }));
        let uploadFile = file;
        let transcoded = false;
        try {
          uploadFile = await transcodeToH264(file, (ratio) => {
            setAngles((prev) => ({ ...prev, [angle]: { ...prev[angle], progress: ratio } }));
          });
          transcoded = true;
        } catch (transcodeErr) {
          console.warn(`Transcode failed for ${angle}, uploading original file instead`, transcodeErr);
        }

        // 2. Upload directly to Supabase Storage via signed URL — bypasses Vercel size limits
        setAngles((prev) => ({ ...prev, [angle]: { ...prev[angle], status: "uploading" } }));
        const ext  = transcoded ? "mp4" : (file.name.split(".").pop() ?? "mp4");
        const path = `${player.id}/${sessionId}/${angle}.${ext}`;

        const signRes  = await fetch("/api/storage/sign-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path }),
        });
        const signData = await signRes.json();
        if (signData.error) throw new Error(signData.error);

        const { error: uploadError } = await supabase.storage
          .from("session-videos")
          .uploadToSignedUrl(path, signData.token, uploadFile, { contentType: uploadFile.type });
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("session-videos")
          .getPublicUrl(path);

        const quality = angleState.quality;
        videos.push({
          angle, label: file.name, url: publicUrl,
          width: quality?.width, height: quality?.height,
          durationSec: quality?.durationSec, fps: quality?.fps ?? null,
          transcoded,
        });
        setAngles((prev) => ({ ...prev, [angle]: { ...prev[angle], status: "done" } }));
      } catch (err) {
        const msg = (err as { message?: string })?.message ?? String(err);
        setAngles((prev) => ({ ...prev, [angle]: { ...prev[angle], status: "error" } }));
        setSubmitError(`Upload failed (${angle}): ${msg}`);
        setSubmitting(false);
        return;
      }
    }

    // Save session to Supabase DB
    try {
      await insertSession({
        id: sessionId,
        player_id: player.id,
        date: sessionDate,
        type: sessionType,
        notes,
        videos,
        ball_speed_kmh: null,
        front_knee_angle_deg: null,
        xp_earned: 50 + videos.length * 20,
      });
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? String(err);
      setSubmitError(`Failed to save session: ${msg}`);
      setSubmitting(false);
      return;
    }

    setSubmitted(true);
    setTimeout(() => router.push(`/players/${player.id}`), 1200);
  }

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
          <p className="text-zinc-400 text-sm">{player.name} · {player.bowlingStyle}</p>
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
            <span className="text-xs text-zinc-500">{selectedCount}/3 selected</span>
          </div>
          <p className="text-xs text-zinc-500 mb-5">
            Target: {MIN_FPS}+ fps · {MIN_LONG_EDGE_PX}×{MIN_SHORT_EDGE_PX} (1080p) · MP4 · all 3 angles recommended for AI analysis.
            Lower-quality clips (e.g. shared via WhatsApp) still upload — you&apos;ll just see a quality warning.
            Every clip is normalized to H.264 MP4 in your browser before upload.
          </p>

          <div className="space-y-3">
            {CAMERA_ANGLES.map((cam) => {
              const angleState = angles[cam.id];
              const { file, status, quality, error, progress } = angleState;
              const hasFile = !!file;
              const busy = status === "checking" || status === "transcoding" || status === "uploading";

              return (
                <div
                  key={cam.id}
                  className={`rounded-xl border transition-colors ${
                    status === "done"    ? "border-pace-green/40 bg-pace-green/5" :
                    status === "error"   ? "border-red-500/40 bg-red-500/5" :
                    status === "invalid" ? "border-red-500/40 bg-red-500/5" :
                    hasFile              ? "border-zinc-500 bg-zinc-800/40" :
                                           "border-zinc-700"
                  }`}
                >
                  <div className="flex items-center gap-4 p-4">
                    {/* Status icon */}
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      status === "done"                              ? "bg-pace-green/20" :
                      status === "error" || status === "invalid"     ? "bg-red-500/20" :
                      busy                                           ? "bg-zinc-700" :
                      hasFile                                        ? "bg-zinc-700" :
                                                                       "bg-ink"
                    }`}>
                      {busy ? (
                        <div className="w-4 h-4 rounded-full border-2 border-pace-green border-t-transparent animate-spin" />
                      ) : status === "done" ? (
                        <span className="text-pace-green text-sm font-bold">✓</span>
                      ) : status === "error" || status === "invalid" ? (
                        <span className="text-red-400 text-sm font-bold">✗</span>
                      ) : (
                        <span className="text-zinc-500">{cam.icon}</span>
                      )}
                    </div>

                    {/* Label + file name */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${
                        status === "done"                          ? "text-pace-green" :
                        status === "error" || status === "invalid" ? "text-red-400" :
                        hasFile                                    ? "text-white" :
                                                                     "text-zinc-400"
                      }`}>
                        {cam.label}
                      </p>
                      {file ? (
                        <>
                          <p className="text-xs text-zinc-500 truncate">
                            {file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB
                            {status === "checking"    && " · Checking quality…"}
                            {status === "transcoding" && ` · Converting… ${Math.round((progress ?? 0) * 100)}%`}
                            {status === "uploading"   && " · Uploading…"}
                            {status === "done"        && " · Uploaded"}
                          </p>
                          {status === "invalid" && error && (
                            <p className="text-xs text-red-400 mt-0.5">{error}</p>
                          )}
                          {(status === "ready" || status === "done") && qualityWarning(quality) && (
                            <p className="text-xs text-amber mt-0.5">{qualityWarning(quality)}</p>
                          )}
                          {status === "transcoding" && (
                            <div className="h-1 bg-zinc-700 rounded-full mt-1.5 overflow-hidden">
                              <div
                                className="h-full bg-pace-green transition-all"
                                style={{ width: `${Math.round((progress ?? 0) * 100)}%` }}
                              />
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-zinc-600">{cam.description}</p>
                      )}
                    </div>

                    {/* Buttons — hidden while busy or done */}
                    {!busy && status !== "done" && (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <label className={`text-xs font-semibold px-3 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                          hasFile
                            ? "text-zinc-400 border-zinc-600 hover:border-zinc-400"
                            : "text-pace-green border-pace-green/40 hover:bg-pace-green/10"
                        }`}>
                          {hasFile ? "Change" : "Select video"}
                          <input
                            type="file"
                            accept="video/mp4,video/quicktime,video/webm,video/*"
                            className="sr-only"
                            onChange={(e) => handleFileChange(cam.id, e.target.files?.[0] ?? null)}
                          />
                        </label>
                        {hasFile && (
                          <button
                            type="button"
                            onClick={() => handleFileChange(cam.id, null)}
                            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-red-400 hover:border-red-500/40 transition-colors cursor-pointer"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {selectedCount > 0 && selectedCount < 3 && (
            <p className="text-xs text-amber mt-3">
              ⚠ Upload all 3 angles for full AI biomechanics analysis
            </p>
          )}
          {selectedCount === 3 && !submitting && (
            <p className="text-xs text-pace-green mt-3">
              ✓ All 3 angles selected — will upload on save
            </p>
          )}
        </div>

        {/* Error */}
        {submitError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
            {submitError}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting || submitted || isBusy || hasInvalid}
            className={`px-6 py-3 rounded-xl text-sm font-bold transition-all cursor-pointer ${
              submitted
                ? "bg-pace-green/60 text-black"
                : submitting
                  ? "bg-pace-green/80 text-black"
                  : "bg-pace-green text-black hover:opacity-90 disabled:opacity-60"
            }`}
          >
            {submitted ? "✓ Session Saved" : submitting ? (
              selectedCount > 0 ? `Processing videos…` : "Saving…"
            ) : "Save Session"}
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
