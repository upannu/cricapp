// Transcode + direct-to-storage upload for one camera-angle clip on a session — shared by
// NewSessionForm (coach-logged) and the Portal's self-log flow (player-logged), so both stay in
// sync on exactly how a clip gets from a browser File to a SessionVideo record.
import { createClient } from "@/lib/supabase";
import { transcodeToH264 } from "@/lib/transcode";
import type { SessionVideo } from "@/lib/types";
import type { VideoQualityResult } from "@/lib/video-quality";

// The session-videos storage bucket has no bucket-level override, so it inherits the Supabase
// project's global upload cap — 50MB on the Free plan this project is currently on. Checked
// client-side (after transcoding, which can shrink the file significantly) so a too-large clip
// fails with a clear message instead of the opaque storage-API error a raw oversized upload gets.
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

// Camera-angle metadata — identical for a coach filming a player (NewSessionForm) and a player
// filming themselves (the Portal's self-log form), so both pick from the same three angles with
// the same guidance on where to stand.
export const CAMERA_ANGLES = [
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

export type AngleId = "front" | "side" | "back";
export type AngleStatus = "idle" | "checking" | "invalid" | "ready" | "transcoding" | "uploading" | "done" | "error";

export interface AngleState {
  file: File | null;
  status: AngleStatus;
  quality?: VideoQualityResult;
  error?: string;
  progress?: number; // transcode progress, 0–1
}

export const EMPTY_ANGLE: AngleState = { file: null, status: "idle" };

export interface UploadSessionVideoParams {
  file: File;
  playerId: string;
  sessionId: string;
  angle: "front" | "side" | "back";
  quality?: VideoQualityResult;
  onTranscodeProgress?: (ratio: number) => void;
}

/**
 * Transcodes one clip to H.264 client-side — falling back to the original file if transcoding
 * fails (e.g. out of memory on a low-end device), rather than blocking the whole session save —
 * then uploads it directly to Supabase Storage via a signed URL (bypassing Vercel's own request
 * size limits) and returns the SessionVideo record to save on the session. Throws on any failure;
 * the caller is expected to catch it and surface `Upload failed (<angle>): <message>` or similar.
 */
export async function uploadSessionVideo({
  file, playerId, sessionId, angle, quality, onTranscodeProgress,
}: UploadSessionVideoParams): Promise<SessionVideo> {
  const supabase = createClient();

  let uploadFile: File = file;
  let transcoded = false;
  try {
    uploadFile = await transcodeToH264(file, (ratio) => onTranscodeProgress?.(ratio));
    transcoded = true;
  } catch (transcodeErr) {
    console.warn(`Transcode failed for ${angle}, uploading original file instead`, transcodeErr);
  }

  if (uploadFile.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `${(uploadFile.size / (1024 * 1024)).toFixed(1)}MB exceeds the 50MB upload limit — trim the clip or record a shorter delivery.`,
    );
  }

  const ext = transcoded ? "mp4" : (file.name.split(".").pop() ?? "mp4");
  const path = `${playerId}/${sessionId}/${angle}.${ext}`;

  const signRes = await fetch("/api/storage/sign-upload", {
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

  return {
    angle, label: file.name, url: publicUrl,
    width: quality?.width, height: quality?.height,
    durationSec: quality?.durationSec, fps: quality?.fps ?? null,
    transcoded,
  };
}
