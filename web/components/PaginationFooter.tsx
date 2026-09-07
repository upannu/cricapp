import { getPaginationRange } from "@/lib/pagination";

// Shared here rather than duplicated on every button — keyboard focus needs to stay visible
// (WCAG 2.1 AA) without adding a visible ring on every mouse click, which is exactly what
// `:focus-visible` (vs. plain `:focus`) is for.
const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pace-green focus-visible:ring-offset-2 focus-visible:ring-offset-ink";
const NAV_BUTTON = `min-h-11 px-4 flex items-center gap-1.5 text-xs font-semibold text-zinc-300 border border-zinc-700 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${FOCUS_RING}`;
const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// The count + Prev/Next row at the foot of a paginated table/list — copy-pasted with small drifts
// across Players/Sessions/Bookings (different colors, different wrap behavior, none of them safe
// on a narrow viewport) before being unified here. `label` stays a fully-styled node from the
// caller rather than a plain string, since each page phrases and colors its own count differently
// (e.g. Sessions appends "sessions", Players doesn't) — this component only owns the shared
// structure: the flex row (with a wrap fallback none of the copies had, so a narrow viewport wraps
// onto a second line instead of clipping against the parent's own overflow), the numbered-page
// control, and — when the caller opts in — a rows-per-page selector.
//
// `show` gates the whole row (label included) — pass whatever condition that page's own copy used
// before consolidation (e.g. `totalPages > 1` to hide the count too on a single page, matching
// Bookings' original behavior; `filtered.length > 0` to keep showing it down to zero, matching
// Sessions'; or leave it defaulted to always show, matching Players').
//
// Page numbers (via lib/pagination.ts's getPaginationRange) render whenever there's more than one
// page — a plain "Page X of Y" label was the old fallback for a large page count where numbered
// buttons would be unwieldy, but the truncation algorithm handles that case itself (collapsing
// into "1 … 9 10 11 … 40"), so there's no longer a separate low/high-count code path to maintain.
export function PaginationFooter({
  label, page, totalPages, onPageChange, show = true, className = "",
  itemsPerPage, itemsPerPageOptions = DEFAULT_PAGE_SIZE_OPTIONS, onItemsPerPageChange,
}: {
  label: React.ReactNode;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  show?: boolean;
  className?: string;
  /** Omit (along with onItemsPerPageChange) to skip the rows-per-page selector entirely. */
  itemsPerPage?: number;
  itemsPerPageOptions?: number[];
  onItemsPerPageChange?: (itemsPerPage: number) => void;
}) {
  if (!show) return null;
  const pageItems = totalPages > 1 ? getPaginationRange(page, totalPages) : [];

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 ${className}`}>
      <div className="flex flex-wrap items-center gap-3">
        {label}
        {onItemsPerPageChange && itemsPerPage !== undefined && (
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            Rows per page
            <select
              value={itemsPerPage}
              onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
              className={`h-11 bg-ink border border-zinc-700 rounded-lg px-2 text-xs text-zinc-200 cursor-pointer hover:border-zinc-500 transition-colors ${FOCUS_RING}`}
            >
              {itemsPerPageOptions.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {totalPages > 1 && (
        <nav aria-label="Pagination" className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page === 1}
            aria-disabled={page === 1}
            className={NAV_BUTTON}
          >
            ← Prev
          </button>
          {pageItems.map((item, i) =>
            item === "ellipsis" ? (
              <span key={`ellipsis-${i}`} aria-hidden="true" className="w-11 h-11 flex items-center justify-center text-zinc-500 text-xs">
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => onPageChange(item)}
                aria-current={item === page ? "page" : undefined}
                className={`w-11 h-11 flex items-center justify-center rounded-lg text-xs font-semibold transition-colors cursor-pointer ${FOCUS_RING} ${
                  item === page
                    ? "bg-pace-green text-black"
                    : "text-zinc-300 border border-zinc-700 hover:bg-white/5"
                }`}
              >
                {item}
              </button>
            )
          )}
          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            aria-disabled={page === totalPages}
            className={NAV_BUTTON}
          >
            Next →
          </button>
        </nav>
      )}
    </div>
  );
}
