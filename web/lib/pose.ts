// Client-side pose estimation via MediaPipe Tasks Vision — tracks 33 body
// keypoints frame-by-frame through a bowling delivery video. This is the
// actual measurement layer: everything in lib/biomechanics.ts (joint angles,
// phase detection, zone scores) is computed from these landmark trajectories,
// not guessed by an LLM looking at a couple of still frames.
//
// Wasm runtime + model are self-hosted under /public/mediapipe (see
// scripts/setup-pose-assets.js) rather than fetched from a CDN.

import type { PoseLandmarker as PoseLandmarkerType, NormalizedLandmark, Landmark } from "@mediapipe/tasks-vision";

export type { NormalizedLandmark, Landmark };

export interface PoseFrame {
  tSec: number;
  /** Normalized image-space coordinates (0..1) — for drawing the skeleton overlay. */
  landmarks: NormalizedLandmark[];
  /** Metric-scale 3D coordinates, hip-centered — for angle/geometry math (camera-distance invariant). */
  worldLandmarks: Landmark[];
}

const DEFAULT_SAMPLE_FPS = 24;
const MAX_SAMPLES = 240; // bounds processing time regardless of clip length

let landmarkerPromise: Promise<PoseLandmarkerType> | null = null;

async function getPoseLandmarker(): Promise<PoseLandmarkerType> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
      const baseOptions = { modelAssetPath: "/mediapipe/pose_landmarker_full.task" };
      try {
        return await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { ...baseOptions, delegate: "GPU" },
          runningMode: "VIDEO",
          numPoses: 1,
        });
      } catch {
        // GPU delegate can fail on older/unusual hardware — CPU always works, just slower.
        return await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { ...baseOptions, delegate: "CPU" },
          runningMode: "VIDEO",
          numPoses: 1,
        });
      }
    })().catch((err) => {
      landmarkerPromise = null;
      throw err;
    });
  }
  return landmarkerPromise;
}

function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    video.addEventListener("loadedmetadata", () => resolve(), { once: true });
    video.addEventListener("error", () => reject(new Error("Could not load video for pose analysis.")), { once: true });
  });
}

function seekTo(video: HTMLVideoElement, tSec: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => { video.removeEventListener("seeked", onSeeked); resolve(); };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = tSec;
  });
}

export interface ExtractPoseOptions {
  sampleFps?: number;
  onProgress?: (ratio: number) => void;
}

/**
 * Samples a video at a fixed rate and runs pose estimation on each frame.
 * Returns one entry per successfully-detected frame (frames where no person
 * was confidently detected are skipped, not padded with fake data).
 */
export async function extractPoseSequence(videoUrl: string, opts: ExtractPoseOptions = {}): Promise<PoseFrame[]> {
  const landmarker = await getPoseLandmarker();

  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = videoUrl;

  try {
    await waitForMetadata(video);
    const duration = video.duration;
    let sampleFps = opts.sampleFps ?? DEFAULT_SAMPLE_FPS;
    let sampleCount = Math.max(1, Math.ceil(duration * sampleFps));
    if (sampleCount > MAX_SAMPLES) {
      sampleFps = MAX_SAMPLES / duration;
      sampleCount = MAX_SAMPLES;
    }

    const frames: PoseFrame[] = [];
    for (let i = 0; i < sampleCount; i++) {
      const tSec = i / sampleFps;
      await seekTo(video, Math.min(tSec, duration - 0.001));
      const result = landmarker.detectForVideo(video, performance.now());
      const landmarks = result.landmarks?.[0];
      const worldLandmarks = result.worldLandmarks?.[0];
      if (landmarks && worldLandmarks) {
        frames.push({ tSec, landmarks, worldLandmarks });
      }
      opts.onProgress?.((i + 1) / sampleCount);
    }
    return frames;
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
}
