import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getCaller, callerCanAccessPlayer, callerCanAccessCoach } from "@/lib/server-auth";

const BUCKET = "profile-photos";

/** Every upload path is "<entityType>/<entityId>/<timestamp>.<ext>" (see
 * lib/profile-photo-upload.ts) — entityType picks which ownership check applies, mirroring
 * app/api/storage/sign-upload's own "first path segment tells us whose prefix this is" shape,
 * just across three entity kinds instead of one. */
export async function POST(request: Request) {
  const { path } = await request.json();
  if (!path) return NextResponse.json({ error: "path required." }, { status: 400 });

  const [entityType, entityId] = String(path).split("/");
  if (!entityType || !entityId) return NextResponse.json({ error: "Invalid path." }, { status: 400 });

  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  let allowed: boolean;
  if (entityType === "player") {
    allowed = await callerCanAccessPlayer(supabase, caller, entityId);
  } else if (entityType === "coach") {
    allowed = await callerCanAccessCoach(supabase, caller, entityId);
  } else if (entityType === "academy") {
    allowed = caller.role === "platform_admin" || (caller.role === "academy_admin" && caller.academyId === entityId);
  } else {
    return NextResponse.json({ error: "Unknown entity type." }, { status: 400 });
  }
  if (!allowed) {
    return NextResponse.json({ error: "You don't have access to upload a photo here." }, { status: 403 });
  }

  // Create the bucket on first call — safe to call repeatedly, ignores "already exists" (409).
  // 5MB is well under the project's global 50MB storage cap (see sign-upload's own note on that
  // cap), so a bucket-level override here is fine, unlike session-videos.
  const { error: bucketError } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    fileSizeLimit: 5 * 1024 * 1024,
  });
  if (bucketError && bucketError.statusCode !== "409") {
    return NextResponse.json({ error: `Could not prepare storage: ${bucketError.message}` }, { status: 500 });
  }

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ signedUrl: data.signedUrl, token: data.token, path: data.path });
}
