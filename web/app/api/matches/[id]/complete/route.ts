import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getCaller, callerCanScoreMatch } from "@/lib/server-auth";
import { computeMatchResult, recomputeCareerStatsForMatch } from "@/lib/matches";
import { dbToInnings, dbToMatch, type DbInnings, type DbMatch } from "@/lib/db";

/** Marks a match Completed, computes its result string once (never derived live — see
 * computeMatchResult), and recomputes player_career_stats for every linked participant. The one
 * step in match completion that needs a service-role client (player_career_stats is never
 * client-writable), so it's a dedicated route rather than something LiveScoringClient does
 * directly via the anon-key client the rest of its saves use. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: matchId } = await params;

  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  if (!(await callerCanScoreMatch(supabase, caller, matchId))) {
    return NextResponse.json({ error: "You don't have access to score this match." }, { status: 403 });
  }

  const { data: matchRow, error: matchError } = await supabase.from("matches").select("*").eq("id", matchId).maybeSingle();
  if (matchError) return NextResponse.json({ error: matchError.message }, { status: 500 });
  if (!matchRow) return NextResponse.json({ error: "Match not found." }, { status: 404 });
  const match = dbToMatch(matchRow as DbMatch);

  const { data: inningsRows, error: inningsError } = await supabase.from("innings").select("*").eq("match_id", matchId).order("innings_number");
  if (inningsError) return NextResponse.json({ error: inningsError.message }, { status: 500 });
  const innings = ((inningsRows ?? []) as DbInnings[]).map(dbToInnings);

  const result = computeMatchResult(innings, match.homeLabel, match.awayLabel);

  const { error: updateError } = await supabase.from("matches").update({ status: "Completed", result }).eq("id", matchId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await recomputeCareerStatsForMatch(supabase, matchId);

  return NextResponse.json({ result });
}
