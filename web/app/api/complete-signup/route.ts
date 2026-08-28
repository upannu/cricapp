import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const SELF_SERVE_ROLES = ["academy_admin", "coach", "player", "parent"];

/** Runs immediately after `supabase.auth.signUp()` to establish the account's real identity —
 * role/approved/player_id etc. live in app_metadata (server-only, never client-writable), so
 * signUp()'s client-supplied options.data can only ever set the display-only `name`. This route
 * is the sole place a brand-new self-serve account's role and approval status get decided.
 *
 * Player/parent auto-approve immediately (their player must already exist in our database, proven
 * by the email lookup below) — there's nothing for a human to review. Academy admin/coach still go
 * into the pending queue for manual approval. platform_admin is never reachable here — it's not in
 * SELF_SERVE_ROLES, so no signup can ever grant it. */
export async function POST(request: Request) {
  const { userId, name, email, role, playerLookupEmail, academyName, academyLocation } =
    (await request.json()) as {
      userId?: string; name?: string; email?: string; role?: string;
      playerLookupEmail?: string; academyName?: string; academyLocation?: string;
    };
  if (!userId || !name || !email || !role) {
    return NextResponse.json({ error: "userId, name, email, and role are required." }, { status: 400 });
  }
  if (!SELF_SERVE_ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // The account must actually exist and match the claimed email — guards against a forged userId
  // pointing at some other account (this route runs right after signUp(), so this should always
  // hold for a legitimate caller, but never trust client input for something this consequential).
  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
  if (userError || !userData?.user || userData.user.email?.toLowerCase() !== email.toLowerCase()) {
    return NextResponse.json({ error: "Signup verification failed." }, { status: 400 });
  }

  if (role === "player" || role === "parent") {
    if (!playerLookupEmail) {
      return NextResponse.json({ error: "A linked player email is required." }, { status: 400 });
    }
    // Player emails aren't unique (e.g. a parent reusing one email for multiple kids), so don't
    // use maybeSingle() — it errors out silently on multiple matches.
    const { data: playerMatches } = await supabase
      .from("players")
      .select("id")
      .ilike("email", playerLookupEmail)
      .limit(1);
    const playerMatch = playerMatches?.[0];
    if (!playerMatch) {
      return NextResponse.json({ error: `No player found with email ${playerLookupEmail}. Add the player first, then sign up.` }, { status: 400 });
    }

    const { error } = await supabase.auth.admin.updateUserById(userId, {
      app_metadata: { role, approved: true, player_id: playerMatch.id },
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, approved: true });
  }

  // academy_admin / coach — unchanged from before: still queued for a platform admin to review.
  const { error: metaError } = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: { role, approved: false },
  });
  if (metaError) return NextResponse.json({ error: metaError.message }, { status: 500 });

  await supabase.from("user_requests").insert({
    id: userId,
    name,
    email,
    role,
    requested_at: new Date().toISOString(),
    academy_name: academyName || null,
    academy_location: academyLocation || null,
  });

  // Fire-and-forget — don't fail signup on an email hiccup.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://crichq.com.au";
  fetch(`${appUrl}/api/notify-admin-signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, role }),
  }).catch(() => {});

  return NextResponse.json({ success: true, approved: false });
}
