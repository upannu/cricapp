import type { ReactNode } from "react";

// Every list page's top stat-card strip drifted into its own grid classes over time — Coaches
// and Academy used a bare "grid-cols-3" with no mobile breakpoint at all (3 cards squeeze into
// one row even on a phone), Players broke at `lg:` instead of `sm:`, and spacing varied (mb-6 vs
// mb-8). This wrapper fixes the shared column/breakpoint rule. It deliberately does NOT cap its
// own width — every list page's own outer container is now the same max-w-5xl (see each
// *Client.tsx's root div), so filling that parent already gives every stat card the same
// physical size and keeps the strip spanning the same width as the rest of that page's content
// (search bar, table) instead of rendering narrower than everything below it.
const COLS: Record<3 | 4, string> = {
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
};

export function StatsGrid({ columns, children }: { columns: 3 | 4; children: ReactNode }) {
  return <div className={`grid ${COLS[columns]} gap-4 mb-8`}>{children}</div>;
}
