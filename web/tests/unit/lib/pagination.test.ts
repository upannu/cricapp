import { describe, expect, test } from "vitest";
import { getPaginationRange } from "@/lib/pagination";

describe("getPaginationRange", () => {
  test("shows every page with no ellipsis below the truncation threshold", () => {
    expect(getPaginationRange(1, 1)).toEqual([1]);
    expect(getPaginationRange(3, 6)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(getPaginationRange(1, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test("collapses the right side when the current page is near the start", () => {
    expect(getPaginationRange(1, 20)).toEqual([1, 2, 3, 4, 5, "ellipsis", 20]);
    expect(getPaginationRange(2, 20)).toEqual([1, 2, 3, 4, 5, "ellipsis", 20]);
  });

  test("collapses the left side when the current page is near the end", () => {
    expect(getPaginationRange(20, 20)).toEqual([1, "ellipsis", 16, 17, 18, 19, 20]);
    expect(getPaginationRange(19, 20)).toEqual([1, "ellipsis", 16, 17, 18, 19, 20]);
  });

  test("collapses both sides when the current page is in the middle", () => {
    expect(getPaginationRange(10, 20)).toEqual([1, "ellipsis", 9, 10, 11, "ellipsis", 20]);
  });

  test("never produces a duplicate or out-of-range page number", () => {
    for (let totalPages = 1; totalPages <= 30; totalPages++) {
      for (let currentPage = 1; currentPage <= totalPages; currentPage++) {
        const range = getPaginationRange(currentPage, totalPages);
        const numbers = range.filter((p): p is number => p !== "ellipsis");
        expect(new Set(numbers).size).toBe(numbers.length);
        for (const n of numbers) {
          expect(n).toBeGreaterThanOrEqual(1);
          expect(n).toBeLessThanOrEqual(totalPages);
        }
        expect(numbers).toContain(currentPage);
      }
    }
  });
});
