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
