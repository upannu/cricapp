/**
 * Idempotent seed for the dev Supabase project: creates/updates the 5
 * role-fixture auth users (see fixtures.ts) plus the minimal linked
 * academy/coach/player rows their RBAC checks need. Extend this — and
 * schema-notes.md — in the same PR whenever a new area's tests need more
 * seed data (see AGENTS.md's testing conventions).
 *
 * Usage: npm run seed
 */
import {
  ACADEMY_ID, COACH_ENTITY_ID, FLAGGED_REPORT_ID, PLAYER_ENTITY_ID, ROLE_FIXTURES,
  PACK_TEST_PLAYER_ID, PACK_TEST_PACK_ID, PACK_TEST_BOOKING_ID, REVIEW_TEST_REPORT_ID,
} from "./fixtures";
import { E2E_TEST_PASSWORD, serviceClient } from "./client";

async function upsertAuthUser(supabase: ReturnType<typeof serviceClient>, email: string, userMetadata: Record<string, string>) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: E2E_TEST_PASSWORD,
    email_confirm: true,
    user_metadata: userMetadata,
  });

  if (!error) {
    console.log(`  created ${email} (${data.user.id})`);
    return data.user.id;
  }

  if (!/already.*registered|already.*exists/i.test(error.message)) {
    throw new Error(`Failed to create ${email}: ${error.message}`);
  }

  // Already exists — find it and make sure metadata/password match what we expect.
  const { data: list, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw new Error(`Failed to list users while resolving ${email}: ${listError.message}`);
  const existing = list.users.find((u) => u.email === email);
  if (!existing) throw new Error(`${email} reported as existing but not found via listUsers`);

  const { error: updateError } = await supabase.auth.admin.updateUserById(existing.id, {
    password: E2E_TEST_PASSWORD,
    user_metadata: userMetadata,
  });
  if (updateError) throw new Error(`Failed to update ${email}: ${updateError.message}`);
  console.log(`  updated ${email} (${existing.id})`);
  return existing.id;
}

