import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getCaller } from "@/lib/server-auth";
import { sendCoachInviteEmail } from "@/lib/coach-invite";

export async function POST(request: Request) {
  const { email, name, coachId } = await request.json();

  if (!email || !name || !coachId) {
    return NextResponse.json({ error: "Name, email, and coachId are required." }, { status: 400 });
  }

  const caller = await getCaller();
  if (!caller || (caller.role !== "platform_admin" && caller.role !== "academy_admin")) {
    return NextResponse.json({ error: "Only an academy admin or platform admin can invite a coach." }, { status: 403 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: "Server not configured for invites." }, { status: 500 });
  }
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    return NextResponse.json({ error: "Email sending is not configured on this deployment." }, { status: 500 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const result = await sendCoachInviteEmail(supabase, { email, name, coachId, isNewAccount: true, gmailUser, gmailPass });
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({ success: true });
}
