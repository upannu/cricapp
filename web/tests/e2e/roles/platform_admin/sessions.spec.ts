import { test, expect } from "@playwright/test";

test("sessions page renders with its filter controls and stats", async ({ page }) => {
  await page.goto("/sessions");

  await expect(page.getByRole("heading", { name: "Sessions" })).toBeVisible();
  await expect(page.getByText("Total sessions")).toBeVisible();
  await expect(page.getByPlaceholder("Search player, notes or type…")).toBeVisible();
});
