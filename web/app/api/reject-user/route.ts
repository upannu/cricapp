import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { userId } = await request.json();
  if (!userId) return NextResponse.json({ error: "userId required." }, { status: 400 });

  // Only a platform admin may reject pending requests — the middleware only
  // checks "is someone logged in", not their role.
  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user: caller } } = await authClient.auth.getUser();
  if (caller?.user_metadata?.role !== "platform_admin") {
    return NextResponse.json({ error: "Only a platform admin can reject requests." }, { status: 403 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Get email from user_requests so we can find the real auth user
  const { data: reqData } = await supabase
    .from("user_requests")
    .select("email")
    .eq("id", userId)
    .single();

  if (reqData?.email) {
    // Find and delete the auth user by email
    const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const authUser = listData?.users.find((u) => u.email === reqData.email);
    if (authUser) {
      const { error: deleteError } = await supabase.auth.admin.deleteUser(authUser.id);
      if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }
  }

  // Remove from pending queue regardless
  await supabase.from("user_requests").delete().eq("id", userId);

  return NextResponse.json({ success: true });
}
