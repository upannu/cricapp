import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getCaller, callerCanAccessPlayer } from "@/lib/server-auth";

const REVIEW_STATUSES = ["not_reviewed", "under_review", "completed"];

export async function POST(request: Request) {
  const { reportId, playerId, reviewStatus, summary, highlight } = (await request.json()) as {
    reportId?: string; playerId?: string; reviewStatus?: string; summary?: string; highlight?: string;
  };
  if (!reportId || !playerId || !reviewStatus) {
    return NextResponse.json({ error: "reportId, playerId, and reviewStatus are required." }, { status: 400 });
  }
  if (!REVIEW_STATUSES.includes(reviewStatus)) {
    return NextResponse.json({ error: "Invalid reviewStatus." }, { status: 400 });
  }

  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!["coach", "academy_admin", "platform_admin"].includes(caller.role ?? "")) {
    return NextResponse.json({ error: "Only coaches can review reports." }, { status: 403 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  if (!(await callerCanAccessPlayer(supabase, caller, playerId))) {
    return NextResponse.json({ error: "You don't have access to this player's reports." }, { status: 403 });
  }

  const update: Record<string, unknown> = {
    review_status: reviewStatus,
    reviewed_at: new Date().toISOString(),
    reviewed_by: caller.userId,
  };
  if (summary !== undefined) update.summary = summary;
  if (highlight !== undefined) update.highlight = highlight;

  const { error } = await supabase.from("reports").update(update).eq("id", reportId).eq("player_id", playerId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
