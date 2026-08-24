import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getCaller } from "@/lib/server-auth";

const REFERRED_TYPES = ["academy", "coach", "player", "other"];
const COMMISSION_TYPES = ["one_off", "ongoing"];
const REVENUE_SOURCES = ["session_packs", "bookings", "both"];

export async function POST(request: Request) {
  const body = (await request.json()) as {
    referrerName?: string; referrerEmail?: string; referrerPhone?: string;
    referredType?: string; referredAcademyId?: string; referredCoachId?: string; referredPlayerId?: string;
    referredName?: string;
    commissionType?: string; oneOffAmountAud?: number;
    ongoingRatePercent?: number; ongoingRevenueSource?: string; ongoingEndDate?: string;
    notes?: string;
  };

  const caller = await getCaller();
  if (caller?.role !== "platform_admin") {
    return NextResponse.json({ error: "Only a platform admin can create referrals." }, { status: 403 });
  }

  if (!body.referrerName?.trim() || !body.referredName?.trim()) {
    return NextResponse.json({ error: "Referrer name and referred name are required." }, { status: 400 });
  }
  if (!body.referredType || !REFERRED_TYPES.includes(body.referredType)) {
    return NextResponse.json({ error: "A valid referred type is required." }, { status: 400 });
  }
  if (!body.commissionType || !COMMISSION_TYPES.includes(body.commissionType)) {
    return NextResponse.json({ error: "A valid commission type is required." }, { status: 400 });
  }

  const linkedId = body.referredAcademyId || body.referredCoachId || body.referredPlayerId;
  if (body.commissionType === "ongoing" && !linkedId) {
    return NextResponse.json({ error: "Ongoing commissions require a real academy, coach, or player to be linked — there's no revenue to calculate from otherwise." }, { status: 400 });
  }
  if (body.commissionType === "one_off" && (!body.oneOffAmountAud || body.oneOffAmountAud <= 0)) {
    return NextResponse.json({ error: "A one-off amount greater than $0 is required." }, { status: 400 });
  }
  if (body.commissionType === "ongoing") {
    if (!body.ongoingRatePercent || body.ongoingRatePercent <= 0) {
      return NextResponse.json({ error: "An ongoing commission rate greater than 0% is required." }, { status: 400 });
    }
    if (!body.ongoingRevenueSource || !REVENUE_SOURCES.includes(body.ongoingRevenueSource)) {
      return NextResponse.json({ error: "A valid ongoing revenue source is required." }, { status: 400 });
    }
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const referralId = `ref_${Date.now()}`;
  const { error: insertError } = await supabase.from("referrals").insert({
    id: referralId,
    referrer_name: body.referrerName.trim(),
    referrer_email: body.referrerEmail?.trim() || null,
    referrer_phone: body.referrerPhone?.trim() || null,
    referred_type: body.referredType,
    referred_academy_id: body.referredAcademyId || null,
    referred_coach_id: body.referredCoachId || null,
    referred_player_id: body.referredPlayerId || null,
    referred_name: body.referredName.trim(),
    commission_type: body.commissionType,
    one_off_amount_aud: body.commissionType === "one_off" ? body.oneOffAmountAud : null,
    ongoing_rate_percent: body.commissionType === "ongoing" ? body.ongoingRatePercent : null,
    ongoing_revenue_source: body.commissionType === "ongoing" ? body.ongoingRevenueSource : null,
    ongoing_end_date: body.commissionType === "ongoing" ? (body.ongoingEndDate || null) : null,
    status: "active",
    notes: body.notes?.trim() || null,
    created_by: caller.userId,
  });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  // A one-off bonus is owed immediately — no monthly cron will ever create its payout the way
  // an ongoing referral's does, so the ledger entry has to be created here at creation time.
  if (body.commissionType === "one_off") {
    const { error: payoutError } = await supabase.from("referral_payouts").insert({
      id: `rpo_${Date.now()}`,
      referral_id: referralId,
      period_label: null,
      amount_aud: body.oneOffAmountAud,
      status: "pending",
    });
    if (payoutError) return NextResponse.json({ error: payoutError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, referralId });
}
