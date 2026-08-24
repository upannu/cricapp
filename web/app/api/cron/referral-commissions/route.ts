import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/** Computes each active ongoing referral's commission for the previous calendar month and writes
 * one referral_payouts row per referral per month — a platform admin marks each one paid manually
 * once the actual (off-platform) transfer has been sent, the same way pack payments work. */

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function previousMonthRange(now: Date): { start: string; end: string; label: string } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-based; the *current* month, so "previous" is m-1
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  const label = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
  return { start: start.toISOString().split("T")[0], end: end.toISOString().split("T")[0], label };
}

async function sumSessionPacks(supabase: ReturnType<typeof serviceClient>, column: "player_id" | "coach_id" | "academy_id", value: string, start: string, end: string): Promise<number> {
  const { data } = await supabase.from("session_packs")
    .select("total_sessions, fee_per_session")
    .eq(column, value).gte("purchase_date", start).lt("purchase_date", end);
  return (data ?? []).reduce((sum, pk) => sum + (pk.total_sessions ?? 0) * (pk.fee_per_session ?? 0), 0);
}

async function sumBookingsByColumn(supabase: ReturnType<typeof serviceClient>, column: "player_id" | "coach_id", value: string, start: string, end: string): Promise<number> {
  const { data } = await supabase.from("bookings")
    .select("fee_aud").eq(column, value).gte("date", start).lt("date", end);
  return (data ?? []).reduce((sum, b) => sum + (b.fee_aud ?? 0), 0);
}

async function sumBookingsForAcademy(supabase: ReturnType<typeof serviceClient>, academyId: string, start: string, end: string): Promise<number> {
  const { data: academy } = await supabase.from("academies").select("player_ids, coach_ids").eq("id", academyId).maybeSingle();
  const playerIds: string[] = academy?.player_ids ?? [];
  const coachIds: string[] = academy?.coach_ids ?? [];
  let total = 0;
  if (playerIds.length > 0) {
    const { data } = await supabase.from("bookings").select("fee_aud").in("player_id", playerIds).gte("date", start).lt("date", end);
    total += (data ?? []).reduce((sum, b) => sum + (b.fee_aud ?? 0), 0);
  }
  if (coachIds.length > 0) {
    const { data } = await supabase.from("bookings").select("fee_aud").in("coach_id", coachIds).gte("date", start).lt("date", end);
    total += (data ?? []).reduce((sum, b) => sum + (b.fee_aud ?? 0), 0);
  }
  return total;
}

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: "Not configured — set CRON_SECRET." }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = serviceClient();
  const { start, end, label } = previousMonthRange(new Date());

  const { data: referrals, error } = await supabase.from("referrals")
    .select("id, referred_academy_id, referred_coach_id, referred_player_id, ongoing_rate_percent, ongoing_revenue_source, ongoing_end_date")
    .eq("status", "active").eq("commission_type", "ongoing");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: Array<{ referralId: string; amount: number; action: string }> = [];

  for (const ref of referrals ?? []) {
    if (ref.ongoing_end_date && ref.ongoing_end_date < start) {
      results.push({ referralId: ref.id, amount: 0, action: "skipped_ended" });
      continue;
    }

    const linkedId = ref.referred_academy_id || ref.referred_coach_id || ref.referred_player_id;
    if (!linkedId) { results.push({ referralId: ref.id, amount: 0, action: "skipped_unlinked" }); continue; }

    const source = ref.ongoing_revenue_source ?? "both";
    let revenue = 0;
    if (ref.referred_academy_id) {
      if (source === "session_packs" || source === "both") revenue += await sumSessionPacks(supabase, "academy_id", ref.referred_academy_id, start, end);
      if (source === "bookings" || source === "both") revenue += await sumBookingsForAcademy(supabase, ref.referred_academy_id, start, end);
    } else if (ref.referred_coach_id) {
      if (source === "session_packs" || source === "both") revenue += await sumSessionPacks(supabase, "coach_id", ref.referred_coach_id, start, end);
      if (source === "bookings" || source === "both") revenue += await sumBookingsByColumn(supabase, "coach_id", ref.referred_coach_id, start, end);
    } else if (ref.referred_player_id) {
      if (source === "session_packs" || source === "both") revenue += await sumSessionPacks(supabase, "player_id", ref.referred_player_id, start, end);
      if (source === "bookings" || source === "both") revenue += await sumBookingsByColumn(supabase, "player_id", ref.referred_player_id, start, end);
    }

    const amount = Math.round(revenue * (ref.ongoing_rate_percent ?? 0)) / 100;
    if (amount <= 0) { results.push({ referralId: ref.id, amount: 0, action: "skipped_zero_revenue" }); continue; }

    const { error: insertError } = await supabase.from("referral_payouts").upsert(
      { id: `rpo_${ref.id}_${label}`, referral_id: ref.id, period_label: label, amount_aud: amount, status: "pending" },
      { onConflict: "referral_id,period_label", ignoreDuplicates: true },
    );
    results.push({ referralId: ref.id, amount, action: insertError ? `error: ${insertError.message}` : "payout_created" });
  }

  return NextResponse.json({ success: true, period: label, processed: (referrals ?? []).length, results });
}
