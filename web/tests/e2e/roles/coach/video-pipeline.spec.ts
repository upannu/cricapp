import path from "node:path";
import { test, expect } from "@playwright/test";

// Real video upload + real client-side pose pipeline against a fixture clip
// with no person in it (tests/fixtures/video/no-person-testsrc.mp4 — a tiny
// ffmpeg testsrc pattern, see its generation command in git history). Per an
// explicit scope decision: there's no way to fabricate a realistic human
// bowling-action clip, so this test proves the upload/UI wiring — sign-upload,
// Storage upload, session save, report-generation trigger — and asserts the
// real pipeline's own "couldn't detect a bowler" rejection path, not the
// pose-detection happy path. That happy path has no automated coverage; a
// human should periodically upload a real clip and eyeball the result.
//
// Runs as coach, not player: AuthGuard.tsx force-redirects player/parent
// accounts to /portal for every route outside it (players only get the
// read-only portal), so /players/[id]/new-session and /sessions are
// coach/admin territory — the seeded coach owns the seeded e2e-player (see
// fixtures.ts), so it can log a session and generate a report for them.
//
// Tagged @slow (see AGENTS.md's testing conventions) — CI's video-pipeline-e2e
// job runs only this tag, and only when video-pipeline files change. Spends
// the seeded e2e-player's one assessment credit (see seed.ts); tests/seed/
// reset.ts resets it before every E2E pass, so this can't run twice in a row
// locally without an `npm run seed:reset` in between.
test("uploading a session video and generating a report surfaces the pose pipeline end to end @slow", async ({ page }) => {
  // Real ffmpeg.wasm transcode + real Storage upload + real MediaPipe pose
  // extraction — well past Playwright's default 30s test budget.
  test.setTimeout(180_000);

  const marker = `E2E video-pipeline marker ${Date.now()}`;
  const fixture = path.resolve(__dirname, "../../../fixtures/video/no-person-testsrc.mp4");

  await page.goto("/players/e2e-player/new-session");

  await page.getByPlaceholder("Key observations, focus areas, drills covered…").fill(marker);

  // CAMERA_ANGLES is [front, side, back] — side is the pipeline's preferred
  // angle for pose analysis, so upload there.
  const fileInputs = page.locator('input[type="file"]');
  await fileInputs.nth(1).setInputFiles(fixture);

  // Quality probe runs client-side (reads <video> metadata) — wait for it to
  // settle before submitting, since the form blocks submit while any angle is
  // still "checking".
  await expect(page.getByText("Checking quality…")).not.toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Save Session" }).click();

  // Real client-side transcode (ffmpeg.wasm) + real signed-URL Storage upload —
  // generous timeout for a cold wasm load.
  await expect(page.getByRole("button", { name: "✓ Session Saved" })).toBeVisible({ timeout: 60_000 });
  await page.waitForURL("**/players/e2e-player", { timeout: 15_000 });

  await page.goto("/sessions");

  // /sessions paginates (10/page) — the seeded e2e-player can easily have accumulated more
  // than that from prior runs, so the new session isn't guaranteed to land on page 1. Search
  // by the unique marker (matches session notes) rather than assume it's on the first page.
  await page.getByPlaceholder("Search player, notes or type…").fill(marker);

  const sessionRow = page.getByText(marker).locator("xpath=ancestor::button[1]");
  await sessionRow.click();

  const creditButton = page.getByRole("button", { name: /Use Assessment Credit/ });
  await expect(creditButton).toBeVisible();
  await creditButton.click();

  // Real MediaPipe pose extraction on a clip with no person in it — this is
  // the expected, correct outcome for this fixture, not a bug.
  await expect(
    page.getByText("Couldn't confidently detect a bowler in this clip — try a clearer, well-lit, unobstructed side-on video."),
  ).toBeVisible({ timeout: 60_000 });
});
