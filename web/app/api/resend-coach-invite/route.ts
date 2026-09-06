import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getCaller, findAuthUserByEmail } from "@/lib/server-auth";
import { sendCoachInviteEmail } from "@/lib/coach-invite";

/**
 * Re-fires a coach's invite — for one who never completed signup (email bounced, got lost, or
 * they just never got around to it) and has no other way to get a fresh link today. Reuses
 * sendCoachInviteEmail, same as the at-creation invite in api/invite-coach — the only difference
 * is whether the account already exists (generateLink's type: "recovery" for one that does,
 * "invite" — which creates it — for one that doesn't, e.g. a coach added without checking "Send
 * invite" at the time).
 */
export async function POST(request: Request) {
  const { coachId } = (await request.json()) as { coachId?: string };
  if (!coachId) return NextResponse.json({ error: "coachId is required." }, { status: 400 });

  const caller = await getCaller();
  if (!caller || (caller.role !== "platform_admin" && caller.role !== "academy_admin")) {
    return NextResponse.json({ error: "Only an academy admin or platform admin can resend a coach invite." }, { status: 403 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
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

  const { data: coach } = await supabase.from("coaches").select("id, name, email").eq("id", coachId).maybeSingle();
  if (!coach) return NextResponse.json({ error: "Coach not found." }, { status: 404 });
  if (!coach.email) return NextResponse.json({ error: "This coach has no email on file to invite." }, { status: 400 });

  const { user: existing, error: lookupError } = await findAuthUserByEmail(supabase, coach.email as string);
  if (lookupError) return NextResponse.json({ error: lookupError }, { status: 500 });

  const result = await sendCoachInviteEmail(supabase, {
    email: coach.email as string, name: coach.name as string, coachId: coach.id as string,
    isNewAccount: !existing, gmailUser, gmailPass,
  });
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({ success: true });
}
