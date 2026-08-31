import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { buildWelcomeEmailHtml } from "@/lib/email-templates";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Fires right after a staff member (academy_admin/coach) creates a player in the Academy admin
 * UI — single add or CSV import (see AcademyClient.tsx). Best-effort: a player row is created
 * either way, this only invites them to self-serve create an account (auto-approved instantly,
 * see /api/complete-signup) using the same email address. */
export async function POST(request: Request) {
  const { playerId, academyId } = (await request.json()) as { playerId?: string; academyId?: string };
  if (!playerId) return NextResponse.json({ error: "playerId is required." }, { status: 400 });

  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user: caller } } = await authClient.auth.getUser();
  const callerRole = caller?.app_metadata?.role;
  if (!caller || !["platform_admin", "academy_admin", "coach"].includes(callerRole as string)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: player } = await supabase.from("players").select("name, email").eq("id", playerId).maybeSingle();
  if (!player?.email || !EMAIL_RE.test(player.email)) {
    return NextResponse.json({ success: true, skipped: "no valid email" });
  }

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) return NextResponse.json({ success: true, skipped: "email not configured" });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://crichq.com.au";

  let academyName: string | undefined;
  if (academyId) {
    const { data: academy } = await supabase.from("academies").select("name").eq("id", academyId).maybeSingle();
    academyName = academy?.name;
  }

  const intro = academyName
    ? `${academyName} has added you as a player on CRIC HQ, the platform they use to track sessions, bookings, and biomechanics progress.`
    : `You've been added as a player on CRIC HQ, the platform your academy uses to track sessions, bookings, and biomechanics progress.`;
  const bodyText = `${intro}\n\nCreate your account using this email address (${player.email}) to get instant access — no approval wait.`;

  // Player role pre-selected, email pre-filled on both the lookup and account-email fields — the
  // player only has to type a password. See app/signup/page.tsx's PREFILLABLE_ROLES handling.
  const signupUrl = `${appUrl}/signup?role=player&email=${encodeURIComponent(player.email)}&name=${encodeURIComponent(player.name)}`;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailPass },
  });

  await transporter.sendMail({
    from: `"CRIC HQ" <${gmailUser}>`,
    to: player.email,
    subject: "You've been added to CRIC HQ",
    text: `Hi ${player.name},\n\n${bodyText}\n\nCreate your account:\n${signupUrl}\n\n— CRIC HQ`,
    html: buildWelcomeEmailHtml({
      heading: `Welcome to CRIC HQ, ${player.name}! 🏏`,
      bodyText,
      appUrl,
      planLines: [],
      ctaLabel: "Create your account",
      ctaHref: signupUrl,
    }),
  }).catch(() => {
    // Best-effort — the player row already exists either way.
  });

  return NextResponse.json({ success: true });
}
