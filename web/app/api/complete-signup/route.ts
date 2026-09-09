import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { dbToPlan, type DbPlan } from "@/lib/db";
import { sessionsLimitForPlan } from "@/lib/plan-features";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import type { AgeGroup } from "@/lib/types";

const SELF_SERVE_ROLES = ["academy_admin", "coach", "player", "parent"];
const AGE_GROUPS: AgeGroup[] = ["U10", "U11", "U12", "U13", "U14", "U16", "U19", "Senior"];

/** Runs immediately after `supabase.auth.signUp()` to establish the account's real identity —
 * role/approved/player_id etc. live in app_metadata (server-only, never client-writable), so
 * signUp()'s client-supplied options.data can only ever set the display-only `name`. This route
 * is the sole place a brand-new self-serve account's role and approval status get decided.
 *
 * Player/parent auto-approve immediately — there's nothing for a human to review, whether they
 * linked to a player a coach already added (proven by the email lookup below) or, for a player
 * with no coach at all yet (newPlayerAgeGroup set instead of playerLookupEmail — see the "new
 * here" toggle on /signup), just created their own standalone player record. Academy admin/coach
 * still go into the pending queue for manual approval. platform_admin is never reachable here —
 * it's not in SELF_SERVE_ROLES, so no signup can ever grant it. */
export async function POST(request: Request) {
  const { userId, name, email, role, playerLookupEmail, newPlayerAgeGroup, academyName, academyLocation } =
    (await request.json()) as {
      userId?: string; name?: string; email?: string; role?: string;
      playerLookupEmail?: string; newPlayerAgeGroup?: string;
      academyName?: string; academyLocation?: string;
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

  // This route should only ever run once per account — the moment right after a genuinely new
  // signUp() call. Supabase silently returns the *existing* (same id) user for a repeat signUp()
  // against an email that's unconfirmed rather than erroring, so a second signup attempt for the
  // same email can reach here even when /api/check-existing-account + the request-additional-role
  // flow were supposed to catch it first. Refusing to touch an account that already has a role set
  // is the actual backstop — without it, this call blindly overwrites app_metadata, silently
  // wiping out whatever role/approval/academy_id the first signup already established.
  if (userData.user.app_metadata?.role) {
    return NextResponse.json({ error: "This email already has an account. Sign in instead, or use 'request an additional role' from your account settings." }, { status: 409 });
  }

  // A brand-new player with no coach/academy at all yet — "I'm new here" on /signup's Player
  // step, instead of the usual "link to a player a coach already added" lookup below. Only
  // offered for role === "player" (not "parent"): a young child realistically gets added by a
  // coach or their own parent, not by self-registering, so this stays scoped to an
  // old-enough-to-sign-up-themselves player creating their own standalone record — no academy,
  // no coach, same starting point independent coaches get, with /portal/find-coach as the next
  // step. Free-tier defaults mirror AcademyClient/CoachesClient's own "+ Add Player" shape.
  if (role === "player" && newPlayerAgeGroup) {
    if (!AGE_GROUPS.includes(newPlayerAgeGroup as AgeGroup)) {
      return NextResponse.json({ error: "Invalid age group." }, { status: 400 });
    }
    const { data: planRows } = await supabase.from("plans").select("*").eq("active", true).order("sort_order");
    const plans = ((planRows ?? []) as DbPlan[]).map(dbToPlan);
    const freeSessionsLimit = sessionsLimitForPlan("Free", plans);
    const now = new Date().toISOString().split("T")[0];
    const newPlayerId = `p_${userId}`;

    const { error: insertError } = await supabase.from("players").insert({
      id: newPlayerId, name, email, phone: "",
      bowling_style: "Right Arm Fast", age_group: newPlayerAgeGroup, club: "",
      coach_id: null, guardian_consent_status: "Pending",
      added_date: now, sessions_count: 0, last_active: now, xp: 0,
      sub_plan: "Free", sub_start_date: now,
      sub_end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      sub_sessions_used: 0, sub_sessions_limit: freeSessionsLimit,
      bio_ball_speed_kmh: 0, bio_front_knee_angle_deg: 0, bio_action_type: "Side-on",
      bio_injury_risk: "Low", bio_last_session: now,
      acad_stage: "Foundation", acad_completion_percent: 0, acad_total_sessions: 0,
      acad_xp: 0, acad_articles_read: 0,
      currency: DEFAULT_CURRENCY,
    });
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

    const { error: metaErr } = await supabase.auth.admin.updateUserById(userId, {
      app_metadata: { role, approved: true, player_id: newPlayerId },
    });
    if (metaErr) return NextResponse.json({ error: metaErr.message }, { status: 500 });
    return NextResponse.json({ success: true, approved: true });
  }

  if (role === "player" || role === "parent") {
    if (!playerLookupEmail) {
      return NextResponse.json({ error: "A linked player email is required." }, { status: 400 });
    }
    // Player emails aren't unique — siblings often share one family email, and the same real
    // child can have more than one player row (this app ties one coach_id to each row, so "same
    // kid, two academies" is two separate rows too). Link ALL of them, not just the first: the
    // account's app_metadata.player_id becomes the active one, and every match (including the
    // active one, per the linkedIdentities convention elsewhere in this app) goes into
    // linkedIdentities so NavBar's existing role-switcher lets them flip between children —
    // exactly the same mechanism a coach-who's-also-a-parent already uses to switch roles.
    const { data: playerMatches } = await supabase
      .from("players")
      .select("id")
      .ilike("email", playerLookupEmail);
    if (!playerMatches || playerMatches.length === 0) {
      return NextResponse.json({ error: `No player found with email ${playerLookupEmail}. Add the player first, then sign up.` }, { status: 400 });
    }

    const appMetadata: Record<string, unknown> = { role, approved: true, player_id: playerMatches[0].id };
    if (playerMatches.length > 1) {
      appMetadata.linkedIdentities = playerMatches.map((p) => ({ role, playerId: p.id }));
    }
    const { error } = await supabase.auth.admin.updateUserById(userId, { app_metadata: appMetadata });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, approved: true });
  }

  // A fresh academy_admin signup almost always means a fresh academy — nothing stops someone
  // typing a name that already exists (their own academy, mistakenly signing up again, or
  // someone else's), which otherwise sails through into the pending queue and only surfaces as a
  // confusing duplicate once a platform admin tries to approve it.
  if (role === "academy_admin" && academyName?.trim()) {
    const { data: existingAcademy } = await supabase
      .from("academies")
      .select("id")
      .ilike("name", academyName.trim())
      .limit(1);
    if (existingAcademy && existingAcademy.length > 0) {
      return NextResponse.json({ error: `An academy named "${academyName.trim()}" already exists. If this is your academy, ask its existing admin to add you instead of signing up again.` }, { status: 409 });
    }
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
