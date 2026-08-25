import { test, expect } from "@playwright/test";

// This page's logic lives directly in app/(dashboard)/admin/approvals/page.tsx
// (an async Server Component wrapper around fully client-side logic) — there
// is no separate *Client.tsx component, so this E2E spec is the ONLY test
// coverage this page's approve/reject flow gets at all.
test("approvals page renders and shows the all-caught-up empty state or the queue", async ({ page }) => {
  await page.goto("/admin/approvals");

  await expect(page.getByRole("heading", { name: "Pending Approvals" })).toBeVisible();
  // With no pending signups seeded, the empty state is the expected default.
  await expect(page.getByText("All caught up")).toBeVisible();
});
