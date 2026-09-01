import { test, expect } from "@playwright/test";

test("platform admins page renders", async ({ page }) => {
  await page.goto("/admin/admins");

  await expect(page.getByRole("heading", { name: "Platform Admins" })).toBeVisible();
});
