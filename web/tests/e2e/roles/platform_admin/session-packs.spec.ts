import { test, expect } from "@playwright/test";

test("session packs page renders the seeded player with no pack purchased", async ({ page }) => {
  await page.goto("/session-packs");

  await expect(page.getByRole("heading", { name: "Session Packs", exact: true })).toBeVisible();
  await expect(page.getByText("E2E Test Player")).toBeVisible();
});
