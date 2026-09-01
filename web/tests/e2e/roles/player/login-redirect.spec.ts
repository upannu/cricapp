import { test } from "@playwright/test";

// storageState for this project ("player") is set in playwright.config.ts,
// sourced from auth.setup.ts — this test runs already logged in.
test("logged-in user visiting /login is bounced to /players", async ({ page }) => {
  await page.goto("/login");
  await page.waitForURL("**/players");
});
