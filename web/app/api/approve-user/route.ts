import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { buildWelcomeEmailHtml, renderTemplate, emailFrom } from "@/lib/email-templates";
import { fetchAcademyPlanInfo } from "@/lib/plan-email";
import { planFeatureLines } from "@/lib/plan-features";
import { dbToPlan, type DbPlan } from "@/lib/db";
import type { PlanTier } from "@/lib/types";
import { findAuthUserByEmail, mergeLinkedIdentities } from "@/lib/server-auth";
import type { LinkedIdentity } from "@/lib/types";

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
  if (caller?.app_metadata?.role !== "platform_admin") {
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

  // Player/parent accounts must link to an existing player record. Player emails aren't unique —
  // siblings often share one family email, and the same real child can have more than one player
  // row (this app ties one coach_id to each row, so "same kid, two academies" is two separate
  // rows too) — so link ALL matches, not just the first, exactly like the self-serve signup path
  // (complete-signup) already does. linkedPlayerId stays the first/primary match (used for the
  // account's active player_id and the welcome email's plan lookup below); linkedPlayerIds holds
  // every match, so the "link" branch further down can create one identity per child instead of
  // silently dropping every sibling but the first.
  let linkedPlayerId: string | undefined;
  let linkedPlayerIds: string[] = [];
  if ((reqData.role === "player" || reqData.role === "parent")) {
    if (!reqData.player_lookup_email) {
      return NextResponse.json({ error: "This request has no linked player email." }, { status: 400 });
    }
    const { data: playerMatches } = await supabase
      .from("players")
      .select("id")
      .ilike("email", reqData.player_lookup_email);
    if (!playerMatches || playerMatches.length === 0) {
      return NextResponse.json({ error: `No player found with email ${reqData.player_lookup_email}. Add the player first, then approve.` }, { status: 400 });
    }
    linkedPlayerIds = playerMatches.map((p) => p.id);
    linkedPlayerId = linkedPlayerIds[0];
  }

  // Coaches who self-signed-up (rather than being invited via the coaches admin UI, which
  // already links coach_id at invite time) still need linking to their own coaches row here —
  // by email match when staff already created one ahead of time. Coach emails aren't guaranteed
  // unique (nothing stops two coach rows sharing one by mistake) — maybeSingle() throws on more
  // than one match, silently dropping the link entirely, so use limit(1) instead. Unlike the
  // player lookup above, a coach with a duplicate email is a data mistake to clean up, not a
  // legitimate multi-match case, so keeping just one here is the right call.
  //
  // A direct self-signup ("Coach" on /signup, no academy involved at all — this app supports
  // genuinely independent coaches on their own Coach Pro plan, not just academy staff) has no
  // coaches row waiting for it, so create one here rather than leaving the account approved with
  // no coach_id — that used to silently produce an orphaned "coach" account invisible on every
  // coaches list and non-functional in the app. academy_id is left null (independent); an academy
  // can always add them to a roster later the normal way.
  let linkedCoachId: string | undefined;
  if (reqData.role === "coach") {
    const { data: coachMatches } = await supabase
      .from("coaches")
      .select("id")
      .ilike("email", reqData.email)
      .limit(1);
    linkedCoachId = coachMatches?.[0]?.id;

    if (!linkedCoachId) {
      const newCoachId = `c_${Date.now()}`;
      const { error: coachInsertError } = await supabase.from("coaches").insert({
        id: newCoachId, name: reqData.name, email: reqData.email, phone: "",
        specialization: "", age_groups_focus: [], location: "", status: "Active",
        joined_date: new Date().toISOString().split("T")[0], certification_level: "Level 1",
        bio: "", academy_id: null, marketplace_visible: false,
      });
      if (coachInsertError) {
        return NextResponse.json({ error: `Could not create coach profile: ${coachInsertError.message}` }, { status: 500 });
      }
      linkedCoachId = newCoachId;
    }
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

    const meta = existingUserData.user.app_metadata ?? {};
    const role = reqData.role as LinkedIdentity["role"];

    // One identity per role for academy_admin/coach (a second one doesn't make sense), but a
    // parent/player can legitimately have several — one per child, per linkedPlayerIds above —
    // so build one candidate identity per matched player instead of a single one; mergeLinkedIdentities
    // dedups each by the full (role, playerId) pair, letting a newly-discovered sibling still get
    // linked later without re-adding a child that's already there.
    let candidateIdentities: LinkedIdentity[];
    if (role === "player" || role === "parent") {
      candidateIdentities = linkedPlayerIds.map((playerId) => ({ role, playerId }));
    } else {
      const identity: LinkedIdentity = { role };
      if (role === "academy_admin" && academyId) identity.academyId = academyId;
      if (linkedCoachId) identity.coachId = linkedCoachId;
      candidateIdentities = [identity];
    }

    const linkedIdentities = mergeLinkedIdentities(meta, candidateIdentities);

    // Only linkedIdentities changes here — the account's currently-active role/links are left
    // untouched, so an approval never silently changes what a logged-in session sees mid-use.
    const { error: linkUpdateError } = await supabase.auth.admin.updateUserById(reqData.existing_user_id, {
      app_metadata: { ...meta, linkedIdentities },
    });
    if (linkUpdateError) return NextResponse.json({ error: linkUpdateError.message }, { status: 400 });

    await supabase.from("user_requests").delete().eq("id", userId);
    return NextResponse.json({ success: true });
  }

  // Find the auth user by email — the stored ID can be a ghost UUID
  // if the email was already registered when they signed up
  const { user: authUser, error: listError } = await findAuthUserByEmail(supabase, reqData.email ?? "");
  if (listError) return NextResponse.json({ error: listError }, { status: 500 });

  if (!authUser) {
    await supabase.from("user_requests").delete().eq("id", userId);
    return NextResponse.json({ error: "No Supabase auth account found for this email. The request has been removed — ask the user to sign up again." }, { status: 404 });
  }

  // Approve: set approved: true, confirm email, and optionally assign academy / linked player
  const extraMeta: Record<string, unknown> = { approved: true };
  if (academyId) extraMeta.academy_id = academyId;
  if (linkedPlayerId) extraMeta.player_id = linkedPlayerId;
  if (linkedCoachId) extraMeta.coach_id = linkedCoachId;
  // Same "link every sibling" fix as above, for the (in practice rare — player/parent normally
  // auto-approves via complete-signup and never reaches this branch) case of a brand-new
  // player/parent request that ended up in the manual queue anyway.
  if (linkedPlayerIds.length > 1) {
    extraMeta.linkedIdentities = linkedPlayerIds.map((playerId) => ({ role: reqData.role, playerId }));
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(authUser.id, {
    app_metadata: extraMeta,
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

    // "What's included" varies by which of the two parallel plan systems this account is on —
    // an academy/coach's org-level plan (plans catalog, free-text includedNotes) vs a player's
    // individual freemium tier (lib/plan-features.ts, structured gates). Pulled fresh here rather
    // than duplicated as copy, so this line can never drift from what the account actually gets.
    let planName: string | undefined;
    let planLines: string[] = [];

    if (reqData.role === "academy_admin" || reqData.role === "coach") {
      let orgAcademyId = academyId as string | undefined;
      if (!orgAcademyId && linkedCoachId) {
        const { data: coachRow } = await supabase.from("coaches").select("academy_id").eq("id", linkedCoachId).maybeSingle();
        orgAcademyId = coachRow?.academy_id ?? undefined;
      }
      if (orgAcademyId) {
        const info = await fetchAcademyPlanInfo(supabase, orgAcademyId);
        planName = info.planName;
        planLines = info.planLines;
      }
    } else if ((reqData.role === "player" || reqData.role === "parent") && linkedPlayerId) {
      const { data: playerRow } = await supabase.from("players").select("sub_plan").eq("id", linkedPlayerId).maybeSingle();
      const tier = (playerRow?.sub_plan as PlanTier | undefined) ?? "Free";
      planName = tier;
      const { data: planRows } = await supabase.from("plans").select("*").eq("active", true);
      const plans = ((planRows as DbPlan[] | null) ?? []).map(dbToPlan);
      planLines = planFeatureLines(tier, plans);
    }

    // Admin-editable copy per role (see /admin/email-templates) — falls back to a generic
    // default if the row is ever missing so approval emails never silently go unsent.
    const { data: templateRow } = await supabase
      .from("email_templates")
      .select("subject, heading, body")
      .eq("id", reqData.role)
      .maybeSingle();
    const vars = { name: reqData.name };
    const subject = templateRow ? renderTemplate(templateRow.subject, vars) : "Your CRIC HQ account has been approved";
    const heading = templateRow ? renderTemplate(templateRow.heading, vars) : `Welcome, ${reqData.name}! 🏏`;
    const bodyText = templateRow ? renderTemplate(templateRow.body, vars) : `Your CRIC HQ account has been approved as a ${roleLabel}.`;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailPass },
    });
    const text = [
      `Hi ${reqData.name},`,
      ``,
      bodyText,
      ``,
      `You can now log in and get started:`,
      `${appUrl}/login`,
      ``,
      `Your role: ${roleLabel}`,
      planName ? `Your plan: ${planName}` : ``,
      ...planLines.map((l) => `- ${l}`),
      ``,
      `— CRIC HQ`,
    ].filter((l, i, arr) => !(l === `` && arr[i - 1] === ``)).join("\n");

    await transporter.sendMail({
      from: emailFrom(gmailUser),
      to: reqData.email,
      subject,
      text,
      html: buildWelcomeEmailHtml({ heading, bodyText, appUrl, planName, planLines }),
    }).catch(() => {
      // Don't fail the approval if email sending fails
    });
  }

  return NextResponse.json({ success: true });
}
