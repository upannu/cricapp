"use client";

import { useRef, useState } from "react";
import { uploadProfilePhoto, type ProfilePhotoEntityType } from "@/lib/profile-photo-upload";

interface ProfilePhotoUploadProps {
  entityType: ProfilePhotoEntityType;
  entityId: string;
  photoUrl: string | null | undefined;
  /** Shown instead of a photo when none is set — player/coach initials, or an academy's first letter. */
  fallback: string;
  canEdit: boolean;
  onUploaded: (url: string) => void;
  /** Tailwind size classes for the circle — defaults to the w-20 h-20 avatar size used across the
   * Player/Coach/Academy profile headers. */
  sizeClassName?: string;
}

/** Shared avatar + upload control for Player/Coach/Academy profile headers — one place for the
 * upload flow (see lib/profile-photo-upload.ts) so all three don't duplicate it. Clicking the
 * small pencil button opens a file picker; the photo swaps in optimistically once uploaded, and
 * the caller (onUploaded) is responsible for persisting the URL to the entity's own row via its
 * existing update function (updatePlayer/updateCoachFields/updateAcademyFields). */
export function ProfilePhotoUpload({
  entityType, entityId, photoUrl, fallback, canEdit, onUploaded, sizeClassName = "w-20 h-20",
}: ProfilePhotoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(file: File) {
    setError("");
    setUploading(true);
    try {
      const url = await uploadProfilePhoto({ file, entityType, entityId });
      onUploaded(url);
    } catch (err) {
      setError((err as { message?: string })?.message ?? String(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="relative flex-shrink-0">
      <div className={`${sizeClassName} rounded-full bg-hp-cg flex items-center justify-center text-hp-paper font-bold text-2xl overflow-hidden`}>
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- dynamic Supabase Storage URL, next/image is overkill here
          <img src={photoUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          fallback
        )}
      </div>
      {canEdit && (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            aria-label="Change photo"
            className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-hp-ink border border-white/20 flex items-center justify-center text-hp-paper/70 hover:text-hp-paper hover:border-white/40 transition-colors disabled:opacity-50"
          >
            {uploading ? "…" : "✎"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) handleFile(file);
            }}
          />
        </>
      )}
      {error && (
        <p className="absolute top-full mt-1 left-0 text-red-400 text-xs whitespace-nowrap z-10">{error}</p>
      )}
    </div>
  );
}
