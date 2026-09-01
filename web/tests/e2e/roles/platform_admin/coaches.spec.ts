import { test, expect } from "@playwright/test";

test("coaches page renders the seeded coach", async ({ page }) => {
  await page.goto("/coaches");

  await expect(page.getByRole("heading", { name: "Coaches", exact: true })).toBeVisible();
  await expect(page.getByText("E2E Test Coach")).toBeVisible();
});
