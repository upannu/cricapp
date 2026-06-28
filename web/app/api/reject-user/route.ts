import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { userId } = await request.json();
  if (!userId) return NextResponse.json({ error: "userId required." }, { status: 400 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Delete the auth user entirely
  const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 });

  // Remove from pending queue
  await supabase.from("user_requests").delete().eq("id", userId);

  return NextResponse.json({ success: true });
}
