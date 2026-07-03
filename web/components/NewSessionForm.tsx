"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Player, Session, SessionVideo } from "@/lib/types";
import { insertSession } from "@/lib/db";
import { createClient } from "@/lib/supabase";

const SESSION_TYPES = [
  "Net Session",
  "Match Practice",
  "Individual Drill",
  "Warm-up / Conditioning",
  "Video Review",
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
type UploadStatus = "idle" | "uploading" | "done" | "error";

export function NewSessionForm({ player }: { player: Player }) {
  const router = useRouter();
  const supabase = createClient();
  const today = new Date().toISOString().split("T")[0];

  const [sessionDate, setSessionDate] = useState(today);
  const [sessionType, setSessionType] = useState<string>(SESSION_TYPES[0]);
  const [notes, setNotes]             = useState("");
  const [files, setFiles]             = useState<Partial<Record<AngleId, File>>>({});
  const [uploadStatus, setUploadStatus] = useState<Record<AngleId, UploadStatus>>({
    front: "idle", side: "idle", back: "idle",
  });
  const [submitting, setSubmitting]   = useState(false);
  const [submitted,  setSubmitted]    = useState(false);
  const [submitError, setSubmitError] = useState("");

  const initials = player.name.split(" ").map((n) => n[0] ?? "").join("");
  const uploadedCount = Object.keys(files).length;
  const isUploading = Object.values(uploadStatus).some((s) => s === "uploading");

  function handleFileChange(angle: AngleId, file: File | null) {
    setFiles((prev) => {
      const next = { ...prev };
      if (file) next[angle] = file;
      else delete next[angle];
      return next;
    });
    setUploadStatus((prev) => ({ ...prev, [angle]: "idle" }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError("");

    const sessionId = `s_${Date.now()}`;
    const videos: SessionVideo[] = [];

    // Upload each file directly to Supabase Storage via signed URL
    for (const { id: angle } of CAMERA_ANGLES) {
      const file = files[angle];
      if (!file) continue;

      setUploadStatus((prev) => ({ ...prev, [angle]: "uploading" }));

      try {
        const ext  = file.name.split(".").pop() ?? "mp4";
        const path = `${player.id}/${sessionId}/${angle}.${ext}`;

        // 1. Get signed upload URL from server (uses service role key)
        const signRes  = await fetch("/api/storage/sign-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path }),
        });
        const signData = await signRes.json();
        if (signData.error) throw new Error(signData.error);

        // 2. Upload directly to Supabase Storage — bypasses Vercel size limits
        const { error: uploadError } = await supabase.storage
          .from("session-videos")
          .uploadToSignedUrl(path, signData.token, file, { contentType: file.type });
        if (uploadError) throw uploadError;

        // 3. Get permanent public URL
        const { data: { publicUrl } } = supabase.storage
          .from("session-videos")
          .getPublicUrl(path);

        videos.push({ angle, label: file.name, url: publicUrl });
        setUploadStatus((prev) => ({ ...prev, [angle]: "done" }));
      } catch (err) {
        const msg = (err as { message?: string })?.message ?? String(err);
        setUploadStatus((prev) => ({ ...prev, [angle]: "error" }));
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
            <span className="text-xs text-zinc-500">{uploadedCount}/3 selected</span>
          </div>
          <p className="text-xs text-zinc-500 mb-5">
            Min. 60 fps · 1080p · MP4 · All 3 angles recommended for AI analysis
          </p>

          <div className="space-y-3">
            {CAMERA_ANGLES.map((cam) => {
              const file   = files[cam.id];
              const status = uploadStatus[cam.id];
              const hasFile = !!file;

              return (
                <div
                  key={cam.id}
                  className={`rounded-xl border transition-colors ${
                    status === "done"  ? "border-pace-green/40 bg-pace-green/5" :
                    status === "error" ? "border-red-500/40 bg-red-500/5" :
                    hasFile            ? "border-zinc-500 bg-zinc-800/40" :
                                         "border-zinc-700"
                  }`}
                >
                  <div className="flex items-center gap-4 p-4">
                    {/* Status icon */}
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      status === "done"      ? "bg-pace-green/20" :
                      status === "error"     ? "bg-red-500/20" :
                      status === "uploading" ? "bg-zinc-700" :
                      hasFile                ? "bg-zinc-700" :
                                               "bg-ink"
                    }`}>
                      {status === "uploading" ? (
                        <div className="w-4 h-4 rounded-full border-2 border-pace-green border-t-transparent animate-spin" />
                      ) : status === "done" ? (
                        <span className="text-pace-green text-sm font-bold">✓</span>
                      ) : status === "error" ? (
                        <span className="text-red-400 text-sm font-bold">✗</span>
                      ) : (
                        <span className="text-zinc-500">{cam.icon}</span>
                      )}
                    </div>

                    {/* Label + file name */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${
                        status === "done"  ? "text-pace-green" :
                        status === "error" ? "text-red-400" :
                        hasFile            ? "text-white" :
                                             "text-zinc-400"
                      }`}>
                        {cam.label}
                      </p>
                      {file ? (
                        <p className="text-xs text-zinc-500 truncate">
                          {file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB
                          {status === "uploading" && " · Uploading…"}
                          {status === "done"      && " · Uploaded"}
                        </p>
                      ) : (
                        <p className="text-xs text-zinc-600">{cam.description}</p>
                      )}
                    </div>

                    {/* Buttons — hidden while uploading */}
                    {status !== "uploading" && status !== "done" && (
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

          {uploadedCount > 0 && uploadedCount < 3 && (
            <p className="text-xs text-amber mt-3">
              ⚠ Upload all 3 angles for full AI biomechanics analysis
            </p>
          )}
          {uploadedCount === 3 && !submitting && (
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
            disabled={submitting || submitted || isUploading}
            className={`px-6 py-3 rounded-xl text-sm font-bold transition-all cursor-pointer ${
              submitted
                ? "bg-pace-green/60 text-black"
                : submitting
                  ? "bg-pace-green/80 text-black"
                  : "bg-pace-green text-black hover:opacity-90 disabled:opacity-60"
            }`}
          >
            {submitted ? "✓ Session Saved" : submitting ? (
              uploadedCount > 0 ? `Uploading videos…` : "Saving…"
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
