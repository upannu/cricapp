import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getCaller, callerCanAccessPlayer } from "@/lib/server-auth";

const BUCKET = "session-videos";

export async function POST(request: Request) {
  const { path } = await request.json();
  if (!path) return NextResponse.json({ error: "path required." }, { status: 400 });

  // Every upload path is "<playerId>/<sessionId>/<angle>.<ext>" (see NewSessionForm.tsx) —
  // the first segment tells us whose storage prefix this write is targeting.
  const targetPlayerId = String(path).split("/")[0];
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  if (!targetPlayerId || !(await callerCanAccessPlayer(supabase, caller, targetPlayerId))) {
    return NextResponse.json({ error: "You don't have access to upload for this player." }, { status: 403 });
  }

  // Create the bucket on first call — safe to call repeatedly, ignores "already exists" (409).
  // No fileSizeLimit override: the project's own global storage cap (52428800 bytes / 50MB on
  // the Free plan) is lower than video files often need, and requesting a bucket-level limit
  // higher than that global cap makes bucket creation itself fail (previously silent — the
  // bucket was then never created, and every upload failed downstream with an opaque
  // "related resource does not exist" instead of a clear error here).
  const { error: bucketError } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    allowedMimeTypes: ["video/mp4", "video/quicktime", "video/webm", "video/x-msvideo"],
  });
  if (bucketError && bucketError.statusCode !== "409") {
    return NextResponse.json({ error: `Could not prepare storage: ${bucketError.message}` }, { status: 500 });
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ signedUrl: data.signedUrl, token: data.token, path: data.path });
}
