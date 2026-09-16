// Transcode + direct-to-storage upload for one Squad Training video — the group-session sibling
// of lib/session-video-upload.ts. Shares its bucket ("session-videos"), transcode step, and
// signed-upload approach, but posts to its own API route (sign-group-video-upload) since
// authorization here is "does this caller manage this group session", not "does this caller
// manage this player" — and since a squad video covers a whole roster, not one player, the two
// checks genuinely can't share a route.
import { createClient } from "@/lib/supabase";
import { transcodeToH264 } from "@/lib/transcode";
import { MAX_UPLOAD_BYTES } from "@/lib/session-video-upload";

export interface UploadGroupSessionVideoParams {
  file: File;
  groupSessionId: string;
  date: string;
  onTranscodeProgress?: (ratio: number) => void;
}

export interface UploadedGroupSessionVideo {
  videoUrl: string;
  durationSec: number | null;
  width: number | null;
  height: number | null;
}

export async function uploadGroupSessionVideo({
  file, groupSessionId, date, onTranscodeProgress,
}: UploadGroupSessionVideoParams): Promise<UploadedGroupSessionVideo> {
  const supabase = createClient();

  let uploadFile: File = file;
  let transcoded = false;
  try {
    uploadFile = await transcodeToH264(file, (ratio) => onTranscodeProgress?.(ratio));
    transcoded = true;
  } catch (transcodeErr) {
    console.warn("Transcode failed for squad video, uploading original file instead", transcodeErr);
  }

  if (uploadFile.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `${(uploadFile.size / (1024 * 1024)).toFixed(1)}MB exceeds the 50MB upload limit — trim the clip or record a shorter one.`,
    );
  }

  const ext = transcoded ? "mp4" : (file.name.split(".").pop() ?? "mp4");
  const path = `squad/${groupSessionId}/${date}/${Date.now()}.${ext}`;

  const signRes = await fetch("/api/storage/sign-group-video-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ groupSessionId, path }),
  });
  const signData = await signRes.json();
  if (signData.error) throw new Error(signData.error);

  const { error: uploadError } = await supabase.storage
    .from("session-videos")
    .uploadToSignedUrl(path, signData.token, uploadFile, { contentType: uploadFile.type });
  if (uploadError) throw uploadError;

  const { data: { publicUrl } } = supabase.storage.from("session-videos").getPublicUrl(path);

  const dimensions = await readVideoDimensions(uploadFile).catch(() => null);

  return {
    videoUrl: publicUrl,
    durationSec: dimensions?.durationSec ?? null,
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null,
  };
}

function readVideoDimensions(file: File): Promise<{ durationSec: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      resolve({ durationSec: video.duration, width: video.videoWidth, height: video.videoHeight });
      URL.revokeObjectURL(video.src);
    };
    video.onerror = () => reject(new Error("Could not read video metadata."));
    video.src = URL.createObjectURL(file);
  });
}
