import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { bookingId, notes } = (await request.json()) as { bookingId?: string; notes?: string };
  if (!bookingId) {
    return NextResponse.json({ error: "bookingId is required." }, { status: 400 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, player_id, date, type, pack_id, status")
    .eq("id", bookingId)
    .single();
  if (bookingError || !booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }
  if (booking.status === "Completed") {
    return NextResponse.json({ error: "This booking is already completed." }, { status: 400 });
  }

  // 1. Log the session, linked back to this booking
  const sessionId = `s_${Date.now()}`;
  const { error: sessionError } = await supabase.from("sessions").insert({
    id: sessionId,
    player_id: booking.player_id,
    date: booking.date,
    type: booking.type,
    notes: notes ?? "",
    videos: [],
    ball_speed_kmh: null,
    front_knee_angle_deg: null,
    xp_earned: 50,
    booking_id: bookingId,
  });
  if (sessionError) {
    return NextResponse.json({ error: `Could not log session: ${sessionError.message}` }, { status: 500 });
  }

  // 2. Mark the booking Completed
  const { error: statusError } = await supabase.from("bookings").update({ status: "Completed" }).eq("id", bookingId);
  if (statusError) {
    return NextResponse.json({ error: `Could not update booking status: ${statusError.message}` }, { status: 500 });
  }

  // 2b. Credit the player's XP and session counts — previously never happened here either.
  // A booking drawing from a prepaid pack doesn't also burn the subscription's monthly quota —
  // that would double-charge the player for one session (once via the pack, once via the cap).
  const { data: playerRow } = await supabase
    .from("players")
    .select("xp, sessions_count, sub_sessions_used")
    .eq("id", booking.player_id)
    .single();
  if (playerRow) {
    await supabase.from("players").update({
      xp: (playerRow.xp ?? 0) + 50,
      sessions_count: (playerRow.sessions_count ?? 0) + 1,
      ...(booking.pack_id ? {} : { sub_sessions_used: (playerRow.sub_sessions_used ?? 0) + 1 }),
    }).eq("id", booking.player_id);
  }

  // 3. Draw down the linked pack, if any
  if (booking.pack_id) {
    const { data: pack, error: packFetchError } = await supabase
      .from("session_packs")
      .select("sessions_used")
      .eq("id", booking.pack_id)
      .single();
    if (!packFetchError && pack) {
      await supabase
        .from("session_packs")
        .update({ sessions_used: pack.sessions_used + 1 })
        .eq("id", booking.pack_id);
    }
  }

  return NextResponse.json({ success: true, sessionId });
}
