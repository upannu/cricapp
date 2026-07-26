import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { playerProPriceAud, coachProPriceAud } = (await request.json()) as {
    playerProPriceAud?: number;
    coachProPriceAud?: number;
  };
  if (
    typeof playerProPriceAud !== "number" || !(playerProPriceAud > 0) ||
    typeof coachProPriceAud !== "number" || !(coachProPriceAud > 0)
  ) {
    return NextResponse.json({ error: "Both prices must be positive numbers." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user: caller } } = await authClient.auth.getUser();
  if (caller?.user_metadata?.role !== "platform_admin") {
    return NextResponse.json({ error: "Only a platform admin can change subscription pricing." }, { status: 403 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { error } = await supabase
    .from("platform_settings")
    .update({
      player_pro_price_aud: playerProPriceAud,
      coach_pro_price_aud: coachProPriceAud,
      updated_at: new Date().toISOString(),
    })
    .eq("id", "default");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
