// Classical computer-vision ball tracking — there is no pretrained "cricket
// ball detector" model available the way MediaPipe provides one for pose, so
// this uses frame-differencing (motion) + color filtering (red/white ball) to
// find ball candidates, then links them into a trajectory across frames.
//
// This is inherently less reliable than the pose pipeline: fast deliveries
// motion-blur heavily, the ball can blend into the pitch/background, and
// camera shake or poor lighting can lose it entirely. Per product decision,
// this module never fabricates a result — if the trajectory isn't confident
// enough to trust, it says so via `confidence: "none"` rather than guessing.
//
// Runs on the FRONT camera video (facing down the pitch), since that's the
// only angle where the ball's flight down the pitch — and therefore a real
// pitch-map bounce location — is actually visible.
//
// Calibration convention: point1 is the bowler's end, point2 is the
// batsman's end — this is fixed by the calibration UI copy, not detected.

import type { CameraCalibration, PitchLengthZone, PitchLine } from "./types";
import { classifyLengthZone } from "./pitch-map";

export interface BallTrackPoint {
  tSec: number;
  x: number; // pixel coords in the ORIGINAL (full-resolution) frame space
  y: number;
}

export interface BallTrackingOutput {
  confidence: "high" | "low" | "none";
  trajectory: BallTrackPoint[];
  bouncePoint: BallTrackPoint | null;
  speedKmh: number | null; // null unless a calibration was supplied
  distanceFromBatsmanStumpsM: number | null;
  lengthZone: PitchLengthZone | null;
  lineApprox: PitchLine | null;
  note?: string;
}

const PROCESS_WIDTH = 480; // downscale target for per-pixel analysis — full res isn't needed to find a blob centroid
const MAX_SAMPLES = 200;
const MIN_TRAJECTORY_POINTS = 6;
const MAX_GAP_FRAMES = 3;

function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    video.addEventListener("loadedmetadata", () => resolve(), { once: true });
    video.addEventListener("error", () => reject(new Error("Could not load video for ball tracking.")), { once: true });
  });
}

function seekTo(video: HTMLVideoElement, tSec: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => { video.removeEventListener("seeked", onSeeked); resolve(); };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = tSec;
  });
}

interface Blob {
  cx: number; cy: number; // centroid, in downscaled pixel space
  pixelCount: number;
  width: number; height: number;
}

/** Cricket-ball-ish red or white, approximated in RGB space (no HSV conversion needed for this coarse a filter). */
function isBallColor(r: number, g: number, b: number): boolean {
  const isRed = r > 90 && r > g * 1.35 && r > b * 1.35;
  const maxC = Math.max(r, g, b), minC = Math.min(r, g, b);
  const isWhite = r > 170 && g > 170 && b > 170 && (maxC - minC) < 40;
  return isRed || isWhite;
}

/** Connected-component search over a binary mask via flood fill, returning size/circularity-filtered blobs. */
function findBlobs(mask: Uint8Array, width: number, height: number): Blob[] {
  const visited = new Uint8Array(width * height);
  const blobs: Blob[] = [];
  const minArea = Math.max(2, Math.round((width * height) * 0.00005));
  const maxArea = Math.round((width * height) * 0.01);

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || visited[start]) continue;

    // BFS flood fill
    const stack = [start];
    visited[start] = 1;
    let sumX = 0, sumY = 0, count = 0;
    let minX = width, maxX = 0, minY = height, maxY = 0;

    while (stack.length) {
      const idx = stack.pop() as number;
      const x = idx % width, y = (idx / width) | 0;
      sumX += x; sumY += y; count++;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;

      const neighbors = [idx - 1, idx + 1, idx - width, idx + width];
      for (const n of neighbors) {
        if (n < 0 || n >= mask.length || visited[n] || !mask[n]) continue;
        // avoid wrapping across row edges for the horizontal neighbors
        if ((n === idx - 1 || n === idx + 1) && ((n / width) | 0) !== y) continue;
        visited[n] = 1;
        stack.push(n);
      }
    }

    if (count < minArea || count > maxArea) continue;
    const w = maxX - minX + 1, h = maxY - minY + 1;
    const boxFill = count / (w * h);
    const aspect = w / h;
    // Roughly circular: fills a good fraction of its bounding box, not a long thin streak
    if (boxFill < 0.35 || aspect < 0.4 || aspect > 2.5) continue;

    blobs.push({ cx: sumX / count, cy: sumY / count, pixelCount: count, width: w, height: h });
  }
  return blobs;
}

