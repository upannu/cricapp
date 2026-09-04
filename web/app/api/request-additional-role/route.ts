import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { findAuthUserByEmail } from "@/lib/server-auth";

interface LinkedIdentity {
  role: string;
  academyId?: string;
  coachId?: string;
  playerId?: string;
}

export async function POST(request: Request) {
  const { name, email, password, role, playerLookupEmail, academyName, academyLocation } = await request.json();
  if (!name || !email || !password || !role) {
    return NextResponse.json({ error: "name, email, password, and role are required." }, { status: 400 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { user: existingUser, error: listError } = await findAuthUserByEmail(supabase, String(email));
  if (listError) return NextResponse.json({ error: listError }, { status: 500 });
  if (!existingUser) {
    return NextResponse.json({ error: "No existing account found for this email." }, { status: 404 });
  }

  // Ownership proof — without this, anyone could type someone else's email and a role of their
  // choosing and get a request queued that, if approved, would grant them access to that
  // person's existing identity. Confirms the submitter actually knows the account's real password.
  const anonClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { error: signInError } = await anonClient.auth.signInWithPassword({ email, password });
  if (signInError) {
    return NextResponse.json({ error: "Incorrect password for this existing account." }, { status: 403 });
  }

  const meta = existingUser.app_metadata ?? {};
  const linkedIdentities = (meta.linkedIdentities as LinkedIdentity[] | undefined) ?? [];
  // player/parent can legitimately request this role again — one per child, and which specific
  // player it resolves to isn't known until approval (see approve-user's per-playerId dedup) —
  // so only academy_admin/coach (one identity of those per account) get blocked here.
  const alreadyHasRole = role !== "player" && role !== "parent" && (
    meta.role === role ||
    linkedIdentities.some((li) => li.role === role)
  );
  if (alreadyHasRole) {
    return NextResponse.json({ error: `You already have a ${role.replace("_", " ")} account with this email — just log in.` }, { status: 409 });
  }

  const { error: insertError } = await supabase.from("user_requests").insert({
    id: `link_${Date.now()}`,
    name,
    email,
    role,
    requested_at: new Date().toISOString(),
    player_lookup_email: playerLookupEmail || null,
    academy_name: academyName || null,
    academy_location: academyLocation || null,
    request_type: "link",
    existing_user_id: existingUser.id,
  });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://crichq.com.au";
  fetch(`${appUrl}/api/notify-admin-signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, role }),
  }).catch(() => {});

  return NextResponse.json({ success: true });
}
