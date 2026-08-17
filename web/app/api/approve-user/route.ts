import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

interface LinkedIdentity {
  role: string;
  academyId?: string;
  coachId?: string;
  playerId?: string;
}

export async function POST(request: Request) {
  const { userId, academyId } = await request.json();
  if (!userId) return NextResponse.json({ error: "userId required." }, { status: 400 });

  // Only a platform admin may approve pending requests — the middleware only
  // checks "is someone logged in", not their role.
  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user: caller } } = await authClient.auth.getUser();
  if (caller?.user_metadata?.role !== "platform_admin") {
    return NextResponse.json({ error: "Only a platform admin can approve requests." }, { status: 403 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Get the request details so we can find the real auth user and send an email
  const { data: reqData, error: reqError } = await supabase
    .from("user_requests")
    .select("email, name, role, player_lookup_email, request_type, existing_user_id")
    .eq("id", userId)
    .single();

  if (reqError || !reqData) {
    return NextResponse.json({ error: "Request not found in queue." }, { status: 404 });
  }

  // Player/parent accounts must link to an existing player record
  let linkedPlayerId: string | undefined;
  if ((reqData.role === "player" || reqData.role === "parent")) {
    if (!reqData.player_lookup_email) {
      return NextResponse.json({ error: "This request has no linked player email." }, { status: 400 });
    }
    // Player emails aren't unique (e.g. a parent reusing one email for multiple kids),
    // so don't use maybeSingle() — it errors out silently on multiple matches.
    const { data: playerMatches } = await supabase
      .from("players")
      .select("id")
      .ilike("email", reqData.player_lookup_email)
      .limit(1);
    const playerMatch = playerMatches?.[0];
    if (!playerMatch) {
      return NextResponse.json({ error: `No player found with email ${reqData.player_lookup_email}. Add the player first, then approve.` }, { status: 400 });
    }
    linkedPlayerId = playerMatch.id;
  }

  // Coaches who self-signed-up (rather than being invited via the coaches admin UI, which
  // already links coach_id at invite time) still need linking to their own coaches row here —
  // best-effort by email match, not a hard requirement, since a coach may legitimately sign up
  // before any coaches row exists for them yet.
  let linkedCoachId: string | undefined;
  if (reqData.role === "coach") {
    const { data: coachMatch } = await supabase
      .from("coaches")
      .select("id")
      .ilike("email", reqData.email)
      .maybeSingle();
    linkedCoachId = coachMatch?.id;
  }

  // A "link" request (an already-approved account requesting an additional role) is tied to
  // existing_user_id directly, set only after the requester proved they own that account by
  // signing in with its real password (see /api/request-additional-role) — never resolved by
  // email here, unlike a brand-new request, since the email is already in use by this account.
  if (reqData.request_type === "link" && reqData.existing_user_id) {
    const { data: existingUserData, error: getUserError } = await supabase.auth.admin.getUserById(reqData.existing_user_id);
    if (getUserError || !existingUserData?.user) {
      await supabase.from("user_requests").delete().eq("id", userId);
      return NextResponse.json({ error: "The linked account no longer exists. The request has been removed." }, { status: 404 });
    }

    const meta = existingUserData.user.user_metadata ?? {};
    const currentIdentities = (meta.linkedIdentities as LinkedIdentity[] | undefined) ?? [];
    const seeded = currentIdentities.length > 0
      ? currentIdentities
      : [{
          role: meta.role as string,
          academyId: meta.academy_id as string | undefined,
          coachId: meta.coach_id as string | undefined,
          playerId: meta.player_id as string | undefined,
        }];

    const newIdentity: LinkedIdentity = { role: reqData.role };
    if (reqData.role === "academy_admin" && academyId) newIdentity.academyId = academyId;
    if (linkedCoachId) newIdentity.coachId = linkedCoachId;
    if (linkedPlayerId) newIdentity.playerId = linkedPlayerId;

    const alreadyLinked = seeded.some((li) => li.role === newIdentity.role);
    const linkedIdentities = alreadyLinked ? seeded : [...seeded, newIdentity];

    // Only linkedIdentities changes here — the account's currently-active role/links are left
    // untouched, so an approval never silently changes what a logged-in session sees mid-use.
    const { error: linkUpdateError } = await supabase.auth.admin.updateUserById(reqData.existing_user_id, {
      user_metadata: { ...meta, linkedIdentities },
    });
    if (linkUpdateError) return NextResponse.json({ error: linkUpdateError.message }, { status: 400 });

    await supabase.from("user_requests").delete().eq("id", userId);
    return NextResponse.json({ success: true });
  }

  // Find the auth user by email — the stored ID can be a ghost UUID
  // if the email was already registered when they signed up
  const { data: listData, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listError) return NextResponse.json({ error: listError.message }, { status: 500 });

  const authUser = listData.users.find((u) => u.email?.toLowerCase() === reqData.email?.toLowerCase());

  if (!authUser) {
    await supabase.from("user_requests").delete().eq("id", userId);
    return NextResponse.json({ error: "No Supabase auth account found for this email. The request has been removed — ask the user to sign up again." }, { status: 404 });
  }

  // Approve: set approved: true, confirm email, and optionally assign academy / linked player
  const extraMeta: Record<string, unknown> = { approved: true };
  if (academyId) extraMeta.academy_id = academyId;
  if (linkedPlayerId) extraMeta.player_id = linkedPlayerId;
  if (linkedCoachId) extraMeta.coach_id = linkedCoachId;

  const { error: updateError } = await supabase.auth.admin.updateUserById(authUser.id, {
    user_metadata: extraMeta,
    email_confirm: true,
  });
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });

  // Remove from pending queue
  await supabase.from("user_requests").delete().eq("id", userId);

  // Send approval email to the user
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? "https://crichq.com.au";

  if (gmailUser && gmailPass) {
    const roleLabel = {
      academy_admin: "Academy Admin",
      coach: "Coach",
      player: "Player",
      parent: "Parent / Guardian",
    }[reqData.role as string] ?? reqData.role;
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailPass },
    });
    const text = [
      `Hi ${reqData.name},`,
      ``,
      `Great news! Your PACE HQ account has been approved.`,
      ``,
      `You can now log in and get started:`,
      `${appUrl}/login`,
      ``,
      `Your role: ${roleLabel}`,
      ``,
      `Welcome to the team!`,
      `— PACE HQ`,
    ].join("\n");

    await transporter.sendMail({
      from: `"PACE HQ" <${gmailUser}>`,
      to: reqData.email,
      subject: "Your PACE HQ account has been approved",
      text,
    }).catch(() => {
      // Don't fail the approval if email sending fails
    });
  }

  return NextResponse.json({ success: true });
}
