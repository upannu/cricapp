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

  // Player emails aren't unique (e.g. a parent reusing one email for multiple kids), so don't use
  // maybeSingle() — it errors out silently on multiple matches. Signing up now links every match
  // (see /api/complete-signup), so surface the count here too rather than silently picking one.
  //
  // This route is unauthenticated by necessity — it runs pre-signup, before there's any account
  // to check ownership against — so it must never return anything that identifies a real person.
  // It used to also return the matched player's name; that let anyone who merely knew (or
  // guessed) a guardian's email learn a real child's full name and how many siblings share it,
  // with no login and no rate limit. Existence + count only, nothing that names anyone.
  const { data } = await supabase
    .from("players")
    .select("id")
    .ilike("email", email);

  return NextResponse.json({
    found: !!data && data.length > 0,
    additionalCount: data && data.length > 1 ? data.length - 1 : 0,
  });
}
