import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getCaller } from "@/lib/server-auth";
import { fetchGameSummary, mapGameSummaryToImport, PlayHQApiError, type PlayHQPlayerLink } from "@/lib/playhq";
import { importMatchFromPlayHQ } from "@/lib/matches";
import type { MatchFormat } from "@/lib/types";

const VALID_FORMATS: MatchFormat[] = ["T20", "One Day", "Two-Day", "Limited Overs (Other)"];

/** Imports one PlayHQ game as a completed Match + imported_match_stats rows (see
 * lib/matches.ts's importMatchFromPlayHQ for why this writes no match_participants). format/
 * venue/scheduledDate are supplied by the import UI (pre-filled from the PlayHQ game the admin
 * picked, editable) rather than inferred from PlayHQ's grade name, which isn't reliable enough
 * to parse automatically for Phase 1. */
export async function POST(request: Request) {
  const body = (await request.json()) as {
    academyId?: string; gameId?: string; format?: MatchFormat; oversPerSide?: number | null;
    venue?: string; scheduledDate?: string; playerLinks?: PlayHQPlayerLink[];
  };
  const { academyId, gameId, format, venue, scheduledDate } = body;
  if (!academyId || !gameId || !format || !venue?.trim() || !scheduledDate) {
    return NextResponse.json({ error: "academyId, gameId, format, venue and scheduledDate are required." }, { status: 400 });
  }
  if (!VALID_FORMATS.includes(format)) {
    return NextResponse.json({ error: "Invalid format." }, { status: 400 });
  }

  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const canManage = caller.role === "platform_admin" || (caller.role === "academy_admin" && caller.academyId === academyId);
  if (!canManage) {
    return NextResponse.json({ error: "You don't have access to import matches for this academy." }, { status: 403 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: existing, error: existingError } = await supabase
    .from("matches").select("id").eq("playhq_game_id", gameId).maybeSingle();
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (existing) return NextResponse.json({ error: "This game has already been imported." }, { status: 409 });

  let mapped;
  try {
    const summary = await fetchGameSummary(gameId);
    mapped = mapGameSummaryToImport(summary, body.playerLinks ?? []);
  } catch (err) {
    const message = err instanceof PlayHQApiError ? err.message : "Could not fetch that game from PlayHQ.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const match = await importMatchFromPlayHQ(supabase, {
    homeAcademyId: academyId, format, oversPerSide: body.oversPerSide ?? null,
    venue: venue.trim(), scheduledDate, createdByUserId: caller.userId,
    playhqGameId: gameId, mapped,
  });

  return NextResponse.json({ match });
}
