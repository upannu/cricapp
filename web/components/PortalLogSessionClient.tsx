"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { fetchPlayer, fetchAcademies } from "@/lib/db";
import { probeVideoQuality, MIN_LONG_EDGE_PX, MIN_SHORT_EDGE_PX, MIN_FPS, type VideoQualityResult } from "@/lib/video-quality";
import {
  uploadSessionVideo,
  CAMERA_ANGLES, EMPTY_ANGLE,
  type AngleId, type AngleState,
} from "@/lib/session-video-upload";
import { runReportPipeline } from "@/lib/report-pipeline";
import { DateInput } from "@/components/DateInput";
import type { Player, Academy, Session, SessionVideo, BookingType } from "@/lib/types";

const SESSION_TYPES: BookingType[] = [
  "Individual Coaching", "Net Session", "Video Review",
  "Fitness Assessment", "Match Practice", "Warm-up / Conditioning",
];

/** A player logging their own delivery with no coach present — the self-serve path for an
 * independent player whose Player Pro subscription otherwise has nowhere to actually get used
 * (only a coach can normally log a session). Capped separately from every other Pro entitlement —
 * see selfLogSessionsLimitForPlan's own doc comment. */
export function PortalLogSessionClient() {
  const router = useRouter();
  const { user } = useAuth();
  const today = new Date().toISOString().split("T")[0];

  const [player, setPlayer] = useState<Player | null>(null);
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [loading, setLoading] = useState(true);

  const [sessionDate, setSessionDate] = useState(today);
  const [sessionType, setSessionType] = useState<BookingType>(SESSION_TYPES[0]);
  const [notes, setNotes] = useState("");
  const [rpe, setRpe] = useState<number | null>(null);
  const [angles, setAngles] = useState<Record<AngleId, AngleState>>({
    front: { ...EMPTY_ANGLE }, side: { ...EMPTY_ANGLE }, back: { ...EMPTY_ANGLE },
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitStage, setSubmitStage] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [result, setResult] = useState<{ xpEarned: number; selfLogRemaining: number; reportError: string | null; hadVideo: boolean } | null>(null);

  useEffect(() => {
    if (!user?.playerId) return;
    Promise.all([fetchPlayer(user.playerId), fetchAcademies()]).then(([p, ac]) => {
      setPlayer(p);
      setAcademies(ac);
      setLoading(false);
    });
  }, [user]);

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
        setAngles((prev) => (prev[angle].file !== file ? prev : { ...prev, [angle]: { file, status: "ready", quality } }));
      })
      .catch((err) => {
        setAngles((prev) => (prev[angle].file !== file ? prev : {
          ...prev, [angle]: { file, status: "invalid", error: (err as { message?: string })?.message ?? "Could not read this video file." },
        }));
      });
  }

  function qualityWarning(quality: VideoQualityResult | undefined): string | null {
    if (!quality) return null;
    const warnings: string[] = [];
    if (!quality.meetsResolution) warnings.push(`${quality.width}×${quality.height} is below the ${MIN_LONG_EDGE_PX}×${MIN_SHORT_EDGE_PX} (1080p) target`);
    if (quality.meetsFps === false) warnings.push(`estimated ${quality.fps} fps is below the ${MIN_FPS}+ fps target`);
    return warnings.length === 0 ? null : `⚠ ${warnings.join(" · ")} — AI analysis may be less accurate on this clip, but upload will proceed.`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!player) return;
    if (hasInvalid) { setSubmitError("Fix or remove the flagged video before saving."); return; }
    if (Object.values(angles).some((a) => a.status === "checking")) { setSubmitError("Still checking video quality — please wait a moment."); return; }

    setSubmitting(true);
    setSubmitError("");
    setSubmitStage("");
    const sessionId = `self_${Date.now()}`;
    const videos: SessionVideo[] = [];

    for (const { id: angle } of CAMERA_ANGLES) {
      const angleState = angles[angle];
      const file = angleState.file;
      if (!file) continue;
      try {
        setAngles((prev) => ({ ...prev, [angle]: { ...prev[angle], status: "transcoding", progress: 0 } }));
        const video = await uploadSessionVideo({
          file, playerId: player.id, sessionId, angle, quality: angleState.quality,
          onTranscodeProgress: (ratio) => setAngles((prev) => ({ ...prev, [angle]: { ...prev[angle], progress: ratio } })),
        });
        setAngles((prev) => ({ ...prev, [angle]: { ...prev[angle], status: "uploading" } }));
        videos.push(video);
        setAngles((prev) => ({ ...prev, [angle]: { ...prev[angle], status: "done" } }));
      } catch (err) {
        const msg = (err as { message?: string })?.message ?? String(err);
        setAngles((prev) => ({ ...prev, [angle]: { ...prev[angle], status: "error" } }));
        setSubmitError(`Upload failed (${angle}): ${msg}`);
        setSubmitting(false);
        return;
      }
    }

    try {
      const res = await fetch("/api/portal/log-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: sessionDate, type: sessionType, notes, rpe, videos }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed to save your session.");

      // Best-effort, and only attempted at all when there's a video to analyze — a Warm-up /
      // Conditioning or Fitness Assessment session has nothing for the pipeline to work with.
      let reportError: string | null = null;
      if (videos.length > 0) {
        try {
          const session: Session = {
            id: data.sessionId, playerId: player.id, date: sessionDate, type: sessionType,
            notes, videos, ballSpeedKmh: null, frontKneeAngleDeg: null, xpEarned: data.xpEarned,
            rpe, coachId: null,
          };
          await runReportPipeline({ session, player, academies, onProgress: setSubmitStage });
        } catch (err) {
          reportError = (err as { message?: string })?.message ?? String(err);
        }
      }

      setResult({ xpEarned: data.xpEarned, selfLogRemaining: data.selfLogRemaining, reportError, hadVideo: videos.length > 0 });
    } catch (err) {
      setSubmitError((err as { message?: string })?.message ?? String(err));
    } finally {
      setSubmitting(false);
      setSubmitStage("");
    }
  }

  if (loading && user?.playerId) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 rounded-full border-2 border-pace-green border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user?.playerId || !player) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <p className="text-white font-semibold mb-2">No player linked to this account</p>
        <p className="text-zinc-400 text-sm">Contact your coach or academy admin to get this fixed.</p>
      </div>
    );
  }

  if (result) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-pace-green/20 flex items-center justify-center text-pace-green text-2xl font-bold mx-auto mb-4">✓</div>
        <p className="text-white font-semibold text-lg mb-1">Session saved</p>
        <p className="text-zinc-400 text-sm mb-1">+{result.xpEarned} XP · {result.selfLogRemaining} self-logged session{result.selfLogRemaining === 1 ? "" : "s"} left this month</p>
        {result.reportError ? (
          <p className="text-amber text-sm mt-4">Report generation did not complete: {result.reportError}. Your session is still saved — a coach can generate the report later from Sessions.</p>
        ) : result.hadVideo ? (
          <p className="text-pace-green text-sm mt-4">Your AI biomechanics report is ready in Reports.</p>
        ) : (
          <p className="text-zinc-400 text-sm mt-4">No video was attached, so there&apos;s no AI report for this one — add a delivery video next time you want your action analyzed.</p>
        )}
        <button type="button" onClick={() => router.push("/portal")}
          className="mt-6 px-5 py-2.5 bg-pace-green text-black text-sm font-bold rounded-xl hover:opacity-90 transition-opacity cursor-pointer">
          Back to Portal
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <h1 className="text-xl font-bold text-white mb-1">Log My Own Session</h1>
      <p className="text-zinc-400 text-sm mb-6">
        No coach available right now? Log any session yourself — add a delivery video too if you want an AI biomechanics analysis.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-surface rounded-2xl p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">Date</label>
            <DateInput value={sessionDate} onChange={setSessionDate} className="w-full bg-ink rounded-xl px-3 py-2.5 text-sm text-white border border-zinc-700 focus:border-pace-green focus:outline-none" required />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">Session Type</label>
            <select value={sessionType} onChange={(e) => setSessionType(e.target.value as BookingType)}
              className="w-full bg-ink rounded-xl px-3 py-2.5 text-sm text-white border border-zinc-700 focus:border-pace-green focus:outline-none">
              {SESSION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">RPE (how hard did it feel, 1–10)</label>
            <div className="flex gap-1.5 flex-wrap">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button key={n} type="button" onClick={() => setRpe(rpe === n ? null : n)}
                  className={`w-9 h-9 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                    rpe === n ? "bg-pace-green text-black border-pace-green" : "text-zinc-400 border-zinc-700 hover:border-zinc-500"
                  }`}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">Notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              placeholder="What were you working on this session?"
              className="w-full bg-ink rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none resize-none" />
          </div>
        </div>

        <div className="bg-surface rounded-2xl p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">Camera Angles (optional)</p>
          <p className="text-xs text-zinc-500 mb-4">Only needed if you want an AI biomechanics report — skip this for a Warm-up / Conditioning or Fitness Assessment session. Side-on gives the most accurate analysis when you do add one.</p>
          <div className="space-y-3">
            {CAMERA_ANGLES.map((cam) => {
              const angleState = angles[cam.id];
              const { file, status, quality, error, progress } = angleState;
              const hasFile = !!file;
              const busy = status === "checking" || status === "transcoding" || status === "uploading";
              return (
                <div key={cam.id} className={`rounded-xl border transition-colors ${
                  status === "done" ? "border-pace-green/40 bg-pace-green/5" :
                  status === "error" || status === "invalid" ? "border-red-500/40 bg-red-500/5" :
                  hasFile ? "border-zinc-500 bg-zinc-800/40" : "border-zinc-700"
                }`}>
                  <div className="flex items-center gap-4 p-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      status === "done" ? "bg-pace-green/20" :
                      status === "error" || status === "invalid" ? "bg-red-500/20" :
                      busy || hasFile ? "bg-zinc-700" : "bg-ink"
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
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${
                        status === "done" ? "text-pace-green" :
                        status === "error" || status === "invalid" ? "text-red-400" :
                        hasFile ? "text-white" : "text-zinc-400"
                      }`}>
                        {cam.label}
                      </p>
                      {file ? (
                        <>
                          <p className="text-xs text-zinc-500 truncate">
                            {file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB
                            {status === "checking" && " · Checking quality…"}
                            {status === "transcoding" && ` · Converting… ${Math.round((progress ?? 0) * 100)}%`}
                            {status === "uploading" && " · Uploading…"}
                            {status === "done" && " · Uploaded"}
                          </p>
                          {status === "invalid" && error && <p className="text-xs text-red-400 mt-0.5">{error}</p>}
                          {(status === "ready" || status === "done") && qualityWarning(quality) && (
                            <p className="text-xs text-amber mt-0.5">{qualityWarning(quality)}</p>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-zinc-600">{cam.description}</p>
                      )}
                    </div>
                    {!busy && status !== "done" && (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <label className={`text-xs font-semibold px-3 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                          hasFile ? "text-zinc-400 border-zinc-600 hover:border-zinc-400" : "text-pace-green border-pace-green/40 hover:bg-pace-green/10"
                        }`}>
                          {hasFile ? "Change" : "Select video"}
                          <input type="file" accept="video/mp4,video/quicktime,video/webm,video/*" className="sr-only"
                            onChange={(e) => handleFileChange(cam.id, e.target.files?.[0] ?? null)} />
                        </label>
                        {hasFile && (
                          <button type="button" onClick={() => handleFileChange(cam.id, null)}
                            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-red-400 hover:border-red-500/40 transition-colors cursor-pointer">
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
        </div>

        {submitError && <p className="text-red-400 text-sm">{submitError}</p>}

        <button type="submit" disabled={submitting || isBusy}
          className="w-full px-6 py-3 rounded-xl text-sm font-bold bg-pace-green text-black hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-60">
          {submitting ? (submitStage || "Saving…") : "Save Session"}
        </button>
      </form>
    </div>
  );
}
