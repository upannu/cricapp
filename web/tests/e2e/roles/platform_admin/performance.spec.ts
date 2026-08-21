import { test, expect } from "@playwright/test";

test("performance dashboard renders the seeded player", async ({ page }) => {
  await page.goto("/performance");

  await expect(page.getByRole("heading", { name: "Performance Dashboard" })).toBeVisible();
  await expect(page.getByText("E2E Test Player")).toBeVisible();
});
