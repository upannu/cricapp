import { test, expect } from "@playwright/test";

test("memberships page renders the seeded player with no membership purchased", async ({ page }) => {
  await page.goto("/session-packs");

  await expect(page.getByRole("heading", { name: "Memberships", exact: true })).toBeVisible();

  // platform_admin sees every player in the shared dev project, not just e2e-prefixed fixtures —
  // with pagination now at 10/page, the seeded player isn't guaranteed to land on page 1. Search
  // for it directly instead of relying on default sort order (see players.spec.ts's own fix for
  // the identical issue when its pagination shipped).
  await page.getByPlaceholder(/Search by player name/).fill("E2E Test Player");
  await expect(page.getByText("E2E Test Player")).toBeVisible();
});
