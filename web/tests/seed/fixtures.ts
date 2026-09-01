import { E2E_PREFIX } from "./client";

/** Fixed IDs for the minimal linked dataset every E2E role needs. Extended per-batch as more areas get covered. */
export const ACADEMY_ID = `${E2E_PREFIX}academy`;
export const COACH_ENTITY_ID = `${E2E_PREFIX}coach`;
export const PLAYER_ENTITY_ID = `${E2E_PREFIX}player`;
/** A report with a flagged, drill-mapped issue — generate-action-plan's E2E smoke test needs one to exist. */
export const FLAGGED_REPORT_ID = `${E2E_PREFIX}report-flagged`;

/**
 * A second, lightweight player under the same coach — used for tests that need to mutate
 * pack/booking state (credit-to-pack, bulk messaging) without disturbing PLAYER_ENTITY_ID,
 * which several other specs (find-coach.spec.ts, session-packs.spec.ts, video-pipeline.spec.ts)
 * depend on staying in a specific plan/pack/credit state.
 */
export const PACK_TEST_PLAYER_ID = `${E2E_PREFIX}player-packtest`;
export const PACK_TEST_PACK_ID = `${E2E_PREFIX}pack-packtest`;
export const PACK_TEST_BOOKING_ID = `${E2E_PREFIX}booking-packtest`;
/** A report seeded specifically not_reviewed, for testing the coach-review visibility gate without touching FLAGGED_REPORT_ID (used by generate-action-plan.spec.ts). */
export const REVIEW_TEST_REPORT_ID = `${E2E_PREFIX}report-review-test`;

export type E2eRole = "platform_admin" | "academy_admin" | "coach" | "player" | "parent";

export interface RoleFixture {
  role: E2eRole;
  email: string;
  /** Matches what lib/server-auth.ts's getCaller() reads out of user_metadata. */
  userMetadata: Record<string, string>;
}

/**
 * The 5 auth users every E2E role-based test authenticates as (see
 * tests/e2e/auth.setup.ts). Metadata shapes must match exactly what
 * lib/server-auth.ts's getCaller() reads (role/academy_id/coach_id/player_id)
 * — that's the whole RBAC mechanism, there's no separate roles table.
 */
export const ROLE_FIXTURES: RoleFixture[] = [
  {
    role: "platform_admin",
    email: `${E2E_PREFIX}platform-admin@crichq-test.local`,
    userMetadata: { role: "platform_admin" },
  },
  {
    role: "academy_admin",
    email: `${E2E_PREFIX}academy-admin@crichq-test.local`,
    userMetadata: { role: "academy_admin", academy_id: ACADEMY_ID },
  },
  {
    role: "coach",
    email: `${E2E_PREFIX}coach@crichq-test.local`,
    userMetadata: { role: "coach", coach_id: COACH_ENTITY_ID },
  },
  {
    role: "player",
    email: `${E2E_PREFIX}player@crichq-test.local`,
    userMetadata: { role: "player", player_id: PLAYER_ENTITY_ID },
  },
  {
    role: "parent",
    email: `${E2E_PREFIX}parent@crichq-test.local`,
    userMetadata: { role: "parent", player_id: PLAYER_ENTITY_ID },
  },
];
