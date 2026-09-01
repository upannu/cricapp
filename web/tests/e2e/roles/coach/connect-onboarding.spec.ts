import { test, expect } from "@playwright/test";

// End-to-end pin of a confirmed, currently-unfixed defect (see
// docs/reverse-engineered/gaps.md Tier 1 and MKT-GAP-04 / MKT-007): the live
// Stripe test account rejects Express Connect account creation entirely
// ("Accounts v1 support" must be enabled, or the app needs a v2 migration).
// This is already covered at the API layer (connect/onboard.test.ts) — this
// spec confirms the same failure surfaces correctly through the real UI,
// i.e. the coach sees a clear inline error rather than a silent hang or an
// unhandled crash.
//
// This test documents the CURRENT (broken) state. The day Stripe Connect
// onboarding actually works again, this test's expectation must be replaced
// with a real "redirected to Stripe's hosted onboarding" assertion.
test("Set up payouts surfaces a clear error, not a silent failure, against the current Stripe test account", async ({ page }) => {
  await page.goto("/coaches");

  const setupButton = page.getByRole("button", { name: "Set up payouts" }).first();
  await expect(setupButton).toBeVisible({ timeout: 10_000 });
  await setupButton.click();

  // handleSetupPayouts (CoachesClient.tsx) shows payoutError.message inline
  // once the POST to /api/stripe/connect/onboard fails — no navigation
  // happens, and the button returns to its normal (non-loading) state.
  await expect(page.getByText(/Accounts v1|Connect/i)).toBeVisible({ timeout: 15_000 });
  await expect(setupButton).toHaveText("Set up payouts"); // not stuck on "Loading…"
  // Confirm we're still on /coaches, not redirected to Stripe's hosted flow.
  await expect(page).toHaveURL(/\/coaches/);
});
