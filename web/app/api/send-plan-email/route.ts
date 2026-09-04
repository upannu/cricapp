import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getCaller, listAllAuthUsers } from "@/lib/server-auth";
import { fetchAcademyPlanInfo } from "@/lib/plan-email";
import { buildPlanDetailsEmailHtml, emailFrom } from "@/lib/email-templates";

/** On-demand resend of "what's included in your plan" — for when an academy asks again after the
 * one-time approval email. Reuses the exact same plan lookup (fetchAcademyPlanInfo) so the content
 * can never drift from what the welcome email originally said. Emails every academy_admin on file
 * for the academy, not just the caller, since a platform admin may be triggering this on a
 * customer's behalf rather than the admin doing it themselves. */
export async function POST(request: Request) {
  const { academyId } = (await request.json()) as { academyId?: string };
  if (!academyId) return NextResponse.json({ error: "academyId is required." }, { status: 400 });

  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const canTrigger = caller.role === "platform_admin" || (caller.role === "academy_admin" && caller.academyId === academyId);
  if (!canTrigger) {
    return NextResponse.json({ error: "You don't have access to this academy's plan." }, { status: 403 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: academy } = await supabase.from("academies").select("name").eq("id", academyId).maybeSingle();
  if (!academy) return NextResponse.json({ error: "Academy not found." }, { status: 404 });

  const { planName, planLines } = await fetchAcademyPlanInfo(supabase, academyId);
  if (planLines.length === 0) {
    return NextResponse.json({ error: "This academy has no plan assigned yet — nothing to send." }, { status: 400 });
  }

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    return NextResponse.json({ error: "Email sending is not configured on this deployment." }, { status: 500 });
  }

  // Every academy_admin on file for this academy — usually one person, but a platform admin
  // triggering this on a customer's behalf shouldn't have to know exactly who that is.
  const { users: allUsers, error: listError } = await listAllAuthUsers(supabase);
  if (listError) return NextResponse.json({ error: listError }, { status: 500 });
  const recipients = allUsers.filter(
    (u) => u.app_metadata?.role === "academy_admin" && u.app_metadata?.academy_id === academyId && u.email,
  );
  if (recipients.length === 0) {
    return NextResponse.json({ error: "No academy admin account found for this academy." }, { status: 404 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://crichq.com.au";
  const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: gmailUser, pass: gmailPass } });

  const text = [
    `Hi,`,
    ``,
    `Here's a summary of ${academy.name}'s current CRIC HQ plan${planName ? ` (${planName})` : ""}:`,
    ``,
    ...planLines.map((l) => `- ${l}`),
    ``,
    `${appUrl}/login`,
    ``,
    `— CRIC HQ`,
  ].join("\n");
  const html = buildPlanDetailsEmailHtml({ name: "there", academyName: academy.name, appUrl, planName, planLines });

  let sent = 0;
  for (const recipient of recipients) {
    await transporter.sendMail({
      from: emailFrom(gmailUser),
      to: recipient.email!,
      subject: `Your CRIC HQ plan — ${academy.name}`,
      text,
      html: html.replace(">there<", `>${(recipient.user_metadata?.name as string) ?? "there"}<`),
    }).then(() => { sent++; }).catch(() => {
      // Best-effort per recipient — one bad address shouldn't block the others
    });
  }

  if (sent === 0) return NextResponse.json({ error: "Failed to send to any recipient." }, { status: 502 });
  return NextResponse.json({ success: true, sent });
}
