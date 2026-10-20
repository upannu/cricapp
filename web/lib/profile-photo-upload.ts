// Direct-to-storage photo upload for a Player/Coach/Academy profile — same signed-URL shape as
// lib/session-video-upload.ts, just simpler (no transcoding, images only).
import { createClient } from "@/lib/supabase";

export const MAX_PHOTO_UPLOAD_BYTES = 5 * 1024 * 1024;
export type ProfilePhotoEntityType = "player" | "coach" | "academy";

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
};

export interface UploadProfilePhotoParams {
  file: File;
  entityType: ProfilePhotoEntityType;
  entityId: string;
}

/**
 * Uploads a photo directly to Supabase Storage via a signed URL and returns its public URL.
 * Throws on any failure (wrong file type, too large, not authorized, upload error) — the caller
 * is expected to catch it and surface the message.
 */
export async function uploadProfilePhoto({ file, entityType, entityId }: UploadProfilePhotoParams): Promise<string> {
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    throw new Error("Photos must be a JPEG, PNG, or WebP image.");
  }
  if (file.size > MAX_PHOTO_UPLOAD_BYTES) {
    throw new Error(`${(file.size / (1024 * 1024)).toFixed(1)}MB exceeds the 5MB photo upload limit.`);
  }

  const supabase = createClient();
  // Timestamped filename, not a fixed one — avoids CDN/browser caching the previous photo at the
  // same path after a re-upload, and sidesteps needing to parse entityId back out of a filename
  // that could itself contain hyphens (ids aren't guaranteed to be hyphen-free).
  const path = `${entityType}/${entityId}/${Date.now()}.${ext}`;

  const signRes = await fetch("/api/storage/sign-photo-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  const signData = await signRes.json();
  if (signData.error) throw new Error(signData.error);

  const { error: uploadError } = await supabase.storage
    .from("profile-photos")
    .uploadToSignedUrl(path, signData.token, file, { contentType: file.type });
  if (uploadError) throw uploadError;

  const { data: { publicUrl } } = supabase.storage.from("profile-photos").getPublicUrl(path);
  return publicUrl;
}
