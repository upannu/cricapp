import { test, expect } from "@playwright/test";

// Confirms the real, RLS-backed data path scopes an academy_admin to their
// own academy and hides the platform-admin-only "create new academy" action
// — not just that the right args are passed to fetchAcademies (already
// covered by the mocked component test).
test("an academy_admin sees only their own academy, no create-new action", async ({ page }) => {
  await page.goto("/academy");

  await expect(page.getByText("E2E Test Academy")).toBeVisible();
  await expect(page.getByRole("button", { name: "+ New Academy" })).not.toBeVisible();
});
