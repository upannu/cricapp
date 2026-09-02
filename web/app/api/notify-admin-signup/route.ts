import nodemailer from "nodemailer";
import { NextResponse } from "next/server";
import { emailFrom } from "@/lib/email-templates";

export async function POST(request: Request) {
  const { name, email, role } = await request.json();

  const gmailUser  = process.env.GMAIL_USER;
  const gmailPass  = process.env.GMAIL_APP_PASSWORD;
  const adminEmail = process.env.PLATFORM_ADMIN_EMAIL;

  // Silently succeed if email isn't configured — don't block registration
  if (!gmailUser || !gmailPass || !adminEmail) {
    return NextResponse.json({ success: true, skipped: true });
  }

  const roleLabel = role === "academy_admin" ? "Academy Admin" : "Coach";
  const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? "https://crichq.com.au";

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailPass },
  });

  const subject = `New ${roleLabel} registration — ${name}`;
  const text = [
    `A new account request has been submitted on CRIC HQ.`,
    ``,
    `Name:  ${name}`,
    `Email: ${email}`,
    `Role:  ${roleLabel}`,
    ``,
    `Review and approve or reject the request here:`,
    `${appUrl}/admin/approvals`,
  ].join("\n");

  // Every new coach/academy_admin registration also goes to support — not just whoever
  // PLATFORM_ADMIN_EMAIL happens to be configured as. Deduped in case they're ever the same
  // address, so support never gets it twice.
  const SUPPORT_EMAIL = "support@crichq.com.au";
  const recipients = [adminEmail.trim(), SUPPORT_EMAIL]
    .filter((e, i, arr) => arr.findIndex((other) => other.toLowerCase() === e.toLowerCase()) === i);

  try {
    await transporter.sendMail({
      from: emailFrom(gmailUser),
      to: recipients.join(", "),
      subject,
      text,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = (err as { message?: string })?.message ?? String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
