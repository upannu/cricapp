import { test, expect } from "@playwright/test";

// Confirms coach payout onboarding actually reaches Stripe's real hosted onboarding flow.
// This used to be a pin of a confirmed defect: the live Stripe test account rejected Express
// Connect account creation entirely (Accounts v1 no longer supported for new integrations —
// see connect/onboard/route.ts's Accounts v2 migration and connect/onboard.test.ts at the API
// layer). Now that the route creates a real v2 recipient account, "Set up payouts" should
// navigate the coach to Stripe's hosted onboarding, not surface an inline error.
test("Set up payouts navigates to Stripe's real hosted onboarding flow", async ({ page }) => {
  await page.goto("/coaches");

  const setupButton = page.getByRole("button", { name: "Set up payouts" }).first();
  await expect(setupButton).toBeVisible({ timeout: 10_000 });
  await setupButton.click();

  // handleSetupPayouts (CoachesClient.tsx) does window.location.href = data.url on success —
  // a real, single-use connect.stripe.com onboarding URL from the Accounts v2 AccountLinks call.
  await page.waitForURL(/^https:\/\/connect\.stripe\.com\//, { timeout: 15_000 });
});
