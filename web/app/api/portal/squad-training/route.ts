import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getCaller } from "@/lib/server-auth";
import { dbToGroupSession, type DbGroupSession } from "@/lib/db";

/**
 * The player-facing Portal's "Upcoming Squad Training" card. Run server-side because
 * group_sessions' own RLS only grants read access to platform_admin, an academy_admin (their own
 * academy) or a coach (their own groups) — a player/parent has no policy on that table at all, so
 * the browser-side fetchGroupSessions() a coach uses would just come back empty for them. Scoped
 * to the groups this player is actually rostered on, via group_session_players.
 */
export async function GET() {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (caller.role !== "player" && caller.role !== "parent") {
    return NextResponse.json({ error: "Only a player or parent account can view this." }, { status: 403 });
  }
  const playerId = caller.playerId;
  if (!playerId) return NextResponse.json({ groups: [] });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: rosterRows, error: rosterError } = await supabase
    .from("group_session_players")
    .select("group_session_id")
    .eq("player_id", playerId);
  if (rosterError) return NextResponse.json({ error: rosterError.message }, { status: 500 });

  const groupIds = [...new Set((rosterRows ?? []).map((r) => r.group_session_id as string))];
  if (groupIds.length === 0) return NextResponse.json({ groups: [] });

  const { data, error } = await supabase
    .from("group_sessions")
    .select("*")
    .in("id", groupIds)
    .eq("active", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const groups = (data as DbGroupSession[]).map((g) => dbToGroupSession(g, [playerId]));
  return NextResponse.json({ groups });
}
