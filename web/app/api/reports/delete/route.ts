import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const PDF_BUCKET = "session-reports";

export async function POST(request: Request) {
  const { reportId, playerId } = (await request.json()) as { reportId?: string; playerId?: string };
  if (!reportId || !playerId) {
    return NextResponse.json({ error: "reportId and playerId are required." }, { status: 400 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Best-effort: remove the PDF if one was generated for this report
  await supabase.storage.from(PDF_BUCKET).remove([`${playerId}/${reportId}.pdf`]);

  const { error } = await supabase.from("reports").delete().eq("id", reportId);
  if (error) {
    return NextResponse.json({ error: `Could not delete report: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
