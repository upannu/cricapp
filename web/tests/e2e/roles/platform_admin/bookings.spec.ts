import { test, expect } from "@playwright/test";

test("bookings page renders with its tab filters", async ({ page }) => {
  await page.goto("/bookings");

  await expect(page.getByRole("heading", { name: "Bookings", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Upcoming" })).toBeVisible();
  await expect(page.getByRole("button", { name: "+ New Booking" }).first()).toBeVisible();
});