interface FrameSample { tSec: number; blobs: Blob[] }

async function sampleCandidateFrames(video: HTMLVideoElement, sampleFps: number, onProgress?: (r: number) => void): Promise<{ samples: FrameSample[]; scale: number }> {
  const duration = video.duration;
  const scale = PROCESS_WIDTH / video.videoWidth;
  const width = PROCESS_WIDTH;
  const height = Math.round(video.videoHeight * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D context unavailable.");

  let sampleCount = Math.max(1, Math.ceil(duration * sampleFps));
  let effectiveFps = sampleFps;
  if (sampleCount > MAX_SAMPLES) { effectiveFps = MAX_SAMPLES / duration; sampleCount = MAX_SAMPLES; }

  let prevGray: Float32Array | null = null;
  const samples: FrameSample[] = [];

  for (let i = 0; i < sampleCount; i++) {
    const tSec = i / effectiveFps;
    await seekTo(video, Math.min(tSec, duration - 0.001));
    ctx.drawImage(video, 0, 0, width, height);
    const { data } = ctx.getImageData(0, 0, width, height);

    const gray = new Float32Array(width * height);
    for (let p = 0; p < width * height; p++) {
      const o = p * 4;
      gray[p] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
    }

    if (prevGray) {
      const motionMask = new Uint8Array(width * height);
      for (let p = 0; p < width * height; p++) {
        const diff = Math.abs(gray[p] - prevGray[p]);
        if (diff <= 18) continue; // not enough motion at this pixel
        const o = p * 4;
        if (isBallColor(data[o], data[o + 1], data[o + 2])) motionMask[p] = 1;
      }
      const blobs = findBlobs(motionMask, width, height);
      if (blobs.length > 0) samples.push({ tSec, blobs });
    }

    prevGray = gray;
    onProgress?.((i + 1) / sampleCount);
  }

  return { samples, scale };
}

/** Links per-frame blob candidates into a single trajectory via nearest-to-prediction gating. */
function linkTrajectory(samples: FrameSample[]): { tSec: number; cx: number; cy: number }[] {
  const points: { tSec: number; cx: number; cy: number }[] = [];
  let gapCount = 0;

  for (const sample of samples) {
    if (points.length === 0) {
      // Seed with the first available small, roughly-ball-sized candidate — favor smaller blobs
      // (ball, not an arm/limb sweeping through) and prefer earlier frames.
      const seed = [...sample.blobs].sort((a, b) => a.pixelCount - b.pixelCount)[0];
      points.push({ tSec: sample.tSec, cx: seed.cx, cy: seed.cy });
      continue;
    }

    const last = points[points.length - 1];
    const prev = points[points.length - 2];
    let predX = last.cx, predY = last.cy;
    if (prev) {
      const dt = last.tSec - prev.tSec || 1 / 60;
      const vx = (last.cx - prev.cx) / dt, vy = (last.cy - prev.cy) / dt;
      const dtNext = sample.tSec - last.tSec;
      predX = last.cx + vx * dtNext;
      predY = last.cy + vy * dtNext;
    }

    let best: Blob | null = null;
    let bestDist = Infinity;
    for (const blob of sample.blobs) {
      const d = Math.hypot(blob.cx - predX, blob.cy - predY);
      if (d < bestDist) { bestDist = d; best = blob; }
    }

    const gatingRadius = 60 + gapCount * 25; // widen tolerance across gaps
    if (best && bestDist <= gatingRadius) {
      points.push({ tSec: sample.tSec, cx: best.cx, cy: best.cy });
      gapCount = 0;
    } else {
      gapCount++;
      if (gapCount > MAX_GAP_FRAMES) break; // trajectory lost
    }
  }

  return points;
}

function findBounceIndex(points: { tSec: number; cx: number; cy: number }[]): number | null {
  // Bounce = the ball's lowest point in frame (max Y, image coords increase downward)
  // followed by upward motion (rebound). Fall back to the global max-Y point if no
  // clear rebound is visible (ball may be lost shortly after bouncing).
  let maxYIdx = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].cy > points[maxYIdx].cy) maxYIdx = i;
  }
  return maxYIdx > 0 && maxYIdx < points.length - 1 ? maxYIdx : (points.length > 2 ? maxYIdx : null);
}

