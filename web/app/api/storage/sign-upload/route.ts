import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const BUCKET = "session-videos";

export async function POST(request: Request) {
  const { path } = await request.json();
  if (!path) return NextResponse.json({ error: "path required." }, { status: 400 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Create the bucket on first call — safe to call repeatedly, ignores "already exists"
  await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 524288000, // 500 MB
    allowedMimeTypes: ["video/mp4", "video/quicktime", "video/webm", "video/x-msvideo"],
  });

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ signedUrl: data.signedUrl, token: data.token, path: data.path });
}
