import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { DAY_TOKENS, sydneyNowParts } from "@/lib/cron-time";

function serviceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** A pack's agreed days are a commitment, not an attendance record — the slot is booked and paid
 * for whether or not the player actually turns up, or even gets added to that day's roster at
 * all. Runs once daily, late in the Sydney day (after any session that day would have already
 * happened), and for every active pack whose agreed_days includes today: finds the specific
 * recurring group session the player is rostered on (same resolution as session-reminders), and —
 * only if nobody already recorded attendance for that occurrence — records it automatically
 * (status "Absent", since we don't actually know) and draws down one session. Reusing
 * attendance_records itself as the idempotency check means a coach marking real attendance later
 * that day, or this cron running twice, can never double-count the same slot — same deterministic
 * row id saveAttendance itself already uses (lib/db.ts). */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Not configured — set CRON_SECRET." }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = serviceClient();
  const now = new Date();
  const todayIso = sydneyNowParts(now).dateIso;
  const todayDow = new Date(`${todayIso}T00:00:00Z`).getUTCDay(); // 0=Sun..6=Sat, matches group_sessions.day_of_week
  const todayToken = DAY_TOKENS[todayDow];

  const { data: packs, error: packsError } = await supabase
    .from("session_packs")
    .select("id, player_id, academy_id, session_type, agreed_days, sessions_used, total_sessions")
    .eq("status", "Active");
  if (packsError) return NextResponse.json({ error: packsError.message }, { status: 500 });

  const results: Array<{ playerId: string; groupSessionId: string; action: string }> = [];

  for (const pk of packs ?? []) {
    if (!(pk.agreed_days ?? []).includes(todayToken)) continue;

    // Find the group session this player is actually rostered on, matching academy/type/day —
    // identical resolution to session-reminders' own (see api/cron/session-reminders/route.ts).
    const { data: rosterRows } = await supabase
      .from("group_session_players")
      .select("group_session_id")
      .eq("player_id", pk.player_id);
    const candidateIds = (rosterRows ?? []).map((r) => r.group_session_id);
    if (candidateIds.length === 0) continue;

    const { data: group } = await supabase
      .from("group_sessions")
      .select("id")
      .in("id", candidateIds)
      .eq("academy_id", pk.academy_id)
      .eq("session_type", pk.session_type)
      .eq("day_of_week", todayDow)
      .eq("active", true)
      .maybeSingle();
    if (!group) continue;

    let occurrenceId: string;
    const { data: existingOcc } = await supabase
      .from("group_session_occurrences")
      .select("id")
      .eq("group_session_id", group.id)
      .eq("date", todayIso)
      .maybeSingle();
    if (existingOcc) {
      occurrenceId = existingOcc.id;
    } else {
      occurrenceId = `gso_${group.id}_${todayIso}`;
      const { error: occError } = await supabase
        .from("group_session_occurrences")
        .insert({ id: occurrenceId, group_session_id: group.id, date: todayIso });
      if (occError) continue; // best-effort — will retry next run
    }

    // Already recorded today, whether by a coach's own hand or an earlier run of this cron —
    // never touch it again.
    const { data: existingRecord } = await supabase
      .from("attendance_records")
      .select("id")
      .eq("occurrence_id", occurrenceId)
      .eq("player_id", pk.player_id)
      .maybeSingle();
    if (existingRecord) continue;

    const hasRoom = pk.sessions_used < pk.total_sessions;
    if (hasRoom) {
      await supabase.from("session_packs").update({ sessions_used: pk.sessions_used + 1 }).eq("id", pk.id);
    }

    const recordId = `att_${occurrenceId}_${pk.player_id}`;
    const { error: attError } = await supabase.from("attendance_records").upsert({
      id: recordId, occurrence_id: occurrenceId, player_id: pk.player_id,
      status: "Absent", pack_id: hasRoom ? pk.id : null,
    });
    if (attError) continue;

    results.push({ playerId: pk.player_id, groupSessionId: group.id, action: hasRoom ? "consumed" : "recorded_no_room" });
  }

  return NextResponse.json({ success: true, processed: (packs ?? []).length, results });
}
