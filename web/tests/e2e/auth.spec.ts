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

  // Regression guard for a real account-enumeration bug: the child's-registered-email field on
  // /signup used to run a live, unauthenticated lookup on every keystroke and show a distinct
  // "✓ Found N player records"/"No player found" message — anyone could learn whether an
  // arbitrary email had children registered on the platform with no login and no signup
  // commitment. See api/request-signup-link/route.ts for the fix: the real answer is now only
  // ever revealed by an email sent to that address, never in this response.
  test("the child's-registered-email field gives no live match/no-match signal", async ({ page }) => {
    await page.goto("/signup");
    await page.getByRole("button", { name: "Parent / Guardian" }).click();

    await page.getByPlaceholder("The email your coach has on file").fill("e2e-nonexistent-probe@crichq-test.local");
    // No live check exists to wait for — this just gives any (deliberately absent) network round
    // trip time to have fired and rendered something, if the old behavior somehow regressed back in.
    await page.waitForTimeout(1000);

    await expect(page.getByText(/Found/i)).not.toBeVisible();
    await expect(page.getByText(/No player found/i)).not.toBeVisible();
    await expect(page.getByText(/Checking…/i)).not.toBeVisible();
  });
});
