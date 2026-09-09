import { test, expect } from "@playwright/test";

test("coaches page renders the seeded coach", async ({ page }) => {
  await page.goto("/coaches");

  await expect(page.getByRole("heading", { name: "Coaches", exact: true })).toBeVisible();
  await expect(page.getByText("E2E Test Coach")).toBeVisible();
});

test("Edit Coach on the profile page opens the dedicated edit page and persists a change", async ({ page }) => {
  await page.goto("/coaches");
  await page.getByText("E2E Test Coach").click();
  await expect(page).toHaveURL(/\/coaches\/[^/]+$/);

  await page.getByRole("link", { name: "Edit Coach" }).click();
  await expect(page).toHaveURL(/\/coaches\/[^/]+\/edit$/);
  await expect(page.getByRole("heading", { name: "Edit Coach" })).toBeVisible();

  const locationInput = page.getByPlaceholder("e.g. Brisbane, QLD");
  await locationInput.fill("Perth, WA");
  await page.getByRole("button", { name: "Save Changes" }).click();

  await expect(page).toHaveURL(/\/coaches\/[^/]+$/, { timeout: 5000 });
  await expect(page.getByText("Perth, WA")).toBeVisible();
});
