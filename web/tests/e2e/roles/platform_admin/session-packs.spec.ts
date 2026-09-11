import { test, expect } from "@playwright/test";

test("memberships page renders the seeded player with no membership purchased", async ({ page }) => {
  await page.goto("/session-packs");

  await expect(page.getByRole("heading", { name: "Memberships", exact: true })).toBeVisible();
  await expect(page.getByText("E2E Test Player")).toBeVisible();
});
