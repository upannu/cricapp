import { describe, expect, test } from "vitest";
import {
  aiReportsIncludedForPlayer,
  canGenerateAiReports,
  canUseMarketplace,
  chatMessagesLimitForPlan,
  isUnlimited,
  sessionsLimitForPlan,
} from "@/lib/plan-features";
import { makeAcademy, makeCoach, makePlayer } from "../../mocks/fixtures";

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

  describe("aiReportsIncludedForPlayer", () => {
    // Shared by SessionsClient (staff) and PortalClient (the player/parent themselves) so both
    // sides of the paywall agree on when a report is actually included.
    const waivedPlan = {
      id: "board-plan", slug: "board", name: "Board", audience: "organization" as const,
      billingType: "subscription" as const, billingInterval: "year" as const, priceAud: 850000,
      pricesByCurrency: {}, seatCap: null, accessDurationMonths: null, includedNotes: null,
      waivesSessionFees: true, platformAdminOnly: false, platformFeePercent: 10, active: true,
      sortOrder: 0, sessionsPerMonthLimit: null, chatMessagesPerDayLimit: null,
      aiReportsEnabled: true, marketplaceEnabled: true, locked: false,
    };

    test("a Free player with no academy or coach is not included", () => {
      const player = makePlayer({ subscription: { plan: "Free", startDate: "2026-01-01", endDate: "2027-01-01", sessionsUsed: 0, sessionsLimit: 1 } });
      expect(aiReportsIncludedForPlayer(player, [], [], [])).toBe(false);
    });

    test("a Player Pro player is always included, academy/coach irrelevant", () => {
      const player = makePlayer({ subscription: { plan: "Player Pro", startDate: "2026-01-01", endDate: "2027-01-01", sessionsUsed: 0, sessionsLimit: null } });
      expect(aiReportsIncludedForPlayer(player, [], [], [])).toBe(true);
    });

    test("a Free player at a fees-waived academy is included, within the access window", () => {
      const player = makePlayer({ id: "p1", subscription: { plan: "Free", startDate: "2026-01-01", endDate: "2027-01-01", sessionsUsed: 0, sessionsLimit: 1 } });
      const academy = makeAcademy({ playerIds: ["p1"], planId: "board-plan" });
      expect(aiReportsIncludedForPlayer(player, [waivedPlan], [academy], [])).toBe(true);
    });

    test("a Free player at a fees-waived academy is NOT included once the access window has lapsed", () => {
      const player = makePlayer({ id: "p1", subscription: { plan: "Free", startDate: "2026-01-01", endDate: "2027-01-01", sessionsUsed: 0, sessionsLimit: 1 } });
      const academy = makeAcademy({ playerIds: ["p1"], planId: "board-plan", accessExpiresAt: "2020-01-01T00:00:00.000Z" });
      const timeLimitedPlan = { ...waivedPlan, accessDurationMonths: 12 };
      expect(aiReportsIncludedForPlayer(player, [timeLimitedPlan], [academy], [])).toBe(false);
    });

    test("a Free player coached by an independent Coach Pro coach is included", () => {
      const player = makePlayer({ coachId: "c1", subscription: { plan: "Free", startDate: "2026-01-01", endDate: "2027-01-01", sessionsUsed: 0, sessionsLimit: 1 } });
      const coach = makeCoach({ id: "c1", academyId: "", subPlan: "Coach Pro" });
      expect(aiReportsIncludedForPlayer(player, [], [], [coach])).toBe(true);
    });

    test("an academy-employed coach's own Coach Pro status does NOT extend to their players", () => {
      const player = makePlayer({ coachId: "c1", subscription: { plan: "Free", startDate: "2026-01-01", endDate: "2027-01-01", sessionsUsed: 0, sessionsLimit: 1 } });
      const coach = makeCoach({ id: "c1", academyId: "ac1", subPlan: "Coach Pro" });
      expect(aiReportsIncludedForPlayer(player, [], [], [coach])).toBe(false);
    });
  });
});
