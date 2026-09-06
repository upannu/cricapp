import { test, expect } from "@playwright/test";

// Regression test for a previously-confirmed defect (see docs/reverse-engineered/gaps.md
// PORTAL-GAP-006, now fixed): BulkMessageModal.tsx used to call insertMessage() directly and
// never call fetch("/api/send-message")/fetch("/api/send-sms") — unlike the single-recipient
// MessageModal.tsx, which calls the real delivery API before logging. The UI showed "✓ Sent to
// N players" regardless of whether anything was actually delivered. This test now asserts the
// delivery API IS called, with the right payload, for every selected recipient.
//
// The delivery routes themselves depend on external creds (Gmail/ClickSend) this suite doesn't
// control and shouldn't actually invoke from CI. Two separate mechanisms are deliberately used
// here rather than one: a passive page.on("request") listener (the same mechanism the pre-fix
// version of this test relied on to prove zero calls happened, and — unlike route-interception
// used alone — not sensitive to how/whether the response gets fulfilled) is what the assertions
// below depend on, while page.route() is used only to fulfill those two endpoints with a canned
// success response so the app under test never reaches Gmail/ClickSend for real. (An earlier
// version of this test relied on route-interception alone for both jobs and saw 0 requests
// recorded in CI despite the UI reporting success — this split avoids that failure mode.)
test("bulk message to selected players calls the real delivery API for every recipient", async ({ page }) => {
  const sendMessageRequests: import("@playwright/test").Request[] = [];
  const sendSmsRequests: import("@playwright/test").Request[] = [];
  page.on("request", (req) => {
    if (req.url().includes("/api/send-message")) sendMessageRequests.push(req);
    if (req.url().includes("/api/send-sms")) sendSmsRequests.push(req);
  });
  await page.route("**/api/send-message", (route) => route.fulfill({ json: { success: true } }));
  await page.route("**/api/send-sms", (route) => route.fulfill({ json: { success: true } }));

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
  expect(sendMessageRequests.length).toBeGreaterThan(0);
  expect(sendSmsRequests).toHaveLength(0);
  for (const req of sendMessageRequests) {
    expect(JSON.parse(req.postData() ?? "{}")).toMatchObject({
      subject: "E2E bulk-message regression check",
      body: "This confirms bulk messages are actually delivered.",
    });
  }
});
