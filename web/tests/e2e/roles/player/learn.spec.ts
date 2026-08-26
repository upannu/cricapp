import { test, expect } from "@playwright/test";

test("academy learn page renders progress and the real curriculum", async ({ page }) => {
  await page.goto("/portal/learn");

  await expect(page.getByRole("heading", { name: "Academy" })).toBeVisible();
  await expect(page.getByText("Articles read")).toBeVisible();
});

test("a Foundation-stage article (always unlocked) opens and renders its body", async ({ page }) => {
  // "art-f2" is real seeded curriculum content in the dev project, not
  // e2e-prefixed test data — the 29-article curriculum is fixed content,
  // not something a per-run seed script creates.
  await page.goto("/portal/learn/art-f2");

  await expect(page.getByRole("heading", { name: "The 3 zones of your action" })).toBeVisible();
});
