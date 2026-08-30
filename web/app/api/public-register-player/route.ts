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
 * app (api/lookup-player). Still requires a valid code, just like the registration form itself. */
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

  const { data: players } = await supabase
    .from("players")
    .select("name, age_group, added_date")
    .eq("registration_code", code)
    .order("added_date", { ascending: false });

  return NextResponse.json({
    players: (players ?? []).map((p) => ({ name: p.name, ageGroup: p.age_group })),
  });
}

export async function POST(request: Request) {
  const { code, name, email, phone, ageGroup, bowlingStyle, club, validateOnly } = (await request.json()) as {
    code?: string; name?: string; email?: string; phone?: string;
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

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

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
  const resolvedAgeGroup = AGE_GROUPS.includes(ageGroup ?? "") ? ageGroup! : "U10";
  const resolvedBowlingStyle = BOWLING_STYLES.includes(bowlingStyle ?? "") ? bowlingStyle! : "Right Arm Fast";

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
