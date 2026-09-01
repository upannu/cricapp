import { test, expect } from "@playwright/test";

// Loose real-call smoke test per the test plan's decision: hits the real
// Anthropic API (small recurring cost) and only checks that a response
// streamed in with no error — not exact content, since that's
// non-deterministic. Full correctness (prompt construction, plan-limit
// gating, per-role access) is covered by the mocked API-layer tests in
// tests/api/coach-chat.test.ts.
test("Coach AI answers a real cricket-coaching question", async ({ page }) => {
  await page.goto("/portal");
  await page.getByRole("button", { name: "Open Coach AI chat" }).click();
  await page.getByRole("button", { name: "What does my front knee angle mean?" }).click();

  const lastMessage = page.locator(".flex.justify-start .whitespace-pre-wrap").last();
  await expect(lastMessage).not.toHaveText("", { timeout: 30_000 });
  await expect(lastMessage).not.toHaveText("…", { timeout: 30_000 });
  await expect(page.getByText(/couldn't respond|hit an error/i)).not.toBeVisible();
});
