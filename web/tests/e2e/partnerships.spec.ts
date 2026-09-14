import { test, expect } from "@playwright/test";

// Regression guard: middleware.ts's public-path allowlist didn't originally include
// /partnerships or /organisations, so a signed-out visitor — the only kind of visitor this flow
// is for — got silently redirected to /login before ever seeing the page. See the middleware
// redirect matrix in auth.spec.ts for the same style of check on other public routes.
test.describe("Cricket Board Partnership public flow", () => {
  test("a signed-out visitor can reach the landing page without being redirected", async ({ page }) => {
    await page.goto("/partnerships/cricket-board");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Power Your Cricket Ecosystem" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Register Your Interest" }).first()).toBeVisible();
  });

  test("a signed-out visitor can reach the Organisations hub without being redirected", async ({ page }) => {
    await page.goto("/organisations");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "CRIC HQ for Organisations" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Explore Partnership" })).toBeVisible();
  });

  test("the Organisations link is reachable from the Partnership page's own nav and footer", async ({ page }) => {
    await page.goto("/partnerships/cricket-board");
    await page.getByRole("link", { name: "Organisations", exact: true }).first().click();
    await expect(page).toHaveURL(/\/organisations/);
  });

  test("full apply flow: landing → apply → submit → success page with a reference", async ({ page }) => {
    await page.goto("/partnerships/cricket-board");
    await page.getByRole("link", { name: "Register Your Interest" }).first().click();
    await expect(page).toHaveURL(/\/partnerships\/cricket-board\/apply/);

    // Step 1 — Organisation
    await page.getByLabel("Organisation Name *").fill("E2E Test Board");
    await page.getByLabel("Organisation Type *").selectOption("National Cricket Board");
    await page.getByLabel("Country *").fill("Australia");
    await page.getByRole("button", { name: "Continue →" }).click();

    // Step 2 — Scale (all optional, skip through)
    await page.getByRole("button", { name: "Continue →" }).click();

    // Step 3 — Interests (optional, skip through)
    await page.getByRole("button", { name: "Continue →" }).click();

    // Step 4 — Requirements (optional, skip through)
    await page.getByRole("button", { name: "Continue →" }).click();

    // Step 5 — Contact
    await page.getByLabel("First Name *").fill("Priya");
    await page.getByLabel("Last Name *").fill("Shah");
    await page.getByLabel("Job Title *").selectOption("Head of Cricket");
    await page.getByLabel("Email *").fill("e2e-test@example.com");
    await page.getByRole("button", { name: "Submit Partnership Application" }).click();

    await page.waitForURL(/\/partnerships\/cricket-board\/success/);
    await expect(page.getByText("Application received")).toBeVisible();
    await expect(page.getByText(/^CRIC-BRD-\d{4}-\d{6}$/)).toBeVisible();
  });
});
