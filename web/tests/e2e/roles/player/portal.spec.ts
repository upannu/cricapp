import { test, expect } from "@playwright/test";

test("portal home renders the player's own profile", async ({ page }) => {
  await page.goto("/portal");

  await expect(page.getByText("E2E Test Player")).toBeVisible();
});
