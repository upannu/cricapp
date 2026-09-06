import type { ReactNode } from "react";

// Every list page's top stat-card strip drifted into its own grid classes over time — Coaches
// and Academy used a bare "grid-cols-3" with no mobile breakpoint at all (3 cards squeeze into
// one row even on a phone), Players broke at `lg:` instead of `sm:`, and spacing varied (mb-6 vs
// mb-8). One shared wrapper keeps "2 per row on mobile, one full row from sm: up" (and the same
// gap/margin) true everywhere, instead of every page retyping it and quietly drifting apart.
const COLS: Record<3 | 4, string> = {
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
};

export function StatsGrid({ columns, children }: { columns: 3 | 4; children: ReactNode }) {
  return <div className={`grid ${COLS[columns]} gap-4 mb-8`}>{children}</div>;
}
