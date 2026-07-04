// Renders a video frame with the detected pose skeleton drawn on top, for the
// key delivery phases (back-foot contact, front-foot contact, release,
// follow-through). This is the visual counterpart to lib/biomechanics.ts —
// it draws the same landmarks the metrics were computed from, so a coach can
// see exactly what the measurement was based on.

import type { NormalizedLandmark } from "./pose";

function seekTo(video: HTMLVideoElement, tSec: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => { video.removeEventListener("seeked", onSeeked); resolve(); };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = tSec;
  });
}

function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    video.addEventListener("loadedmetadata", () => resolve(), { once: true });
    video.addEventListener("error", () => reject(new Error("Could not load video for skeleton overlay.")), { once: true });
  });
}

function drawSkeleton(ctx: CanvasRenderingContext2D, landmarks: NormalizedLandmark[], connections: { start: number; end: number }[], width: number, height: number) {
  ctx.strokeStyle = "#00D4AA";
  ctx.lineWidth = Math.max(2, width / 400);
  ctx.beginPath();
  for (const { start, end } of connections) {
    const a = landmarks[start], b = landmarks[end];
    if (!a || !b || a.visibility < 0.3 || b.visibility < 0.3) continue;
    ctx.moveTo(a.x * width, a.y * height);
    ctx.lineTo(b.x * width, b.y * height);
  }
  ctx.stroke();

  ctx.fillStyle = "#FF6B2B";
  const r = Math.max(3, width / 250);
  for (const p of landmarks) {
    if (p.visibility < 0.3) continue;
    ctx.beginPath();
    ctx.arc(p.x * width, p.y * height, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Draws one video frame (at tSec) with the pose skeleton overlaid, returns a JPEG blob. */
export async function renderSkeletonFrame(
  videoUrl: string,
  tSec: number,
  landmarks: NormalizedLandmark[],
): Promise<Blob> {
  const { PoseLandmarker } = await import("@mediapipe/tasks-vision");

  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = videoUrl;

  try {
    await waitForMetadata(video);
    await seekTo(video, Math.min(tSec, video.duration - 0.001));

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable.");

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    drawSkeleton(ctx, landmarks, PoseLandmarker.POSE_CONNECTIONS, canvas.width, canvas.height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Failed to encode skeleton overlay image."))), "image/jpeg", 0.85);
    });
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
}
