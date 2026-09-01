import { test, expect } from "@playwright/test";

test("performance dashboard renders the seeded player", async ({ page }) => {
  await page.goto("/performance");

  await expect(page.getByRole("heading", { name: "Performance Dashboard" })).toBeVisible();
  // The player's name appears twice (a summary <p> plus a link to their profile) — scope to the
  // link specifically to avoid a Playwright strict-mode violation on the bare text.
  await expect(page.getByRole("link", { name: "E2E Test Player" })).toBeVisible();
});
