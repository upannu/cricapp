import { test, expect } from "@playwright/test";

test("players page renders the seeded player", async ({ page }) => {
  await page.goto("/players");

  await expect(page.getByRole("heading", { name: "Players", exact: true })).toBeVisible();

  // platform_admin sees every player in the shared dev project, not just e2e-prefixed fixtures —
  // with pagination now at 10/page, the seeded player isn't guaranteed to land on page 1. Search
  // for it directly instead of relying on default sort order.
  await page.getByPlaceholder(/Search players/).fill("E2E Test Player");
  await expect(page.getByText("E2E Test Player")).toBeVisible();
});
