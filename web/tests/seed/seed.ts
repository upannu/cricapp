/**
 * Idempotent seed for the dev Supabase project: creates/updates the 5
 * role-fixture auth users (see fixtures.ts) plus the minimal linked
 * academy/coach/player rows their RBAC checks need. Extend this — and
 * schema-notes.md — in the same PR whenever a new area's tests need more
 * seed data (see AGENTS.md's testing conventions).
 *
 * Usage: npm run seed
 */
import { ACADEMY_ID, COACH_ENTITY_ID, PLAYER_ENTITY_ID, ROLE_FIXTURES } from "./fixtures";
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
    },
    { onConflict: "id" },
  );
  if (playerError) throw new Error(`Failed to seed player: ${playerError.message}`);

  console.log("Seed complete.");
}

if (require.main === module) {
  runSeed().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
