import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isSupportedCurrency } from "@/lib/currency";

/** Lets a player/parent set which currency they buy their own individual Player Pro / Coach Pro /
 * Library / assessment purchases in (see SubscriptionPage.tsx) — a dedicated route because the
 * players_update RLS policy doesn't let player/parent touch their own row directly (by design,
 * every other column there is staff-managed). */
export async function POST(request: Request) {
  const { playerId, currency } = (await request.json()) as { playerId?: string; currency?: string };
  if (!playerId || !isSupportedCurrency(currency)) {
    return NextResponse.json({ error: "playerId and a supported currency are required." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const role = user.app_metadata?.role;
  const ownPlayerId = user.app_metadata?.player_id as string | undefined;
  const isOwnPlayer = (role === "player" || role === "parent") && ownPlayerId === playerId;
  if (!isOwnPlayer && role !== "platform_admin") {
    return NextResponse.json({ error: "You can only set the currency for your own profile." }, { status: 403 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { error } = await supabase.from("players").update({ currency }).eq("id", playerId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
