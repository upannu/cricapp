import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export async function POST(request: Request) {
  const { articleId } = await request.json();
  if (!articleId) return NextResponse.json({ error: "articleId required." }, { status: 400 });

  // Only a platform admin may trigger a broadcast to every player.
  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user: caller } } = await authClient.auth.getUser();
  if (caller?.user_metadata?.role !== "platform_admin") {
    return NextResponse.json({ error: "Only a platform admin can broadcast new content." }, { status: 403 });
  }

  const gmailUser  = process.env.GMAIL_USER;
  const gmailPass  = process.env.GMAIL_APP_PASSWORD;
  const appUrl     = process.env.NEXT_PUBLIC_APP_URL ?? "https://cricapp-drab.vercel.app";

  // Silently succeed if email isn't configured (including the .env.local placeholder
  // value) — don't block publishing or waste a real SMTP round-trip on known-bad creds.
  if (!gmailUser || !gmailPass || gmailUser === "REPLACE_ME" || gmailPass === "REPLACE_ME") {
    return NextResponse.json({ success: true, skipped: true });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ success: true, skipped: true });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: article, error: articleError } = await supabase
    .from("articles")
    .select("title, stage")
    .eq("id", articleId)
    .single();
  if (articleError || !article) {
    return NextResponse.json({ error: "Article not found." }, { status: 404 });
  }

  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("email")
    .not("email", "is", null);
  if (playersError) return NextResponse.json({ error: playersError.message }, { status: 500 });

  const recipients = Array.from(new Set((players ?? []).map((p) => p.email).filter((e): e is string => !!e?.trim())));
  if (recipients.length === 0) {
    return NextResponse.json({ success: true, skipped: true, reason: "No player emails on file." });
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailPass },
  });

  const text = [
    `A new Academy lesson just dropped on PACE HQ:`,
    ``,
    `"${article.title}" (${article.stage} stage)`,
    ``,
    `Read it here:`,
    `${appUrl}/portal/learn/${articleId}`,
    ``,
    `— PACE HQ`,
  ].join("\n");

  try {
    await transporter.sendMail({
      from: `"PACE HQ" <${gmailUser}>`,
      to: gmailUser,
      bcc: recipients,
      subject: `New Academy Lesson: ${article.title}`,
      text,
    });
    return NextResponse.json({ success: true, recipientCount: recipients.length });
  } catch (err) {
    const msg = (err as { message?: string })?.message ?? String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
