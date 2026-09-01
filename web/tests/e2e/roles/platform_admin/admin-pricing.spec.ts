import { test, expect } from "@playwright/test";

// REPLACES the old "subscription pricing page renders the current prices"
// test — /admin/pricing and its PlatformPricingClient.tsx component were
// deleted in the 120-commit merge (see docs/reverse-engineered/domains/
// academy_admin.md, ADMIN-015 REMOVED). Platform B2C pricing (Player Pro /
// Coach Pro) now lives in the Plan Catalog (/admin/plans), which gained a
// pricesByCurrency field. This test locks in the removal itself, so a
// regression (the route silently coming back, or resolving to something
// unexpected) gets caught.
test("/admin/pricing no longer resolves — confirms the page was removed, not just renamed", async ({ page }) => {
  const response = await page.goto("/admin/pricing");

  // Next.js's not-found page for an unmatched route.
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Subscription Pricing" })).not.toBeVisible();
});

test("Plan Catalog (the replacement) exposes multi-currency pricing", async ({ page }) => {
  await page.goto("/admin/plans");

  await expect(page.getByRole("heading", { name: "Plan Catalog" })).toBeVisible();
  // Spot-check that editing a plan surfaces the new currency-override UI
  // (ADMIN-021/ADMIN-TC-019 in docs/testing/test-cases.md) rather than
  // asserting exact plan rows, which are seed-data-dependent.
  const editButtons = page.getByRole("button", { name: /edit/i });
  if (await editButtons.count() > 0) {
    await editButtons.first().click();
    await expect(page.getByText(/other currenc/i)).toBeVisible({ timeout: 5_000 });
  }
});
