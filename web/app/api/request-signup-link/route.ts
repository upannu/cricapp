import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { findAuthUserByEmail } from "@/lib/server-auth";
import { buildSignupConfirmEmailHtml, emailFrom } from "@/lib/email-templates";

const LOOKUP_ROLES = ["player", "parent"];

/**
 * Replaces the old signUp() + complete-signup pair for player/parent roles — the two roles that
 * require typing someone else's (a child's) already-registered email to link against.
 *
 * The old flow ran a live, unauthenticated "does this email match a player?" check on every
 * keystroke (see the now-deleted /api/lookup-player) and surfaced the answer — found/not-found,
 * even a sibling count — straight in the browser. That's a real enumeration oracle: anyone, no
 * login and no rate limit, could learn whether an arbitrary stranger's email has children
 * registered on this platform and how many, just by typing it in.
 *
 * This route closes that: it always responds identically regardless of whether playerLookupEmail
 * matches anything, and the only place the actual answer becomes visible is an email sent to
 * playerLookupEmail itself — reaching only someone who already has access to that inbox. No match
 * means no email, no account, and no trace of the attempt.
 */
export async function POST(request: Request) {
  const { name, email, password, role, playerLookupEmail } = (await request.json()) as {
    name?: string; email?: string; password?: string; role?: string; playerLookupEmail?: string;
  };

  if (!name?.trim() || !email?.trim() || !password || !role || !playerLookupEmail?.trim()) {
    return NextResponse.json({ error: "name, email, password, role, and playerLookupEmail are required." }, { status: 400 });
  }
  if (!LOOKUP_ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  // Checked up front, before touching the lookup — a constant, deployment-wide answer that never
  // depends on which email was submitted, so failing loudly here can't leak anything per-request.
  if (!gmailUser || !gmailPass) {
    return NextResponse.json({ error: "Email sending is not configured on this deployment." }, { status: 500 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { user: existing, error: existingError } = await findAuthUserByEmail(supabase, email);
  if (existingError) return NextResponse.json({ error: existingError }, { status: 500 });
  if (existing) {
    // Unlike playerLookupEmail, this is the submitter's own account email — revealing that it's
    // already taken is the same, already-accepted pattern used elsewhere in this form (the live
    // check on the account-email field itself), not the leak this route exists to close.
    return NextResponse.json({ error: "This email already has an account. Sign in instead, or use 'request an additional role' from your account settings." }, { status: 409 });
  }

  const { data: playerMatches } = await supabase
    .from("players")
    .select("id")
    .ilike("email", playerLookupEmail);

  if (playerMatches && playerMatches.length > 0) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://crichq.com.au";
    // Best-effort from here — any failure (link generation, the metadata update, the send) still
    // falls through to the same generic response below. Logged for operability, never surfaced.
    try {
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: "signup",
        email,
        password,
        options: { data: { name } },
      });
      if (linkError || !linkData?.user) throw linkError ?? new Error("generateLink returned no user.");

      const appMetadata: Record<string, unknown> = { role, approved: true, player_id: playerMatches[0].id };
      if (playerMatches.length > 1) {
        appMetadata.linkedIdentities = playerMatches.map((p) => ({ role, playerId: p.id }));
      }
      const { error: metaError } = await supabase.auth.admin.updateUserById(linkData.user.id, { app_metadata: appMetadata });
      if (metaError) throw metaError;

      // Points at this app's own /auth/confirm (verifyOtp under the hood) rather than
      // linkData.properties.action_link — that link goes through Supabase's hosted redirect,
      // which hands back an implicit-flow fragment this app's PKCE-only browser client can't
      // consume (see /auth/confirm/route.ts's own comment for the full story).
      const confirmUrl = `${appUrl}/auth/confirm?token_hash=${encodeURIComponent(linkData.properties.hashed_token)}&type=${linkData.properties.verification_type}&next=/portal`;

      const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: gmailUser, pass: gmailPass } });
      await transporter.sendMail({
        from: emailFrom(gmailUser),
        to: playerLookupEmail,
        subject: "Confirm your CRIC HQ account",
        text: `${name} wants to create a CRIC HQ account linked to the player(s) registered at this email address. If that's you, confirm here to finish setting it up:\n\n${confirmUrl}\n\n— CRIC HQ`,
        html: buildSignupConfirmEmailHtml({ appUrl, name, confirmUrl }),
      });
    } catch (err) {
      console.error("request-signup-link: failed to complete the matched-email branch:", err);
    }
  }

  // Identical response whether or not anything matched — this line is the entire point of the
  // route. Naming playerLookupEmail back is fine (the submitter already knows what they typed);
  // it's the found/not-found signal itself that must never differ.
  return NextResponse.json({
    success: true,
    message: `If ${playerLookupEmail} matches a player on file, we've sent instructions there to finish creating your account.`,
  });
}