export async function runSeed() {
  const supabase = serviceClient();
  const today = new Date().toISOString().slice(0, 10);

  console.log("Seeding auth users...");
  for (const fixture of ROLE_FIXTURES) {
    await upsertAuthUser(supabase, fixture.email, fixture.userMetadata);
  }

  console.log("Seeding academy...");
  const { error: academyError } = await supabase.from("academies").upsert(
    {
      id: ACADEMY_ID,
      name: "E2E Test Academy",
      player_ids: [PLAYER_ENTITY_ID],
      player_counts: {},
      start_date: today,
      session_type_fees: {},
    },
    { onConflict: "id" },
  );
  if (academyError) throw new Error(`Failed to seed academy: ${academyError.message}`);

  console.log("Seeding coach...");
  const { error: coachError } = await supabase.from("coaches").upsert(
    {
      id: COACH_ENTITY_ID,
      name: "E2E Test Coach",
      email: "e2e-coach-entity@crichq-test.local",
      age_groups_focus: ["Senior"],
      joined_date: today,
      academy_id: ACADEMY_ID,
    },
    { onConflict: "id" },
  );
  if (coachError) throw new Error(`Failed to seed coach: ${coachError.message}`);

  console.log("Seeding player...");
  const { error: playerError } = await supabase.from("players").upsert(
    {
      id: PLAYER_ENTITY_ID,
      name: "E2E Test Player",
      email: "e2e-player-entity@crichq-test.local",
      added_date: today,
      last_active: today,
      sub_start_date: today,
      sub_end_date: today,
      coach_id: COACH_ENTITY_ID,
      // Free plan (see find-coach.spec.ts, which depends on this player
      // staying on Free to test the marketplace paywall) — 1 assessment
      // credit is seeded instead so video-pipeline.spec.ts can reach the
      // "Use Assessment Credit" report-generation button without a paid plan.
      assessment_credits: 1,
    },
    { onConflict: "id" },
  );
  if (playerError) throw new Error(`Failed to seed player: ${playerError.message}`);

  console.log("Seeding a flagged biomechanics report (for generate-action-plan's E2E smoke test)...");
  const { error: reportError } = await supabase.from("reports").upsert(
    {
      id: FLAGGED_REPORT_ID,
      player_id: PLAYER_ENTITY_ID,
      date: today,
      type: "Biomechanics",
      summary: "E2E fixture report with a flagged, drill-mapped issue.",
      tags: [],
      metrics: {
        metrics: [{ id: "frontKneeFFC", label: "Front Knee Angle", zone: "release", value: 150, unit: "°", score: 60 }],
        zoneScores: { approach: 70, deliveryStride: 65, release: 60, followThrough: 68 },
        flags: ["Front knee collapsing early"],
        flaggedMetricIds: ["frontKneeFFC"],
        overallScore: 65,
      },
      drills: [{ id: "d1", name: "Wall Drill", focus: "Knee brace", description: "Practice bracing the front knee." }],
      injury_risk: "Moderate",
      action_type: "Side-on",
      overall_score: 65,
    },
    { onConflict: "id" },
  );
  if (reportError) throw new Error(`Failed to seed flagged report: ${reportError.message}`);

  console.log("Seeding a not_reviewed report (for the report-review-gate E2E test)...");
  const { error: reviewReportError } = await supabase.from("reports").upsert(
    {
      id: REVIEW_TEST_REPORT_ID,
      player_id: PLAYER_ENTITY_ID,
      date: today,
      type: "Biomechanics",
      summary: "E2E fixture report seeded specifically not_reviewed, for testing the coach-review visibility gate.",
      tags: [],
      injury_risk: "Low",
      action_type: "Side-on",
      overall_score: 70,
      review_status: "not_reviewed",
    },
    { onConflict: "id" },
  );
  if (reviewReportError) throw new Error(`Failed to seed review-test report: ${reviewReportError.message}`);

  console.log("Seeding a second player (pack/booking test fixture)...");
  const { error: packPlayerError } = await supabase.from("players").upsert(
    {
      id: PACK_TEST_PLAYER_ID,
      name: "E2E Pack Test Player",
      email: "e2e-player-packtest-entity@crichq-test.local",
      added_date: today,
      last_active: today,
      sub_start_date: today,
      sub_end_date: today,
      coach_id: COACH_ENTITY_ID,
    },
    { onConflict: "id" },
  );
  if (packPlayerError) throw new Error(`Failed to seed pack-test player: ${packPlayerError.message}`);

  console.log("Seeding an active session pack for the pack-test player (credit-to-pack E2E test)...");
  const { error: packError } = await supabase.from("session_packs").upsert(
    {
      id: PACK_TEST_PACK_ID,
      player_id: PACK_TEST_PLAYER_ID,
      academy_id: ACADEMY_ID,
      session_type: "Net Session",
      purchase_date: today,
      total_sessions: 10,
      sessions_used: 2,
      session_credits: 0,
      fee_per_session: 20,
      status: "Active",
      payment_status: "Paid",
      coach_id: COACH_ENTITY_ID,
    },
    { onConflict: "id" },
  );
  if (packError) throw new Error(`Failed to seed session pack: ${packError.message}`);

  console.log("Seeding a cancelled booking for the pack-test player (credit-to-pack E2E test)...");
  const { error: bookingError } = await supabase.from("bookings").upsert(
    {
      id: PACK_TEST_BOOKING_ID,
      player_id: PACK_TEST_PLAYER_ID,
      coach_id: COACH_ENTITY_ID,
      date: today,
      time: "09:00",
      type: "Individual Coaching",
      status: "Cancelled",
      fee_aud: 0,
      payment_status: "Pending",
    },
    { onConflict: "id" },
  );
  if (bookingError) throw new Error(`Failed to seed cancelled booking: ${bookingError.message}`);

  console.log("Seed complete.");
}

if (require.main === module) {
  runSeed().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
