"use client";

import type { SortDirection } from "@/lib/useSort";

/**
 * A `<th>` whose label is itself the click target — one shared column-header for every real
 * `<table>`-based list page, so "click a header to sort" looks and behaves identically everywhere
 * instead of each page (if it bothered at all) inventing its own "Sort by…" `<select>`. An inactive
 * column shows a neutral "↕" on hover; the active one always shows the direction it's currently
 * sorted in.
 *
 * `filterSlot` is optional extra content rendered next to the sort button — e.g. Players' own
 * icon-only `SelectPill` funnel for a quick inline filter on that same column — so a page that
 * needs one doesn't have to hand-roll its own `<th>` just to add it; every other page passes
 * nothing and renders exactly as before.
 */
export function SortableHeader<K extends string>({
  label, sortKey, activeKey, direction, onSort, align = "left", className = "", filterSlot,
}: {
  label: string;
  sortKey: K;
  activeKey: K;
  direction: SortDirection;
  onSort: (key: K) => void;
  align?: "left" | "right";
  className?: string;
  filterSlot?: React.ReactNode;
}) {
  const isActive = activeKey === sortKey;
  return (
    <th
      className={`text-xs font-semibold uppercase tracking-wider px-4 py-3 whitespace-nowrap ${
        align === "right" ? "text-right" : "text-left"
      } ${className}`}
    >
      <div className={`flex items-center gap-1.5 ${align === "right" ? "flex-row-reverse" : ""}`}>
        <button
          type="button"
          onClick={() => onSort(sortKey)}
          className={`group inline-flex items-center gap-1 cursor-pointer transition-colors ${
            isActive ? "text-white" : "text-zinc-300 hover:text-white"
          } ${align === "right" ? "flex-row-reverse" : ""}`}
        >
          {label}
          {isActive ? (
            <span className="text-[10px] leading-none">{direction === "asc" ? "▲" : "▼"}</span>
          ) : (
            <span className="text-[10px] leading-none opacity-0 group-hover:opacity-100 transition-opacity">↕</span>
          )}
        </button>
        {filterSlot}
      </div>
    </th>
  );
}
