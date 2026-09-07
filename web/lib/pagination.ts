/** The numbered-page-buttons-with-truncation range for a pagination control: always shows the
 * first and last page, the current page and `siblingCount` neighbors on each side, and collapses
 * any bigger gap into a single "ellipsis" marker. Below the threshold where a gap could even
 * exist, this naturally just returns every page number with no ellipsis at all — the same
 * function handles a 3-page list and a 300-page list correctly, there's no separate "simple"
 * mode to maintain. */
export type PageItem = number | "ellipsis";

export function getPaginationRange(currentPage: number, totalPages: number, siblingCount = 1): PageItem[] {
  const totalNumbers = siblingCount * 2 + 5; // first + last + current + siblingCount on each side + 2 ellipses' worth of slack
  if (totalPages <= totalNumbers) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const leftSibling = Math.max(currentPage - siblingCount, 1);
  const rightSibling = Math.min(currentPage + siblingCount, totalPages);
  const showLeftEllipsis = leftSibling > 2;
  const showRightEllipsis = rightSibling < totalPages - 1;
  const boundaryCount = siblingCount * 2 + 3; // how many numbers to show along whichever edge has no ellipsis

  if (!showLeftEllipsis && showRightEllipsis) {
    const leftRange = Array.from({ length: boundaryCount }, (_, i) => i + 1);
    return [...leftRange, "ellipsis", totalPages];
  }
  if (showLeftEllipsis && !showRightEllipsis) {
    const rightRange = Array.from({ length: boundaryCount }, (_, i) => totalPages - boundaryCount + i + 1);
    return [1, "ellipsis", ...rightRange];
  }
  const middleRange = Array.from({ length: rightSibling - leftSibling + 1 }, (_, i) => leftSibling + i);
  return [1, "ellipsis", ...middleRange, "ellipsis", totalPages];
}
