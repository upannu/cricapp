// In-browser quality check for session video uploads. Resolution/duration are
// read from <video> metadata (instant, reliable everywhere). FPS has no direct
// browser API — it's estimated by briefly playing the clip and counting frames
// via requestVideoFrameCallback, which isn't supported everywhere.
//
// Neither check blocks the upload: coaches often receive footage via WhatsApp
// or similar apps that aggressively downscale video regardless of source
// quality, so a hard resolution floor would reject a lot of genuinely useful
// coaching footage. Both are surfaced as warnings instead.

export const MIN_LONG_EDGE_PX = 1920;
export const MIN_SHORT_EDGE_PX = 1080;
export const MIN_FPS = 50; // target is 60fps; allow measurement jitter (e.g. 59.94fps sources)
const FPS_SAMPLE_WINDOW_SEC = 0.75;
const FPS_MEASURE_TIMEOUT_MS = 3000;

export interface VideoQualityResult {
  width: number;
  height: number;
  durationSec: number;
  fps: number | null; // null when it couldn't be measured (unsupported browser, etc.)
  meetsResolution: boolean;
  meetsFps: boolean | null; // null when fps is unmeasured — treat as "unknown", not a failure
}

export async function probeVideoQuality(file: File): Promise<VideoQualityResult> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;

  try {
    await waitForMetadata(video);
    const width = video.videoWidth;
    const height = video.videoHeight;
    const durationSec = video.duration;
    const longEdge = Math.max(width, height);
    const shortEdge = Math.min(width, height);
    const meetsResolution = longEdge >= MIN_LONG_EDGE_PX && shortEdge >= MIN_SHORT_EDGE_PX;

    const fps = await measureFps(video).catch(() => null);
    const meetsFps = fps === null ? null : fps >= MIN_FPS;

    return { width, height, durationSec, fps, meetsResolution, meetsFps };
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    video.addEventListener("loadedmetadata", () => resolve(), { once: true });
    video.addEventListener("error", () => reject(new Error("Could not read video metadata — file may be corrupt or an unsupported format.")), { once: true });
  });
}

interface VideoFrameCallbackMetadata { mediaTime: number }
type RVFCVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, metadata: VideoFrameCallbackMetadata) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

function measureFps(video: HTMLVideoElement): Promise<number | null> {
  const rvfcVideo = video as RVFCVideo;
  if (typeof rvfcVideo.requestVideoFrameCallback !== "function") {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let settled = false;
    let frameCount = 0;
    let startMediaTime: number | null = null;
    let handle: number | undefined;

    const finish = (fps: number | null) => {
      if (settled) return;
      settled = true;
      if (handle !== undefined) rvfcVideo.cancelVideoFrameCallback?.(handle);
      clearTimeout(timeoutId);
      resolve(fps);
    };

    const timeoutId = setTimeout(() => finish(null), FPS_MEASURE_TIMEOUT_MS);

    const onFrame = (_now: number, metadata: VideoFrameCallbackMetadata) => {
      frameCount++;
      if (startMediaTime === null) startMediaTime = metadata.mediaTime;
      const elapsed = metadata.mediaTime - startMediaTime;
      if (elapsed >= FPS_SAMPLE_WINDOW_SEC && frameCount > 1) {
        finish(Math.round((frameCount - 1) / elapsed));
      } else {
        handle = rvfcVideo.requestVideoFrameCallback?.(onFrame);
      }
    };

    handle = rvfcVideo.requestVideoFrameCallback?.(onFrame);
    video.play().catch(() => finish(null));
  });
}
