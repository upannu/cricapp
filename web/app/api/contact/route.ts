import nodemailer from "nodemailer";
import { NextResponse } from "next/server";
import { buildContactFormEmailHtml } from "@/lib/email-templates";

/** Public contact form on /contact — no auth required. Delivers to support@crichq.com.au, CC'd to
 * PLATFORM_ADMIN_EMAIL (the same internal-notification address every other admin email in the app
 * already uses), with the visitor's own address set as reply-to so a reply goes straight back to
 * them. */
export async function POST(request: Request) {
  const { name, email, message } = (await request.json()) as { name?: string; email?: string; message?: string };
  if (!name || !email || !message) {
    return NextResponse.json({ error: "Name, email, and message are all required." }, { status: 400 });
  }

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  const adminEmail = process.env.PLATFORM_ADMIN_EMAIL;
  if (!gmailUser || !gmailPass || !adminEmail) {
    return NextResponse.json({ error: "Contact form isn't configured on this deployment." }, { status: 500 });
  }

  const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: gmailUser, pass: gmailPass } });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://crichq.com.au";

  try {
    await transporter.sendMail({
      from: `"CRIC HQ" <${gmailUser}>`,
      to: "support@crichq.com.au",
      cc: adminEmail,
      replyTo: email,
      subject: `Contact form — ${name}`,
      text: [`From: ${name} <${email}>`, ``, message].join("\n"),
      html: buildContactFormEmailHtml({ appUrl, name, email, message }),
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = (err as { message?: string })?.message ?? String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
