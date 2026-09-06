import type { ReactNode } from "react";

// Every list page's top stat-card strip drifted into its own grid classes AND inherited that
// page's own overall container width (max-w-4xl through max-w-7xl vary page to page, sized for
// each page's own table/form content) — so even once every page shared the same grid-template-
// columns, a stat card still rendered at a different absolute size depending on which page it was
// on. Fixing that needs two things: every page at the same column count (see the Academy/Coaches
// note below), and this wrapper capping itself at one fixed width instead of stretching to fill
// whatever its parent container happens to be.
const COLS: Record<3 | 4, string> = {
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
};

export function StatsGrid({ columns, children }: { columns: 3 | 4; children: ReactNode }) {
  return <div className={`grid ${COLS[columns]} gap-4 mb-8 max-w-4xl`}>{children}</div>;
}
