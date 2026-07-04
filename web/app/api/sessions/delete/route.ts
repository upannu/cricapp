import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const VIDEO_BUCKET = "session-videos";
const PDF_BUCKET = "session-reports";

export async function POST(request: Request) {
  const { sessionId, playerId } = (await request.json()) as { sessionId?: string; playerId?: string };
  if (!sessionId || !playerId) {
    return NextResponse.json({ error: "sessionId and playerId are required." }, { status: 400 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Remove any uploaded videos for this session from storage first
  const prefix = `${playerId}/${sessionId}`;
  const { data: files, error: listError } = await supabase.storage.from(VIDEO_BUCKET).list(prefix);
  if (listError) {
    return NextResponse.json({ error: `Could not list session videos: ${listError.message}` }, { status: 500 });
  }
  if (files && files.length > 0) {
    const paths = files.map((f) => `${prefix}/${f.name}`);
    const { error: removeError } = await supabase.storage.from(VIDEO_BUCKET).remove(paths);
    if (removeError) {
      return NextResponse.json({ error: `Could not delete videos: ${removeError.message}` }, { status: 500 });
    }
  }

  // Remove any AI reports generated from this session, and their PDFs
  const { data: reports, error: reportsError } = await supabase
    .from("reports")
    .select("id")
    .eq("session_id", sessionId);
  if (reportsError) {
    return NextResponse.json({ error: `Could not look up reports: ${reportsError.message}` }, { status: 500 });
  }
  if (reports && reports.length > 0) {
    const pdfPaths = reports.map((r) => `${playerId}/${r.id}.pdf`);
    await supabase.storage.from(PDF_BUCKET).remove(pdfPaths);
    const { error: deleteReportsError } = await supabase.from("reports").delete().eq("session_id", sessionId);
    if (deleteReportsError) {
      return NextResponse.json({ error: `Could not delete reports: ${deleteReportsError.message}` }, { status: 500 });
    }
  }

  const { error: deleteError } = await supabase.from("sessions").delete().eq("id", sessionId);
  if (deleteError) {
    return NextResponse.json({ error: `Could not delete session: ${deleteError.message}` }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
