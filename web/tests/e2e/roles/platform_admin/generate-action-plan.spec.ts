import { test, expect } from "@playwright/test";

// Loose real-call smoke test per the test plan's decision: hits the real
// Anthropic API and only checks a plan was generated with no error — not
// exact wording. Full correctness (auth, report lookup, drill mapping) is
// covered by the mocked API-layer tests in
// tests/api/generate-action-plan.test.ts. Relies on the seeded
// "e2e-report-flagged" report (see tests/seed/seed.ts) having a flagged,
// drill-mapped issue — the button is hidden entirely without one.
test("generating an AI action plan from the seeded flagged report succeeds", async ({ page }) => {
  await page.goto("/players/e2e-player/action-plans");

  const generateButton = page.getByRole("button", { name: /Generate AI Action Plan/ });
  await expect(generateButton).toBeVisible();
  await generateButton.click();

  // The new plan card appears at the top of the list once generation succeeds.
  await expect(page.getByText("Coach notes")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/AI action plan generation failed/i)).not.toBeVisible();
});
