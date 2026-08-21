import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { sendSms } from "@/lib/sms";

/** How many hours before a session starts the reminder fires. A single constant rather than a
 * settings-UI field — cheap to retune here later. */
const LEAD_HOURS = 3;

/** Every academy on the platform is Australian, but the deployed server's own clock is not
 * guaranteed to be — Vercel/Hostinger containers commonly default to UTC regardless of where the
 * app is used. Session times are entered by staff in local Sydney time with no stored timezone,
 * so "today" and "hours until session start" are computed against Australia/Sydney explicitly
 * rather than trusting the server process's own timezone (which this exact class of bug already
 * bit the payment-reminder cron's own testing once). */
const ACADEMY_TZ = "Australia/Sydney";
const DAY_TOKENS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function sydneyNowParts(now: Date) {
  const fmt = new Intl.DateTimeFormat("en-AU", {
    timeZone: ACADEMY_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    dateIso: `${get("year")}-${get("month")}-${get("day")}`,
    hour: get("hour"), minute: get("minute"), second: get("second"),
  };
}

/** The UTC offset (ms) Sydney is currently sitting at — varies AEST/AEDT across the year, so this
 * is computed live rather than hardcoded. */
function sydneyOffsetMs(now: Date): number {
  const p = sydneyNowParts(now);
  const asIfUtc = new Date(`${p.dateIso}T${p.hour}:${p.minute}:${p.second}Z`);
  return asIfUtc.getTime() - now.getTime();
}

/** Converts a Sydney-local "HH:mm" on a given Sydney-local date into the real UTC instant it
 * represents, correctly accounting for daylight saving on that specific date. */
function sydneyLocalToInstant(dateIso: string, hhmm: string, offsetMs: number): Date {
  const asIfUtc = new Date(`${dateIso}T${hhmm}:00Z`);
  return new Date(asIfUtc.getTime() - offsetMs);
}

function serviceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

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
  const offsetMs = sydneyOffsetMs(now);
  const todayIso = sydneyNowParts(now).dateIso;
  // Day-of-week is a property of the calendar date itself, not of an instant, so this is safe to
  // derive from the date-only string regardless of server timezone.
  const todayDow = new Date(`${todayIso}T00:00:00Z`).getUTCDay(); // 0=Sun..6=Sat, matches group_sessions.day_of_week
  const todayToken = DAY_TOKENS[todayDow]; // "Mon".."Sun" — same tokens session_packs.agreed_days uses

  const { data: packs, error: packsError } = await supabase
    .from("session_packs")
    .select("id, player_id, academy_id, session_type, agreed_days")
    .eq("status", "Active");
  if (packsError) return NextResponse.json({ error: packsError.message }, { status: 500 });

  const results: Array<{ playerId: string; groupSessionId: string; action: string }> = [];

  for (const pk of packs ?? []) {
    if (!(pk.agreed_days ?? []).includes(todayToken)) continue;

    // Find the group session this player is actually rostered on, matching academy/type/day.
    const { data: rosterRows } = await supabase
      .from("group_session_players")
      .select("group_session_id")
      .eq("player_id", pk.player_id);
    const candidateIds = (rosterRows ?? []).map((r) => r.group_session_id);
    if (candidateIds.length === 0) continue;

    const { data: group } = await supabase
      .from("group_sessions")
      .select("id, name, session_type, day_of_week, time, location, active")
      .in("id", candidateIds)
      .eq("academy_id", pk.academy_id)
      .eq("session_type", pk.session_type)
      .eq("day_of_week", todayDow)
      .eq("active", true)
      .maybeSingle();
    if (!group) continue;

    const sessionStart = sydneyLocalToInstant(todayIso, group.time, offsetMs);
    const hoursUntil = (sessionStart.getTime() - now.getTime()) / 3600000;
    if (hoursUntil < 0 || hoursUntil > LEAD_HOURS) continue;

    const { data: alreadySent } = await supabase
      .from("session_reminder_log")
      .select("id")
      .eq("player_id", pk.player_id)
      .eq("group_session_id", group.id)
      .eq("session_date", todayIso)
      .maybeSingle();
    if (alreadySent) continue;

    const { data: player } = await supabase
      .from("players")
      .select("id, name, phone")
      .eq("id", pk.player_id)
      .single();
    if (!player?.phone) continue;

    try {
      await sendSms(
        player.phone,
        `Hi ${player.name}, reminder: your ${group.session_type} session is today at ${group.time}, ${group.location || "check with your coach for the venue"}. — CRIC HQ`,
      );
      await supabase.from("session_reminder_log").insert({
        id: `srl_${pk.player_id}_${group.id}_${todayIso}`,
        player_id: pk.player_id,
        group_session_id: group.id,
        session_date: todayIso,
      });
      results.push({ playerId: pk.player_id, groupSessionId: group.id, action: "reminder_sent" });
    } catch {
      // best-effort — will retry on the next cron tick since the log row was never written
    }
  }

  return NextResponse.json({ success: true, processed: (packs ?? []).length, results });
}
