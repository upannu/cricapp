import { test, expect } from "@playwright/test";

// Regression test for a previously-confirmed defect (see docs/reverse-engineered/gaps.md
// PORTAL-GAP-006, now fixed): BulkMessageModal.tsx used to call insertMessage() directly and
// never call fetch("/api/send-message")/fetch("/api/send-sms") — unlike the single-recipient
// MessageModal.tsx, which calls the real delivery API before logging. The UI showed "✓ Sent to
// N players" regardless of whether anything was actually delivered. This test now asserts the
// delivery API IS called, with the right payload, for every selected recipient.
//
// The delivery routes themselves depend on external creds (Gmail/ClickSend) this suite doesn't
// control and shouldn't actually invoke from CI — page.route() stubs just those two endpoints
// with a canned success response, so this stays a test of the app's own behavior (does it call
// the right endpoint, with the right recipient/body, for each selected player) rather than a
// test of Gmail/ClickSend's live availability.
test("bulk message to selected players calls the real delivery API for every recipient", async ({ page }) => {
  const sendMessageCalls: { url: string; postData: string | null }[] = [];
  await page.route("**/api/send-message", async (route) => {
    sendMessageCalls.push({ url: route.request().url(), postData: route.request().postData() });
    await route.fulfill({ json: { success: true } });
  });
  const sendSmsCalls: string[] = [];
  await page.route("**/api/send-sms", async (route) => {
    sendSmsCalls.push(route.request().url());
    await route.fulfill({ json: { success: true } });
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
  await page.getByPlaceholder("Write your message...").fill("This confirms bulk messages are actually delivered.");

  const sendButton = page.getByRole("button", { name: /^Send to \d+ players?$/ });
  await sendButton.click();

  // Submitting opens a confirm dialog rather than sending immediately.
  await expect(page.getByRole("heading", { name: "Send Email?" })).toBeVisible();
  await page.getByRole("button", { name: "Yes, Send" }).click();

  await expect(page.getByText(/Sent to \d+ players?/)).toBeVisible();
  await expect(page.getByText("via Email")).toBeVisible();

  // The bug is fixed: the real delivery API is called once per recipient with the right content,
  // not skipped in favor of only logging to message history.
  expect(sendMessageCalls.length).toBeGreaterThan(0);
  expect(sendSmsCalls).toHaveLength(0);
  for (const call of sendMessageCalls) {
    expect(JSON.parse(call.postData ?? "{}")).toMatchObject({
      subject: "E2E bulk-message regression check",
      body: "This confirms bulk messages are actually delivered.",
    });
  }
});
