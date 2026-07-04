// Client-side transcoding via ffmpeg.wasm — normalizes every uploaded video to
// H.264 MP4 (capped at 1080p) before it ever reaches Supabase Storage, so
// playback is consistent across browsers/devices regardless of the source
// camera's codec/container (HEVC .mov, weird Android containers, etc).
//
// The ~32MB wasm core is self-hosted at /ffmpeg (see scripts/copy-ffmpeg-core.js)
// and lazy-loaded only when a transcode is actually requested.

import type { FFmpeg } from "@ffmpeg/ffmpeg";

let ffmpegPromise: Promise<FFmpeg> | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const { toBlobURL } = await import("@ffmpeg/util");
      const ffmpeg = new FFmpeg();
      const baseURL = "/ffmpeg";
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
      });
      return ffmpeg;
    })().catch((err) => {
      ffmpegPromise = null; // allow retry on next call instead of caching a failed load
      throw err;
    });
  }
  return ffmpegPromise;
}

function extOf(filename: string): string {
  const match = /\.[^.]+$/.exec(filename);
  return match ? match[0] : ".mp4";
}

export async function transcodeToH264(
  file: File,
  onProgress?: (ratio: number) => void,
): Promise<File> {
  const { fetchFile } = await import("@ffmpeg/util");
  const ffmpeg = await getFFmpeg();

  const inName = `in_${Date.now()}${extOf(file.name)}`;
  const outName = `out_${Date.now()}.mp4`;

  const onFFmpegProgress = ({ progress }: { progress: number }) => {
    onProgress?.(Math.min(1, Math.max(0, progress)));
  };
  ffmpeg.on("progress", onFFmpegProgress);

  try {
    await ffmpeg.writeFile(inName, await fetchFile(file));
    await ffmpeg.exec([
      "-i", inName,
      "-vf", "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "23",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      outName,
    ]);

    const data = await ffmpeg.readFile(outName);
    const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(data as string);
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "video/mp4" });
    const newName = file.name.replace(/\.[^.]+$/, "") + ".mp4";
    return new File([blob], newName, { type: "video/mp4" });
  } finally {
    ffmpeg.off("progress", onFFmpegProgress);
    await ffmpeg.deleteFile(inName).catch(() => {});
    await ffmpeg.deleteFile(outName).catch(() => {});
  }
}
