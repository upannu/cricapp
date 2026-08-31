import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { playerId } = (await request.json()) as { playerId?: string };
  if (!playerId) return NextResponse.json({ error: "playerId required." }, { status: 400 });

  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user: caller } } = await authClient.auth.getUser();
  const callerRole = caller?.app_metadata?.role as string | undefined;
  if (callerRole !== "platform_admin" && callerRole !== "academy_admin") {
    return NextResponse.json({ error: "Only a platform admin or academy admin can reactivate an account." }, { status: 403 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("id")
    .eq("id", playerId)
    .single();
  if (playerError || !player) return NextResponse.json({ error: "Player not found." }, { status: 404 });

  if (callerRole === "academy_admin") {
    // Players don't carry an academy_id column — an academy's roster lives as a player_ids
    // array on the academy row instead, so scoping by academy needs that lookup first.
    const callerAcademyId = caller?.app_metadata?.academy_id as string | undefined;
    const { data: academy } = callerAcademyId
      ? await supabase.from("academies").select("player_ids").eq("id", callerAcademyId).single()
      : { data: null };
    if (!academy || !(academy.player_ids as string[]).includes(playerId)) {
      return NextResponse.json({ error: "You can only reactivate players in your own academy." }, { status: 403 });
    }
  }

  const { error: updateError } = await supabase
    .from("players")
    .update({ login_disabled: false, disabled_at: null, disabled_reason: null })
    .eq("id", playerId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
