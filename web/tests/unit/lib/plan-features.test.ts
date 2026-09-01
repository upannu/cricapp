import { describe, expect, test } from "vitest";
import {
  canGenerateAiReports,
  canUseMarketplace,
  chatMessagesLimitForPlan,
  isUnlimited,
  sessionsLimitForPlan,
} from "@/lib/plan-features";

// Every function now takes the caller's already-fetched Plan Catalog rows as a 2nd argument
// (see lib/plan-features.ts) instead of querying the catalog itself. An empty array here
// exercises each function's own built-in fallback (no matching catalog row found), which is
// deliberately the same Free-capped / paid-unlimited defaults these tests were already asserting
// — so passing [] preserves this test's original intent unchanged.
const NO_PLANS: [] = [];

describe("plan-features", () => {
  test("Free tier is capped and gated", () => {
    expect(canGenerateAiReports("Free", NO_PLANS)).toBe(false);
    expect(canUseMarketplace("Free", NO_PLANS)).toBe(false);
    expect(sessionsLimitForPlan("Free", NO_PLANS)).toBe(4);
    expect(chatMessagesLimitForPlan("Free", NO_PLANS)).toBe(3);
    expect(isUnlimited(sessionsLimitForPlan("Free", NO_PLANS))).toBe(false);
  });

  test("Player Pro unlocks AI reports and marketplace, removes caps", () => {
    expect(canGenerateAiReports("Player Pro", NO_PLANS)).toBe(true);
    expect(canUseMarketplace("Player Pro", NO_PLANS)).toBe(true);
    expect(sessionsLimitForPlan("Player Pro", NO_PLANS)).toBeNull();
    expect(chatMessagesLimitForPlan("Player Pro", NO_PLANS)).toBeNull();
    expect(isUnlimited(sessionsLimitForPlan("Player Pro", NO_PLANS))).toBe(true);
  });

  test("Coach Pro retains everything Player Pro unlocks", () => {
    expect(canGenerateAiReports("Coach Pro", NO_PLANS)).toBe(true);
    expect(canUseMarketplace("Coach Pro", NO_PLANS)).toBe(true);
    expect(sessionsLimitForPlan("Coach Pro", NO_PLANS)).toBeNull();
  });
});
