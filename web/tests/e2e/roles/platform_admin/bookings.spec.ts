import { test, expect } from "@playwright/test";

test("bookings page renders with its tab filters", async ({ page }) => {
  await page.goto("/bookings");

  await expect(page.getByRole("heading", { name: "Bookings", exact: true })).toBeVisible();
  // Exact — the new "Upcoming" stat card is also a button now, with its own accessible name
  // ("0 Upcoming"); the filter tab is the one whose name is exactly "Upcoming".
  await expect(page.getByRole("button", { name: "Upcoming", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "+ New Booking" }).first()).toBeVisible();
});
