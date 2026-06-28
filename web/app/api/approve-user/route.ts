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

  // Get the email from user_requests so we can find the real auth user
  const { data: reqData, error: reqError } = await supabase
    .from("user_requests")
    .select("email")
    .eq("id", userId)
    .single();

  if (reqError || !reqData) {
    return NextResponse.json({ error: "Request not found in queue." }, { status: 404 });
  }

  // Find the auth user by email — the stored ID can be a ghost UUID
  // if the email was already registered when they signed up
  const { data: listData, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listError) return NextResponse.json({ error: listError.message }, { status: 500 });

  const authUser = listData.users.find((u) => u.email === reqData.email);

  if (!authUser) {
    // Auth record doesn't exist — remove the stale request and report
    await supabase.from("user_requests").delete().eq("id", userId);
    return NextResponse.json({ error: "No Supabase auth account found for this email. The request has been removed — ask the user to sign up again." }, { status: 404 });
  }

  // Update using the real auth user ID; also confirm email so they can log in immediately
  const { error: updateError } = await supabase.auth.admin.updateUserById(authUser.id, {
    user_metadata: { approved: true },
    email_confirm: true,
  });
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });

  // Remove from pending queue
  await supabase.from("user_requests").delete().eq("id", userId);

  return NextResponse.json({ success: true });
}
