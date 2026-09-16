import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getCaller, callerCanManageGroupSession } from "@/lib/server-auth";

const BUCKET = "session-videos";

export async function POST(request: Request) {
  const { groupSessionId, path } = await request.json();
  if (!groupSessionId || !path) return NextResponse.json({ error: "groupSessionId and path required." }, { status: 400 });

  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  if (!(await callerCanManageGroupSession(supabase, caller, groupSessionId))) {
    return NextResponse.json({ error: "You don't have access to upload video for this group." }, { status: 403 });
  }

  // Re-checked here even though the UI already hides the upload affordance when this is off —
  // hiding a control is never the actual gate, only a convenience; the real one is server-side.
  const { data: group } = await supabase.from("group_sessions").select("academy_id").eq("id", groupSessionId).maybeSingle();
  const { data: academy } = group
    ? await supabase.from("academies").select("squad_video_sharing_enabled").eq("id", group.academy_id).maybeSingle()
    : { data: null };
  if (!academy?.squad_video_sharing_enabled) {
    return NextResponse.json({ error: "This academy hasn't enabled Squad Video Sharing." }, { status: 403 });
  }

  // Every path under this route is namespaced "squad/..." so it can never collide with (or be
  // confused for) the 1:1 session-video paths "<playerId>/<sessionId>/<angle>.<ext>" the sibling
  // sign-upload route creates in the same bucket.
  if (!String(path).startsWith("squad/")) {
    return NextResponse.json({ error: "Invalid upload path." }, { status: 400 });
  }

  // Bucket already exists in practice (the 1:1 session-video route creates it on first use), but
  // createBucket is safe to call repeatedly — ignores "already exists" (409) — so this route
  // doesn't have to assume that's already happened.
  const { error: bucketError } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    allowedMimeTypes: ["video/mp4", "video/quicktime", "video/webm", "video/x-msvideo"],
  });
  if (bucketError && bucketError.statusCode !== "409") {
    return NextResponse.json({ error: `Could not prepare storage: ${bucketError.message}` }, { status: 500 });
  }

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ signedUrl: data.signedUrl, token: data.token, path: data.path });
}
