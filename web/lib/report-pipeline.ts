// The client-side half of AI report generation — pose extraction, biomechanics computation,
// skeleton-overlay rendering, and (front-camera) ball tracking — shared by SessionsClient (staff,
// with an optional camera-calibration modal) and the Portal's self-log flow (a player with no
// academy, so calibration is always skipped in favor of trackBall's own best-effort estimate).
// Extracted from SessionsClient.handleGenerateReport so both call sites run the exact same
// pipeline rather than drifting out of sync.
import type { Academy, CameraCalibration, Player, Session } from "@/lib/types";
import { fetchCameraCalibration } from "@/lib/db";
import { extractPoseSequence } from "@/lib/pose";
import { computeBiomechanics } from "@/lib/biomechanics";
import { renderSkeletonFrame } from "@/lib/skeleton-overlay";
import { trackBall } from "@/lib/ball-tracking";
import { renderPitchMap } from "@/lib/pitch-map";

const ANGLE_PRIORITY = ["side", "front", "back"] as const;

const PHASE_TIME_KEYS = [
  ["backFootContact", "backFootContactSec"],
  ["frontFootContact", "frontFootContactSec"],
  ["peakLoad", "peakLoadSec"],
  ["release", "releaseSec"],
  ["followThrough", "followThroughSec"],
] as const;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Failed to encode image."));
    reader.readAsDataURL(blob);
  });
}

export interface ReportPipelineParams {
  session: Session;
  player: Player;
  academies: Academy[];
  onProgress: (stage: string) => void;
  useAssessmentCredit?: boolean;
  /** Only meaningful when the player belongs to an academy with its own front-camera calibration —
   * SessionsClient passes one backed by its CameraCalibrationModal; a caller with no such UI (the
   * Portal self-log flow) can omit it, since a coachless/academy-less player never reaches the
   * `if (academy)` branch that would call it. */
  requestCalibration?: (videoUrl: string, academyId: string) => Promise<CameraCalibration | null>;
}

/** Runs pose tracking → biomechanics → skeleton rendering → (front camera) ball tracking, then
 * POSTs the result to /api/ai-report. Throws on failure — callers show the message and reset their
 * own "generating" UI state in a catch/finally, same as before this was extracted. */
export async function runReportPipeline({
  session, player, academies, onProgress, useAssessmentCredit = false, requestCalibration,
}: ReportPipelineParams): Promise<void> {
  onProgress("Loading pose model…");

  // Side-on view is best for the sagittal-plane joint angles most metrics depend on (knee brace,
  // trunk lean, arm path) — prefer it, fall back to whichever other angle was actually uploaded.
  const chosenVideo = ANGLE_PRIORITY
    .map((a) => session.videos.find((v) => v.angle === a))
    .find((v) => v?.url);
  if (!chosenVideo?.url) throw new Error("No analyzable video found on this session.");
  const videoUrl = chosenVideo.url;

  onProgress("Tracking body position through the delivery…");
  const frames = await extractPoseSequence(videoUrl, {
    onProgress: (ratio) => onProgress(`Tracking body position… ${Math.round(ratio * 100)}%`),
  });
  if (frames.length < 6) {
    throw new Error("Couldn't confidently detect a bowler in this clip — try a clearer, well-lit, unobstructed side-on video.");
  }

  onProgress("Computing biomechanics metrics…");
  const biomechanics = computeBiomechanics(frames, player.bowlingStyle);

  onProgress("Rendering skeleton overlay…");
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

  // Ball tracking + pitch map — needs the FRONT camera video specifically (the only angle that
  // shows the ball's flight down the pitch), and a one-time calibration per academy to convert
  // pixels to real distance. A player with no academy (independent, self-logged) always falls
  // through to trackBall's own best-effort visual estimate — calibration stays null and
  // requestCalibration, if given, is never called.
  let ballTracking: {
    measured: boolean; confidence: "high" | "low" | "none"; speedKmh: number | null;
    bounceLengthZone: string | null; bounceLineApprox: string | null; note?: string;
  } | null = null;
  let pitchMapBase64: string | null = null;

  const frontVideo = session.videos.find((v) => v.angle === "front");
  if (frontVideo?.url) {
    const academy = academies.find((a) => a.playerIds.includes(player.id));
    let calibration: CameraCalibration | null = null;
    if (academy) {
      onProgress("Checking camera calibration…");
      calibration = await fetchCameraCalibration(academy.id, "front").catch(() => null);
      if (!calibration && requestCalibration) {
        calibration = await requestCalibration(frontVideo.url, academy.id);
      }
    }

    onProgress("Tracking ball flight…");
    const tracked = await trackBall(frontVideo.url, calibration, (ratio) =>
      onProgress(`Tracking ball flight… ${Math.round(ratio * 100)}%`),
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

  onProgress("Generating coaching summary…");
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
      useAssessmentCredit,
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error ?? "Failed to generate report");
}
