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

  // Set approved: true and also confirm email so the user doesn't need to
  // click a verification link separately — admin approval acts as the verification
  const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: { approved: true },
    email_confirm: true,
  });
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });

  // Remove from pending requests
  await supabase.from("user_requests").delete().eq("id", userId);

  return NextResponse.json({ success: true });
}
