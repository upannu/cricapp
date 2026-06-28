import nodemailer from "nodemailer";
import { NextResponse } from "next/server";

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
  const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? "https://cricapp-drab.vercel.app";

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailPass },
  });

  const subject = `New ${roleLabel} registration — ${name}`;
  const text = [
    `A new account request has been submitted on PACE HQ.`,
    ``,
    `Name:  ${name}`,
    `Email: ${email}`,
    `Role:  ${roleLabel}`,
    ``,
    `Review and approve or reject the request here:`,
    `${appUrl}/admin/approvals`,
  ].join("\n");

  try {
    await transporter.sendMail({
      from: `"PACE HQ" <${gmailUser}>`,
      to: adminEmail,
      subject,
      text,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = (err as { message?: string })?.message ?? String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
