import { test, expect } from "@playwright/test";

test("platform KPIs page renders the seeded academy", async ({ page }) => {
  await page.goto("/admin/kpis");

  await expect(page.getByRole("heading", { name: "Platform KPIs" })).toBeVisible();
  await expect(page.getByText("E2E Test Academy")).toBeVisible();
});
