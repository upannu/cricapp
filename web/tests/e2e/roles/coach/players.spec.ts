import { test, expect } from "@playwright/test";

// Confirms fetchPlayers' role-based scoping actually works end-to-end (real
// session, real Supabase query) — the mocked component test only proves
// PlayersClient *calls* fetchPlayers with the right coachId, not that the
// real query behind it returns the right rows.
test("a coach sees their own assigned player", async ({ page }) => {
  await page.goto("/players");

  await expect(page.getByRole("heading", { name: "Players", exact: true })).toBeVisible();
  await expect(page.getByText("E2E Test Player")).toBeVisible();
});
