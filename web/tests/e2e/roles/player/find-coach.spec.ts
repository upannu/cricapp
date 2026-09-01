import { test, expect } from "@playwright/test";

// The seeded e2e-player is on the Free plan, so this correctly exercises
// canUseMarketplace's paywall gate (lib/plan-features.ts, unit-tested in
// Batch 0) end-to-end rather than the full marketplace UI — a real Player
// Pro player would see the coach list/search instead.
test("find-coach page gates the marketplace behind Player Pro for a Free-plan player", async ({ page }) => {
  await page.goto("/portal/find-coach");

  await expect(page.getByText("Find a Coach is a Player Pro feature")).toBeVisible();
  await expect(page.getByRole("link", { name: "View Upgrade Options" })).toBeVisible();
});
