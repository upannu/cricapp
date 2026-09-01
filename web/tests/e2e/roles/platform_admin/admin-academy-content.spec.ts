import { test, expect } from "@playwright/test";

test("academy content admin page renders", async ({ page }) => {
  await page.goto("/admin/academy");

  await expect(page.getByRole("heading", { name: "Academy Content" })).toBeVisible();
});