export async function trackBall(
  videoUrl: string,
  calibration: CameraCalibration | null,
  onProgress?: (ratio: number) => void,
): Promise<BallTrackingOutput> {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = videoUrl;

  try {
    await waitForMetadata(video);
    const { samples, scale } = await sampleCandidateFrames(video, 30, onProgress);

    const empty: Omit<BallTrackingOutput, "confidence" | "note"> = { trajectory: [], bouncePoint: null, speedKmh: null, distanceFromBatsmanStumpsM: null, lengthZone: null, lineApprox: null };
    if (samples.length < MIN_TRAJECTORY_POINTS) {
      return { confidence: "none", ...empty, note: "Couldn't detect enough ball-colored moving candidates in this clip to attempt tracking." };
    }

    const linked = linkTrajectory(samples);
    if (linked.length < MIN_TRAJECTORY_POINTS) {
      return { confidence: "none", ...empty, note: "Couldn't confidently track the ball through this clip — the candidate trajectory broke up too quickly. A clearer, well-lit shot with the ball contrasting against the background improves detection." };
    }

    const trajectory: BallTrackPoint[] = linked.map((p) => ({ tSec: p.tSec, x: p.cx / scale, y: p.cy / scale }));
    const bounceIdx = findBounceIndex(linked);
    const bouncePoint = bounceIdx !== null ? trajectory[bounceIdx] : null;

    let speedKmh: number | null = null;
    let distanceFromBatsmanStumpsM: number | null = null;
    let lengthZone: PitchLengthZone | null = null;
    let lineApprox: PitchLine | null = null;

    if (calibration) {
      const axisX = calibration.point2.x - calibration.point1.x;
      const axisY = calibration.point2.y - calibration.point1.y;
      const axisLen = Math.hypot(axisX, axisY) || 1;
      const unitX = axisX / axisLen, unitY = axisY / axisLen;
      const metersPerPixel = calibration.referenceDistanceM / axisLen;

      // Speed: distance covered along the calibration axis over the first couple
      // of tracked frame-intervals — closest to release speed, before air
      // resistance decelerates the ball meaningfully.
      if (trajectory.length >= 3) {
        const p0 = trajectory[0], p1 = trajectory[Math.min(2, trajectory.length - 1)];
        const dProj = (p1.x - p0.x) * unitX + (p1.y - p0.y) * unitY;
        const distM = Math.abs(dProj) * metersPerPixel;
        const dt = p1.tSec - p0.tSec;
        if (dt > 0) speedKmh = Math.round((distM / dt) * 3.6);
      }

      // Length: distance from the bounce point to the batsman's stumps (point2),
      // projected onto the calibrated pitch-length axis.
      if (bouncePoint) {
        const toBatsmanX = calibration.point2.x - bouncePoint.x;
        const toBatsmanY = calibration.point2.y - bouncePoint.y;
        const distProj = toBatsmanX * unitX + toBatsmanY * unitY;
        distanceFromBatsmanStumpsM = Math.max(0, Math.round(distProj * metersPerPixel * 10) / 10);
        lengthZone = classifyLengthZone(distanceFromBatsmanStumpsM);

        // Line: coarse 3-way split of the bounce point's perpendicular offset from
        // the calibration axis — not a calibrated measurement, just left/center/right.
        const perpX = -unitY, perpY = unitX;
        const lateralOffset = (bouncePoint.x - calibration.point1.x) * perpX + (bouncePoint.y - calibration.point1.y) * perpY;
        const lateralThreshold = axisLen * 0.06;
        lineApprox = lateralOffset > lateralThreshold ? "Off side" : lateralOffset < -lateralThreshold ? "Leg side" : "Middle";
      }
    }

    const confidence: "high" | "low" = trajectory.length >= 10 && bouncePoint !== null && calibration !== null ? "high" : "low";
    const note = confidence === "low"
      ? "Trajectory was only partially tracked or no camera calibration is set for this angle — treat this as an indicative estimate, not a precise measurement."
      : undefined;

    return { confidence, trajectory, bouncePoint, speedKmh, distanceFromBatsmanStumpsM, lengthZone, lineApprox, note };
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
}
