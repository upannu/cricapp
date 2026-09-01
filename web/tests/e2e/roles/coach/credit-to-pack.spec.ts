import { test, expect } from "@playwright/test";
import { serviceClient } from "../../../seed/client";
import { PACK_TEST_PACK_ID, PACK_TEST_BOOKING_ID } from "../../../seed/fixtures";

// Regression guard for a confirmed, currently-unfixed defect (see
// docs/reverse-engineered/gaps.md, MKT-GAP-10 / requirement MKT-015):
// BookingsClient.tsx's "Credit to Pack" button calls
// updatePackPaymentStatus(activePack.id, activePack.paymentStatus) — passing
// the pack's own *unchanged* status — so it is a no-op. sessionCredits never
// actually increments, even though the UI shows "✓ Session credited".
//
// This test currently documents the bug as-is (asserts the broken behavior),
// not the intended behavior — flip the assertion the day this gets fixed.
test("Credit to Pack on a cancelled booking does not actually increment sessionCredits (confirmed defect)", async ({ page }) => {
  const supabase = serviceClient();

  const { data: before, error: beforeError } = await supabase
    .from("session_packs")
    .select("session_credits")
    .eq("id", PACK_TEST_PACK_ID)
    .single();
  if (beforeError) throw beforeError;
  const creditsBefore = before?.session_credits ?? 0;

  await page.goto("/bookings");

  // The Bookings page defaults to the "Upcoming" tab filter, which excludes
  // Cancelled bookings — switch to the "Cancelled" tab to find the seeded one.
  await page.getByRole("button", { name: "Cancelled" }).click();

  // Each booking row is a collapsed summary button (ends in the "▾" chevron)
  // — expand it to reveal the "Credit to Pack" affordance underneath.
  await page.getByRole("button", { name: /E2E Pack Test Player/ }).click();

  // It's the only Cancelled booking with an active pack in this fixture set,
  // so the button is unique on the page once expanded.
  const creditButton = page.getByRole("button", { name: "Credit to Pack" });
  await expect(creditButton).toBeVisible({ timeout: 10_000 });
  await creditButton.click();

  // The UI's own success indicator — the bug is specifically that this shows
  // "true" while nothing actually changed in the database.
  await expect(page.getByText("✓ Session credited")).toBeVisible();

  const { data: after, error: afterError } = await supabase
    .from("session_packs")
    .select("session_credits, payment_status")
    .eq("id", PACK_TEST_PACK_ID)
    .single();
  if (afterError) throw afterError;

  // Documents the CURRENT (broken) behavior: credits are unchanged despite
  // the success message. If this assertion ever fails, the bug has been
  // fixed — update this test to assert creditsBefore + 1 instead.
  expect(after?.session_credits ?? 0).toBe(creditsBefore);
});
