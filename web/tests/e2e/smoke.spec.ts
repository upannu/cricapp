import { test, expect } from "@playwright/test";

// Batch 0 harness-proving test — confirms the Playwright pipeline (local dev
// server or a deployed preview URL, depending on PLAYWRIGHT_BASE_URL) can
// reach the app and render a public, unauthenticated page. Role-authenticated
// specs land in Batch 1 once auth.setup.ts and seeded test users exist.
test("login page renders the sign-in form", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByPlaceholder("your@email.com")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
});
