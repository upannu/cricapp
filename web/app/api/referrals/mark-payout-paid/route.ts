import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getCaller } from "@/lib/server-auth";

export async function POST(request: Request) {
  const { payoutId, paidDate } = (await request.json()) as { payoutId?: string; paidDate?: string };
  if (!payoutId || !paidDate) {
    return NextResponse.json({ error: "payoutId and paidDate are required." }, { status: 400 });
  }

  const caller = await getCaller();
  if (caller?.role !== "platform_admin") {
    return NextResponse.json({ error: "Only a platform admin can mark a referral payout paid." }, { status: 403 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { error } = await supabase.from("referral_payouts").update({
    status: "paid", paid_date: paidDate, paid_by: caller.userId,
  }).eq("id", payoutId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
