import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export async function POST(request: Request) {
  const { userId } = await request.json();
  if (!userId) return NextResponse.json({ error: "userId required." }, { status: 400 });

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
    .select("email, name, role")
    .eq("id", userId)
    .single();

  if (reqError || !reqData) {
    return NextResponse.json({ error: "Request not found in queue." }, { status: 404 });
  }

  // Find the auth user by email — the stored ID can be a ghost UUID
  // if the email was already registered when they signed up
  const { data: listData, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listError) return NextResponse.json({ error: listError.message }, { status: 500 });

  const authUser = listData.users.find((u) => u.email === reqData.email);

  if (!authUser) {
    await supabase.from("user_requests").delete().eq("id", userId);
    return NextResponse.json({ error: "No Supabase auth account found for this email. The request has been removed — ask the user to sign up again." }, { status: 404 });
  }

  // Approve: set approved: true and confirm email so they can log in immediately
  const { error: updateError } = await supabase.auth.admin.updateUserById(authUser.id, {
    user_metadata: { approved: true },
    email_confirm: true,
  });
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });

  // Remove from pending queue
  await supabase.from("user_requests").delete().eq("id", userId);

  // Send approval email to the user
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? "https://cricapp-drab.vercel.app";

  if (gmailUser && gmailPass) {
    const roleLabel = reqData.role === "academy_admin" ? "Academy Admin" : "Coach";
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
