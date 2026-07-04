import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST() {
  // Identify the caller from their session cookie — never trust a client-supplied playerId
  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const role = user.user_metadata?.role;
  const playerId = user.user_metadata?.player_id as string | undefined;
  if (role !== "parent") {
    return NextResponse.json({ error: "Only a parent/guardian account can confirm consent." }, { status: 403 });
  }
  if (!playerId) {
    return NextResponse.json({ error: "This account isn't linked to a player." }, { status: 400 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { error } = await supabase
    .from("players")
    .update({
      guardian_consent_status: "Confirmed",
      guardian_consent_confirmed_at: new Date().toISOString(),
      guardian_consent_confirmed_by: (user.user_metadata?.name as string) ?? user.email,
      guardian_consent_confirmed_email: user.email,
    })
    .eq("id", playerId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
