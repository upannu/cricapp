import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const email = new URL(request.url).searchParams.get("email")?.trim();
  if (!email) return NextResponse.json({ error: "email is required." }, { status: 400 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Player emails aren't unique (e.g. a parent reusing one email for multiple kids),
  // so don't use maybeSingle() — it errors out silently on multiple matches.
  const { data } = await supabase
    .from("players")
    .select("name")
    .ilike("email", email)
    .limit(1);

  const match = data?.[0];
  // Only return existence + first name — never leak other player data pre-signup
  return NextResponse.json({ found: !!match, playerName: match?.name ?? null });
}
