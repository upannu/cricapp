import { test, expect } from "@playwright/test";

test("reports page renders", async ({ page }) => {
  await page.goto("/reports");

  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
});
