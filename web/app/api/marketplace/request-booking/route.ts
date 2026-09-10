import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getCaller } from "@/lib/server-auth";
import { DEFAULT_CURRENCY } from "@/lib/currency";

const BOOKING_TYPES = [
  "Net Session", "Individual Coaching", "Video Review",
  "Fitness Assessment", "Match Practice", "Warm-up / Conditioning",
];

/**
 * A marketplace player requesting a booking with a coach outside their own academy. Run
 * server-side because the coach's session fee lives on the coach's *academy* row, which RLS
 * hides from a player who isn't a member of it — the old client path (upsertBooking directly)
 * therefore always saw a fee of 0 and created a free booking. This also stops the player
 * controlling `fee_aud`/`player_id`/`status` directly.
 *
 * `estimateOnly: true` returns just the computed fee for the request modal to display; the real
 * POST creates the Pending booking with that same server-computed fee.
 */
export async function POST(request: Request) {
  const { coachId, type, date, time, notes, estimateOnly } = (await request.json()) as {
    coachId?: string; type?: string; date?: string; time?: string; notes?: string; estimateOnly?: boolean;
  };
  if (!coachId || !type) return NextResponse.json({ error: "coachId and type are required." }, { status: 400 });
  if (!BOOKING_TYPES.includes(type)) return NextResponse.json({ error: "Invalid session type." }, { status: 400 });

  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (caller.role !== "player" && caller.role !== "parent") {
    return NextResponse.json({ error: "Only a player or parent account can request a marketplace booking." }, { status: 403 });
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

  const { data: coach, error: coachErr } = await supabase
    .from("coaches")
    .select("id, academy_id, location, currency, marketplace_visible, status, login_disabled")
    .eq("id", coachId)
    .single();
  if (coachErr || !coach) return NextResponse.json({ error: "Coach not found." }, { status: 404 });
  if (!coach.marketplace_visible || coach.status !== "Active" || coach.login_disabled) {
    return NextResponse.json({ error: "This coach isn't available for marketplace bookings." }, { status: 403 });
  }

  // Resolve the coach's academy for pricing: the academy_id column, or — for a coach added via
  // an academy's own Coaches tab, which leaves coaches.academy_id null — the academy whose
  // coach_ids array includes them or which they head.
  type AcademyFee = { session_type_fees: Record<string, number> | null; session_fee_aud: number | null; plan_id: string | null; currency: string | null };
  let academy: AcademyFee | null = null;
  if (coach.academy_id) {
    const { data } = await supabase
      .from("academies")
      .select("session_type_fees, session_fee_aud, plan_id, currency")
      .eq("id", coach.academy_id)
      .maybeSingle();
    academy = (data as AcademyFee | null) ?? null;
  }
  if (!academy) {
    const { data } = await supabase
      .from("academies")
      .select("session_type_fees, session_fee_aud, plan_id, currency")
      .contains("coach_ids", [coachId])
      .maybeSingle();
    academy = (data as AcademyFee | null) ?? null;
  }
  if (!academy) {
    const { data } = await supabase
      .from("academies")
      .select("session_type_fees, session_fee_aud, plan_id, currency")
      .eq("head_coach_id", coachId)
      .maybeSingle();
    academy = (data as AcademyFee | null) ?? null;
  }

  let feesWaived = false;
  if (academy?.plan_id) {
    const { data: plan } = await supabase.from("plans").select("waives_session_fees").eq("id", academy.plan_id).maybeSingle();
    feesWaived = !!plan?.waives_session_fees;
  }
  const fee = feesWaived
    ? 0
    : (academy?.session_type_fees?.[type] ?? academy?.session_fee_aud ?? 0);
  const currency = academy?.currency ?? coach.currency ?? DEFAULT_CURRENCY;

  if (estimateOnly) {
    return NextResponse.json({ fee, currency, feesWaived });
  }

  if (!date || !time) return NextResponse.json({ error: "Preferred date and time are required." }, { status: 400 });

  const bookingId = `b_${Date.now()}`;
  const { error: insErr } = await supabase.from("bookings").insert({
    id: bookingId,
    player_id: playerId,
    coach_id: coachId,
    date,
    time,
    duration_mins: 60,
    type,
    status: "Pending",
    location: coach.location ?? "",
    notes: notes ?? "",
    fee_aud: fee,
    pack_id: null,
    payment_status: "Pending",
    source: "marketplace",
  });
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ success: true, bookingId, fee, currency, feesWaived });
}
