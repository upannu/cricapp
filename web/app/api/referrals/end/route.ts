import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getCaller } from "@/lib/server-auth";

export async function POST(request: Request) {
  const { referralId } = (await request.json()) as { referralId?: string };
  if (!referralId) return NextResponse.json({ error: "referralId is required." }, { status: 400 });

  const caller = await getCaller();
  if (caller?.role !== "platform_admin") {
    return NextResponse.json({ error: "Only a platform admin can end a referral." }, { status: 403 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Ending a referral only stops future cron accrual — payouts already created stay exactly as
  // they are, paid or not.
  const { error } = await supabase.from("referrals").update({ status: "ended" }).eq("id", referralId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
