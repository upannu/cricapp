import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { occurrenceDatesInRange } from "@/lib/utils";

// Shared by Attendance (past-occurrence history) and the player Portal (next squad training
// dates) — both need the same weekly-recurrence math over a date range.
//
// Pinning TZ to Australia/Sydney (every academy on this platform is Australian, per
// formatDateTime in this same file) keeps the test's expectations exact and reproducible in CI
// regardless of the runner's own default timezone — occurrenceDatesInRange parses its ISO inputs
// as local midnight, so results could otherwise shift by a day depending on where the test runs.
const ORIGINAL_TZ = process.env.TZ;
beforeAll(() => { process.env.TZ = "Australia/Sydney"; });
afterAll(() => { process.env.TZ = ORIGINAL_TZ; });

describe("occurrenceDatesInRange", () => {
  test("returns every weekly occurrence between two dates, inclusive of both ends", () => {
    // 2026-01-06 is a Tuesday (dayOfWeek 2); range spans exactly 3 Tuesdays.
    expect(occurrenceDatesInRange(2, "2026-01-06", "2026-01-20")).toEqual([
      "2026-01-06", "2026-01-13", "2026-01-20",
    ]);
  });

  test("rolls forward to the first matching weekday when the range starts on a different day", () => {
    // 2026-01-01 is a Thursday; the first Tuesday on/after it is 2026-01-06.
    expect(occurrenceDatesInRange(2, "2026-01-01", "2026-01-13")).toEqual([
      "2026-01-06", "2026-01-13",
    ]);
  });

  test("returns an empty array when the range is too short to contain the weekday", () => {
    // 2026-01-01 (Thu) to 2026-01-02 (Fri) never reaches a Tuesday.
    expect(occurrenceDatesInRange(2, "2026-01-01", "2026-01-02")).toEqual([]);
  });

  test("handles Sunday (dayOfWeek 0) without a sign/modulo bug", () => {
    // 2026-01-04 is a Sunday.
    expect(occurrenceDatesInRange(0, "2026-01-01", "2026-01-11")).toEqual([
      "2026-01-04", "2026-01-11",
    ]);
  });

  test("a single-day range that lands exactly on the weekday returns just that date", () => {
    expect(occurrenceDatesInRange(2, "2026-01-06", "2026-01-06")).toEqual(["2026-01-06"]);
  });
});
