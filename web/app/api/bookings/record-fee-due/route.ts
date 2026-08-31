import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getCaller, callerCanAccessPlayer } from "@/lib/server-auth";

/** Called right after a booking is marked Paid outside Stripe (cash, bank transfer) — the only
 * path where the platform's own fee cut is never actually collected, since no Stripe charge
 * occurs. Records what's owed as a ledger entry; a platform admin reconciles/collects it
 * separately (see mark-fee-collected). Mirrors packs/record-fee-due exactly, adapted for a
 * single-session booking (no total_sessions multiplier) and resolving the academy via the
 * booking's coach, since bookings has no academy_id column of its own. */
export async function POST(request: Request) {
  const { bookingId } = (await request.json()) as { bookingId?: string };
  if (!bookingId) return NextResponse.json({ error: "bookingId is required." }, { status: 400 });

  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, player_id, coach_id, fee_aud")
    .eq("id", bookingId)
    .single();
  if (bookingError || !booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  if (!(await callerCanAccessPlayer(supabase, caller, booking.player_id))) {
    return NextResponse.json({ error: "You don't have access to this booking." }, { status: 403 });
  }

  const { data: coach } = await supabase.from("coaches").select("academy_id").eq("id", booking.coach_id).maybeSingle();
  const academyId = coach?.academy_id;
  if (!academyId) return NextResponse.json({ success: true, skipped: "no_academy" });

  const { data: academy } = await supabase.from("academies").select("plan_id").eq("id", academyId).maybeSingle();
  let feePercent = 10;
  if (academy?.plan_id) {
    const { data: plan } = await supabase.from("plans").select("platform_fee_percent").eq("id", academy.plan_id).maybeSingle();
    if (plan?.platform_fee_percent != null) feePercent = plan.platform_fee_percent;
  }

  const amount = Math.round(booking.fee_aud * feePercent) / 100;
  if (amount <= 0) return NextResponse.json({ success: true, skipped: "zero_fee" });

  const { error: upsertError } = await supabase.from("booking_fee_dues").upsert(
    { id: `bfd_${bookingId}`, booking_id: bookingId, academy_id: academyId, amount_aud: amount, fee_percent: feePercent, status: "pending" },
    { onConflict: "booking_id", ignoreDuplicates: true },
  );
  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });

  return NextResponse.json({ success: true, amount });
}
