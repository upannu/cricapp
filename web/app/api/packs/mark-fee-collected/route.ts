import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getCaller } from "@/lib/server-auth";

export async function POST(request: Request) {
  const { dueId, collectedDate } = (await request.json()) as { dueId?: string; collectedDate?: string };
  if (!dueId || !collectedDate) {
    return NextResponse.json({ error: "dueId and collectedDate are required." }, { status: 400 });
  }

  const caller = await getCaller();
  if (caller?.role !== "platform_admin") {
    return NextResponse.json({ error: "Only a platform admin can mark a platform fee collected." }, { status: 403 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { error } = await supabase.from("pack_fee_dues").update({
    status: "collected", collected_date: collectedDate, collected_by: caller.userId,
  }).eq("id", dueId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
