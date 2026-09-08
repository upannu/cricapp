import { test, expect } from "@playwright/test";

// Confirms coach payout onboarding actually reaches Stripe's real hosted onboarding flow.
// This used to be a pin of a confirmed defect: the live Stripe test account rejected Express
// Connect account creation entirely (Accounts v1 no longer supported for new integrations —
// see connect/onboard/route.ts's Accounts v2 migration and connect/onboard.test.ts at the API
// layer). Now that the route creates a real v2 recipient account, "Set up payouts" should
// navigate the coach to Stripe's hosted onboarding, not surface an inline error.
test("Set up payouts navigates to Stripe's real hosted onboarding flow", async ({ page }) => {
  // A real Stripe test-mode Account + AccountLinks call, not mocked — consistently the slowest
  // test in the suite (~15s even healthy) since every other spec hits mocked/local endpoints.
  // That's a tight margin against the default 30s budget under CI's shared-runner variance
  // (confirmed: 40/40 pass locally in 44s total incl. this one, but it alone tipped over 30s in
  // CI on 3/3 consecutive runs) — widen it rather than race the clock on a real network call.
  test.setTimeout(60_000);

  await page.goto("/coaches");

  // "Set Up Payouts" lives under the row's own ⋮ menu now, not as a directly visible button.
  const moreActions = page.getByRole("button", { name: "More actions" }).first();
  await expect(moreActions).toBeVisible({ timeout: 10_000 });
  await moreActions.click();
  const setupButton = page.getByText("Set Up Payouts");
  await expect(setupButton).toBeVisible({ timeout: 10_000 });
  await setupButton.click();

  // handleSetupPayouts (CoachesClient.tsx) does window.location.href = data.url on success —
  // a real, single-use connect.stripe.com onboarding URL from the Accounts v2 AccountLinks call.
  await page.waitForURL(/^https:\/\/connect\.stripe\.com\//, { timeout: 30_000 });
});
