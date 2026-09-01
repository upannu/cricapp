import { test, expect } from "@playwright/test";

test("attendance page renders and the new-group modal opens", async ({ page }) => {
  await page.goto("/attendance");

  await expect(page.getByRole("heading", { name: "Attendance" })).toBeVisible();
  await page.getByRole("button", { name: "+ New Group" }).click();
  await expect(page.getByRole("heading", { name: "New Group" })).toBeVisible();
  await expect(page.getByPlaceholder("e.g. U14 Tuesday Nets")).toBeVisible();
});
