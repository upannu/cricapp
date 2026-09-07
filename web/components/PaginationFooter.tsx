// The count + Prev/Next row at the foot of a paginated table/list — copy-pasted with small drifts
// across Players/Sessions/Bookings (different colors, different wrap behavior, none of them safe
// on a narrow viewport) before being unified here. `label` stays a fully-styled node from the
// caller rather than a plain string, since each page phrases and colors its own count differently
// (e.g. Sessions appends "sessions", Players doesn't) — this component only owns the shared
// structure: the flex row (with a wrap fallback none of the copies had, so a narrow viewport wraps
// onto a second line instead of clipping against the parent's own overflow), and the Prev/Page/Next
// group, hidden whenever there's only one page to page through.
//
// `show` gates the whole row (label included) — pass whatever condition that page's own copy used
// before consolidation (e.g. `totalPages > 1` to hide the count too on a single page, matching
// Bookings' original behavior; `filtered.length > 0` to keep showing it down to zero, matching
// Sessions'; or leave it defaulted to always show, matching Players').
export function PaginationFooter({
  label, page, totalPages, onPrev, onNext, show = true, className = "",
}: {
  label: React.ReactNode;
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  show?: boolean;
  className?: string;
}) {
  if (!show) return null;
  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 ${className}`}>
      {label}
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPrev}
            disabled={page === 1}
            className="px-3 py-1.5 text-xs font-semibold text-zinc-300 border border-zinc-700 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            ← Prev
          </button>
          <span className="text-xs text-zinc-400 px-1">Page {page} of {totalPages}</span>
          <button
            type="button"
            onClick={onNext}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-xs font-semibold text-zinc-300 border border-zinc-700 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
