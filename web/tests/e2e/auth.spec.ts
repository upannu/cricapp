import path from "node:path";
import { test, expect } from "@playwright/test";

// Pins down middleware.ts's redirect matrix (web/middleware.ts) — the single
// gate every dashboard route depends on. See auth.setup.ts for the
// authenticated-session case (login succeeds and lands on /players).
test.describe("middleware redirect matrix", () => {
  test("unauthenticated visitor to a protected route is redirected to /login", async ({ page }) => {
    await page.goto("/players");
    await page.waitForURL("**/login");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("unauthenticated visitor can reach public auth pages without redirect", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();

    await page.goto("/forgot-password");
    await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();

    await page.goto("/reset-password");
    await expect(page).toHaveURL(/\/reset-password/);
    await expect(page.getByText("Verifying your link")).toBeVisible();
  });

  // Regression guard: a browser that still has a valid session cookie (a stale login, or someone
  // testing while signed in) used to get redirected to /players the instant it hit
  // /reset-password — before the page could ever read the recovery token out of the URL hash, so
  // the password reset silently did nothing. /signup already had this exception; /reset-password
  // needs the same one, for the same reason.
  test("an already-logged-in browser can still reach /reset-password (its own session must not eat the recovery link)", async ({ browser }) => {
    const context = await browser.newContext({ storageState: path.resolve(__dirname, ".auth/coach.json") });
    const page = await context.newPage();

    await page.goto("/reset-password");
    await expect(page).toHaveURL(/\/reset-password/);
    await expect(page).not.toHaveURL(/\/players/);

    await context.close();
  });

  test("wrong password on /login shows an error and does not navigate away", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("your@email.com").fill("nonexistent-e2e-user@crichq-test.local");
    await page.getByPlaceholder("••••••••").fill("definitely-wrong-password");
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page.getByText("Invalid email or password.")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});
