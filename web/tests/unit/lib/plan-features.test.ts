import { describe, expect, test } from "vitest";
import {
  canGenerateAiReports,
  canUseMarketplace,
  chatMessagesLimitForPlan,
  isUnlimited,
  sessionsLimitForPlan,
} from "@/lib/plan-features";

describe("plan-features", () => {
  test("Free tier is capped and gated", () => {
    expect(canGenerateAiReports("Free")).toBe(false);
    expect(canUseMarketplace("Free")).toBe(false);
    expect(sessionsLimitForPlan("Free")).toBe(4);
    expect(chatMessagesLimitForPlan("Free")).toBe(3);
    expect(isUnlimited(sessionsLimitForPlan("Free"))).toBe(false);
  });

  test("Player Pro unlocks AI reports and marketplace, removes caps", () => {
    expect(canGenerateAiReports("Player Pro")).toBe(true);
    expect(canUseMarketplace("Player Pro")).toBe(true);
    expect(sessionsLimitForPlan("Player Pro")).toBeNull();
    expect(chatMessagesLimitForPlan("Player Pro")).toBeNull();
    expect(isUnlimited(sessionsLimitForPlan("Player Pro"))).toBe(true);
  });

  test("Coach Pro retains everything Player Pro unlocks", () => {
    expect(canGenerateAiReports("Coach Pro")).toBe(true);
    expect(canUseMarketplace("Coach Pro")).toBe(true);
    expect(sessionsLimitForPlan("Coach Pro")).toBeNull();
  });
});
