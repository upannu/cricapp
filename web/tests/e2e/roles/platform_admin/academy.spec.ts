import { test, expect } from "@playwright/test";

test("academy page renders the seeded academy", async ({ page }) => {
  await page.goto("/academy");

  await expect(page.getByRole("heading", { name: "Academies", exact: true })).toBeVisible();
  await expect(page.getByText("E2E Test Academy")).toBeVisible();
});
