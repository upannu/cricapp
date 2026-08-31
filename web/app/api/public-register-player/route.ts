import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/** Simple shared access codes gating the public registration page at /register — intentionally
 * not a security boundary (no login, no per-parent identity), just enough to keep the form from
 * being wide open to random internet traffic. Hardcoded to this one academy for now; if this
 * needs to work for other academies later, both this map and /app/register/page.tsx would need
 * to become admin-configurable rather than fixed constants. */
const VALID_CODES = new Set(["silverwater", "marsden", "oran"]);
const TARGET_ACADEMY_ID = "ac1786871143102"; // Maz Sheik

const AGE_GROUPS = ["U10", "U11", "U12", "U13", "U14", "U16", "U19", "Senior"];
const BOWLING_STYLES = [
  "Right Arm Fast", "Left Arm Fast", "Right Arm Fast-Medium",
  "Left Arm Fast-Medium", "Right Arm Medium", "Left Arm Medium",
];

/** "Who's registered so far" list shown at the bottom of /register, but only once a code has
 * been entered — and only players registered with that *same* code, not the whole academy roster
 * (someone with the "marsden" code shouldn't see "silverwater"/"oran" registrations). Names and
 * age group only, never email/phone/etc. — same privacy stance as the other public lookup in this
 * app (api/lookup-player). Still requires a valid code, just like the registration form itself.
 *
 * Also returns `pending`: players a coach/staff pre-entered by name for this code (a roster
 * handed to us ahead of time) who haven't had their details completed yet — recognised by having
 * no email on file, since a real completed registration always sets one (see POST below). A
 * parent picks their child from this list instead of registering a duplicate from scratch. */
export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code")?.trim().toLowerCase();
  if (!code || !VALID_CODES.has(code)) {
    return NextResponse.json({ error: "Invalid registration code." }, { status: 403 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: rows } = await supabase
    .from("players")
    .select("id, name, email, age_group, added_date")
    .eq("registration_code", code)
    .order("added_date", { ascending: false });

  const completed = (rows ?? []).filter((p) => !!p.email?.trim());
  const pending = (rows ?? []).filter((p) => !p.email?.trim());

  return NextResponse.json({
    players: completed.map((p) => ({ name: p.name, ageGroup: p.age_group })),
    pending: pending.map((p) => ({ id: p.id, name: p.name })),
  });
}

export async function POST(request: Request) {
  const { code, playerId, name, email, phone, ageGroup, bowlingStyle, club, validateOnly } = (await request.json()) as {
    code?: string; playerId?: string; name?: string; email?: string; phone?: string;
    ageGroup?: string; bowlingStyle?: string; club?: string; validateOnly?: boolean;
  };

  const normalizedCode = code?.trim().toLowerCase();
  if (!normalizedCode || !VALID_CODES.has(normalizedCode)) {
    return NextResponse.json({ error: "Invalid registration code." }, { status: 403 });
  }
  // The code-entry screen checks here first, before showing the actual form — so a wrong code
  // is caught immediately instead of after someone's filled the whole thing out.
  if (validateOnly) return NextResponse.json({ success: true });

  if (!name?.trim()) {
    return NextResponse.json({ error: "Player name is required." }, { status: 400 });
  }
  if (!email?.trim()) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }
  if (!phone?.trim()) {
    return NextResponse.json({ error: "Phone is required." }, { status: 400 });
  }
  // No silent defaulting here — a record only counts as actually registered once a parent has
  // deliberately picked both of these, not whatever the form happened to start on.
  if (!AGE_GROUPS.includes(ageGroup ?? "")) {
    return NextResponse.json({ error: "Please select a valid age group." }, { status: 400 });
  }
  if (!BOWLING_STYLES.includes(bowlingStyle ?? "")) {
    return NextResponse.json({ error: "Please select a valid bowling style." }, { status: 400 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const resolvedAgeGroup = ageGroup!;
  const resolvedBowlingStyle = bowlingStyle!;

  // Completing a pre-entered player (a coach handed us a roster of names ahead of time) — fill in
  // the rest rather than creating a duplicate row. Scoped to this same code so a parent can't
  // complete an arbitrary player id just by guessing one.
  if (playerId) {
    const { data: existing, error: existingError } = await supabase
      .from("players")
      .select("id")
      .eq("id", playerId)
      .eq("registration_code", normalizedCode)
      .maybeSingle();
    if (existingError || !existing) {
      return NextResponse.json({ error: "That player couldn't be found for this code — try registering fresh instead." }, { status: 404 });
    }
    const { error: updateError } = await supabase.from("players").update({
      name: name.trim(), email: email.trim(), phone: phone.trim(),
      bowling_style: resolvedBowlingStyle, age_group: resolvedAgeGroup,
      club: club?.trim() ?? "",
    }).eq("id", playerId);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  const { data: academy, error: academyError } = await supabase
    .from("academies")
    .select("id, player_ids, country, currency")
    .eq("id", TARGET_ACADEMY_ID)
    .single();
  if (academyError || !academy) {
    return NextResponse.json({ error: "Academy not found." }, { status: 500 });
  }

  const id = `p_${Date.now()}`;
  const now = new Date().toISOString().split("T")[0];

  const { error: insertError } = await supabase.from("players").insert({
    id, name: name.trim(), email: email.trim(), phone: phone.trim(),
    bowling_style: resolvedBowlingStyle, age_group: resolvedAgeGroup, club: club?.trim() ?? "",
    coach_id: null, guardian_consent_status: "Pending",
    added_date: now, sessions_count: 0, last_active: now, xp: 0,
    sub_plan: "Free", sub_start_date: now,
    sub_end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    sub_sessions_used: 0, sub_sessions_limit: 4,
    bio_ball_speed_kmh: 0, bio_front_knee_angle_deg: 0, bio_action_type: "Side-on",
    bio_injury_risk: "Low", bio_last_session: now,
    acad_stage: "Foundation", acad_completion_percent: 0, acad_total_sessions: 0,
    acad_xp: 0, acad_articles_read: 0,
    currency: academy.currency ?? "aud",
    registration_code: normalizedCode,
  });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const updatedPlayerIds = [...new Set([...(academy.player_ids ?? []), id])];
  const { error: updateError } = await supabase
    .from("academies")
    .update({ player_ids: updatedPlayerIds })
    .eq("id", TARGET_ACADEMY_ID);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
