/**
 * Deletes all e2e-prefixed DB rows, then re-seeds — run before each E2E pass
 * so runs are deterministic regardless of what a previous run's tests
 * mutated. Never touches the auth users themselves (recreating those per run
 * is wasteful; seed.ts already keeps their metadata/password in sync).
 *
 * Usage: npm run seed:reset
 */
import { E2E_PREFIX, serviceClient } from "./client";
import { runSeed } from "./seed";

// Deletion order matters: coaches.academy_id is a real FK to academies, so
// coaches must go before academies. players.coach_id has no DB-level FK
// (app-level reference only, per schema-notes.md), so its order relative to
// coaches doesn't matter, but it's deleted first for clarity.
const TABLES_IN_DELETE_ORDER = ["players", "coaches", "academies"] as const;

async function main() {
  const supabase = serviceClient();

  for (const table of TABLES_IN_DELETE_ORDER) {
    const { error } = await supabase.from(table).delete().like("id", `${E2E_PREFIX}%`);
    if (error) throw new Error(`Failed to reset ${table}: ${error.message}`);
    console.log(`Reset ${table}`);
  }

  await runSeed();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
