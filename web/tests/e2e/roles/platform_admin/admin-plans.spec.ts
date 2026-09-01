import { test, expect } from "@playwright/test";

test("plan catalog page renders", async ({ page }) => {
  await page.goto("/admin/plans");

  await expect(page.getByRole("heading", { name: "Plan Catalog" })).toBeVisible();
  await expect(page.getByRole("button", { name: "+ New Plan" })).toBeVisible();
});
