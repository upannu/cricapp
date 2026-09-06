import type { SupabaseClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { renderTemplate, buildWelcomeEmailHtml, emailFrom } from "@/lib/email-templates";

/**
 * Shared by /api/invite-coach (new coach, invited right after creation) and
 * /api/resend-coach-invite (an existing coach who never completed signup, or lost the email).
 * Both need the exact same real mechanics — generate a valid link, send it via this app's own
 * admin-editable template — so this is one implementation instead of two that can drift apart.
 *
 * Doesn't use supabase.auth.admin.inviteUserByEmail()'s own redirectTo/action_link — that goes
 * through Supabase's hosted /auth/v1/verify redirect, which hands back an implicit-flow callback
 * this app's PKCE-only browser client can't consume (see /auth/confirm/route.ts's own comment for
 * the full story) — same reason api/request-signup-link builds its own /auth/confirm URL instead.
 *
 * Assumes the caller has already checked GMAIL_USER/GMAIL_APP_PASSWORD are configured — that's a
 * constant, deployment-wide condition, not something specific to one invite, so both call sites
 * check it themselves up front (consistent with how every other route in this app that sends mail
 * fails on missing config before doing any real work).
 */
export async function sendCoachInviteEmail(
  supabase: SupabaseClient,
  opts: { email: string; name: string; coachId: string; isNewAccount: boolean; gmailUser: string; gmailPass: string },
): Promise<{ success: boolean; error?: string }> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://crichq.com.au";

  const { data: linkData, error: linkError } = opts.isNewAccount
    ? await supabase.auth.admin.generateLink({
        type: "invite",
        email: opts.email,
        options: { data: { name: opts.name } },
      })
    : await supabase.auth.admin.generateLink({ type: "recovery", email: opts.email });
  if (linkError || !linkData?.user) return { success: false, error: linkError?.message ?? "Could not generate an invite link." };

  if (opts.isNewAccount) {
    // Without this, an invited coach's login never resolves to their own coaches row — under
    // real RLS that means seeing no players, no sessions, nothing.
    const { error: metaError } = await supabase.auth.admin.updateUserById(linkData.user.id, {
      app_metadata: { role: "coach", approved: true, coach_id: opts.coachId },
    });
    if (metaError) return { success: false, error: metaError.message };
  }

  const { data: templateRow } = await supabase
    .from("email_templates")
    .select("subject, heading, body")
    .eq("id", "coach_invite")
    .maybeSingle();
  const vars = { name: opts.name };
  const subject = templateRow ? renderTemplate(templateRow.subject, vars) : "You're invited to CRIC HQ";
  const heading = templateRow ? renderTemplate(templateRow.heading, vars) : `Welcome, ${opts.name}! 🏏`;
  const bodyText = templateRow
    ? renderTemplate(templateRow.body, vars)
    : "You've been added as a coach on CRIC HQ. Click below to set your password and get started.";

  const confirmUrl = `${appUrl}/auth/confirm?token_hash=${encodeURIComponent(linkData.properties.hashed_token)}&type=${linkData.properties.verification_type}&next=/reset-password`;

  const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: opts.gmailUser, pass: opts.gmailPass } });
  try {
    await transporter.sendMail({
      from: emailFrom(opts.gmailUser),
      to: opts.email,
      subject,
      text: `${bodyText}\n\n${confirmUrl}\n\n— CRIC HQ`,
      html: buildWelcomeEmailHtml({ heading, bodyText, appUrl, planLines: [], ctaLabel: "Set your password", ctaHref: confirmUrl }),
    });
  } catch (err) {
    return { success: false, error: (err as { message?: string })?.message ?? "Could not send the invite email." };
  }

  return { success: true };
}
