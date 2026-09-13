import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getCaller } from "@/lib/server-auth";
import { selfLogSessionsLimitForPlan } from "@/lib/plan-features";
import { dbToPlan, type DbPlan } from "@/lib/db";
import type { BookingType, PlanTier } from "@/lib/types";

const BOOKING_TYPES: BookingType[] = [
  "Net Session", "Individual Coaching", "Video Review",
  "Fitness Assessment", "Match Practice", "Warm-up / Conditioning",
];

interface VideoInput {
  angle?: string; label?: string; url?: string;
  width?: number; height?: number; durationSec?: number; fps?: number | null; transcoded?: boolean;
}

/**
 * A player logging their own session with no coach involved — the self-serve path for an
 * independent player whose Player Pro subscription otherwise has no way to actually get used
 * (only a coach can normally create a session; an independent player has none). Unlike every
 * coach-logged session, this one is capped by selfLogSessionsLimitForPlan, which — deliberately,
 * see its own doc comment — never resolves to "unlimited": a self-logged session has no coach
 * naturally rate-limiting it the way a real one does.
 */
export async function POST(request: Request) {
  const { date, type, notes, rpe, videos } = (await request.json()) as {
    date?: string; type?: string; notes?: string; rpe?: number | null; videos?: VideoInput[];
  };

  if (!date || !type || !BOOKING_TYPES.includes(type as BookingType)) {
    return NextResponse.json({ error: "A valid date and session type are required." }, { status: 400 });
  }
  // A video is optional here, same as a coach logging a session in NewSessionForm — not every
  // session type (Warm-up / Conditioning, Fitness Assessment) has a bowling action to analyze.
  if (videos !== undefined && (!Array.isArray(videos) || videos.some((v) => !v.url || !["front", "side", "back"].includes(v.angle ?? "")))) {
    return NextResponse.json({ error: "Each uploaded video must have a valid camera angle." }, { status: 400 });
  }
  const safeVideos = videos ?? [];
  if (rpe != null && (typeof rpe !== "number" || rpe < 1 || rpe > 10)) {
    return NextResponse.json({ error: "RPE must be between 1 and 10." }, { status: 400 });
  }

  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (caller.role !== "player" && caller.role !== "parent") {
    return NextResponse.json({ error: "Only a player or parent account can self-log a session." }, { status: 403 });
  }
  const playerId = caller.playerId;
  if (!playerId) return NextResponse.json({ error: "This account isn't linked to a player." }, { status: 400 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: player, error: playerError } = await supabase
    .from("players").select("id, sub_plan").eq("id", playerId).single();
  if (playerError || !player) return NextResponse.json({ error: "Player not found." }, { status: 404 });

  const { data: planRows, error: plansError } = await supabase.from("plans").select("*").eq("active", true);
  if (plansError) return NextResponse.json({ error: plansError.message }, { status: 500 });
  const plans = (planRows as DbPlan[]).map(dbToPlan);
  const limit = selfLogSessionsLimitForPlan(player.sub_plan as PlanTier, plans);

  // Counted from created_at (when the row was actually inserted), not the player-editable `date`
  // field — backdating the session shouldn't let someone dodge the monthly cap.
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { data: existingSessions, error: countError } = await supabase
    .from("sessions")
    .select("id")
    .eq("player_id", playerId)
    .is("coach_id", null)
    .gte("created_at", startOfMonth.toISOString());
  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });

  const used = (existingSessions ?? []).length;
  if (used >= limit) {
    return NextResponse.json({
      error: `You've used all ${limit} of your self-logged sessions this month. Ask a coach to log one instead, or wait until next month.`,
    }, { status: 403 });
  }

  const sessionId = `sess_${Date.now()}`;
  // Same XP formula as a coach-logged session (NewSessionForm) — self-logging shouldn't earn
  // more or less than the equivalent coach-run one.
  const xpEarned = 50 + safeVideos.length * 20;

  const { error: insertError } = await supabase.from("sessions").insert({
    id: sessionId, player_id: playerId, date, type, notes: notes ?? "",
    videos: safeVideos.map((v) => ({
      angle: v.angle, label: v.label ?? "", url: v.url,
      width: v.width, height: v.height, durationSec: v.durationSec, fps: v.fps ?? null, transcoded: v.transcoded,
    })),
    ball_speed_kmh: null, front_knee_angle_deg: null, xp_earned: xpEarned,
    booking_id: null, rpe: rpe ?? null, coach_id: null, time: null, duration_mins: null,
  });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json({ success: true, sessionId, xpEarned, selfLogRemaining: limit - used - 1 });
}
