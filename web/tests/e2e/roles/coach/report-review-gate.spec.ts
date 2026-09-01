import path from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { PLAYER_ENTITY_ID } from "../../../seed/fixtures";

// Verifies the report-review workflow introduced in this merge (see
// docs/reverse-engineered/domains/player.md, PLAYER-061/062): a generated
// report starts not_reviewed and is invisible to the player/parent it's
// about until a coach explicitly marks it Completed. The player-visibility
// filter is server-side (app/(dashboard)/players/[id]/reports/page.tsx
// filters allReports to reviewStatus === "completed" for a non-reviewer
// viewer), not just a client-side hide.
//
// The seeded review-test report (REVIEW_TEST_REPORT_ID) is scoped throughout
// via its injury-risk badge ("Low") rather than its summary text, because
// the summary renders inside a controlled <textarea> — not matched by
// getByText — while the report is not yet Completed. "Low" is distinct from
// the other seeded report's ("Moderate"), so it's a safe unique anchor.

function reportCard(page: Page): Locator {
  return page
    .getByText("Low risk")
    .locator("xpath=ancestor::div[contains(@class,'bg-surface')][1]");
}

test("a report stays invisible to the player until the coach marks review Completed", async ({ page, browser }) => {
  const reportsUrl = `/players/${PLAYER_ENTITY_ID}/reports`;

  // --- As coach: confirm the seeded not_reviewed report is visible with its
  // review controls, and that a player context (opened below) cannot see it.
  await page.goto(reportsUrl);
  const card = reportCard(page);
  await expect(card.getByText("Not Reviewed")).toBeVisible();

  const playerContext = await browser.newContext({
    storageState: path.resolve(__dirname, "../../.auth/player.json"),
  });
  const playerPage = await playerContext.newPage();
  await playerPage.goto(reportsUrl);
  await expect(playerPage.getByText("Low risk")).not.toBeVisible();

  // --- Mark it Under Review as coach — still not player-visible.
  // exact:true avoids matching the "Save & Mark Under Review" button, whose
  // own label contains "Under Review" as a substring.
  await card.getByRole("button", { name: "Save & Mark Under Review" }).click();
  await expect(card.getByText("Under Review", { exact: true })).toBeVisible();

  await playerPage.reload();
  await expect(playerPage.getByText("Low risk")).not.toBeVisible();

  // --- Mark it Completed as coach — now player-visible.
  await card.getByRole("button", { name: "Save & Complete" }).click();
  await expect(card.getByText("Completed", { exact: true })).toBeVisible();

  await playerPage.reload();
  await expect(playerPage.getByText("Low risk")).toBeVisible();

  // --- Reopen for edits, restoring not_reviewed-adjacent state for the next
  // run (seed:reset also resets this) and confirming the reverse transition
  // ReportReview.tsx's "Reopen for Edits" link claims to support actually works.
  await card.getByRole("button", { name: "Reopen for Edits" }).click();
  await expect(card.getByText("Under Review", { exact: true })).toBeVisible();

  await playerContext.close();
});
