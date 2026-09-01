import { test, expect } from "@playwright/test";

// Regression guard for a confirmed, currently-unfixed defect (see
// docs/reverse-engineered/gaps.md Tier 1: "Bulk messaging never actually
// sends"). BulkMessageModal.tsx calls insertMessage() directly and never
// calls fetch("/api/send-message") or fetch("/api/send-sms") — unlike the
// single-recipient MessageModal.tsx, which calls the real delivery API
// before logging. The UI still shows "✓ Sent to N players".
//
// This test documents the bug as-is — it asserts the delivery API is never
// called, which is the CURRENT (broken) behavior. Flip this the day it's fixed.
test("bulk message to selected players shows success but never calls the delivery API (confirmed defect)", async ({ page }) => {
  const sendMessageCalls: string[] = [];
  const sendSmsCalls: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("/api/send-message")) sendMessageCalls.push(req.url());
    if (req.url().includes("/api/send-sms")) sendSmsCalls.push(req.url());
  });

  await page.goto("/players");

  // The player list loads asynchronously after mount — wait for at least one
  // seeded player row before interacting with the header checkbox, otherwise
  // the click can race the initial fetch and silently no-op.
  await expect(page.getByText("E2E Test Player").first()).toBeVisible();

  // Select every player on this coach's roster via the header "Select all"
  // checkbox (title="Select all" in PlayersClient.tsx) — the coach has at
  // least the two seeded fixture players.
  await page.getByTitle("Select all").check();
  await expect(page.getByText(/player.*selected/)).toBeVisible();

  await page.getByRole("button", { name: "✉ Message Selected" }).click();

  await expect(page.getByRole("heading", { name: "Bulk Message" })).toBeVisible();
  // Email is the default channel.
  await page.getByPlaceholder("e.g. Training update this week").fill("E2E bulk-message regression check");
  await page.getByPlaceholder("Write your message...").fill("This message should never actually be delivered per the confirmed defect.");

  const sendButton = page.getByRole("button", { name: /^Send to \d+ players?$/ });
  await sendButton.click();

  // The UI's own success indicator — the bug is specifically that this shows
  // even though no delivery API was ever called.
  await expect(page.getByText(/Sent to \d+ players?/)).toBeVisible();
  await expect(page.getByText("via Email")).toBeVisible();

  // Documents the CURRENT (broken) behavior. If either array is ever
  // non-empty, the bug has been fixed — update this test to assert the
  // calls actually happened instead.
  expect(sendMessageCalls).toHaveLength(0);
  expect(sendSmsCalls).toHaveLength(0);
});
