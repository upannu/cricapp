import { test, expect } from "@playwright/test";

test("players page renders the seeded player", async ({ page }) => {
  await page.goto("/players");

  await expect(page.getByRole("heading", { name: "Players", exact: true })).toBeVisible();
  await expect(page.getByText("E2E Test Player")).toBeVisible();
});
