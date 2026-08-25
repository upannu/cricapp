import { test, expect } from "@playwright/test";

test("subscription pricing page renders the current prices", async ({ page }) => {
  await page.goto("/admin/pricing");

  await expect(page.getByRole("heading", { name: "Subscription Pricing" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save Changes" })).toBeVisible();
});
