"use client";

import type { SortDirection } from "@/lib/useSort";

/**
 * A `<th>` whose label is itself the click target — one shared column-header for every real
 * `<table>`-based list page, so "click a header to sort" looks and behaves identically everywhere
 * instead of each page (if it bothered at all) inventing its own "Sort by…" `<select>`. An inactive
 * column shows a neutral "↕"; the active one shows the direction it's currently sorted in.
 */
export function SortableHeader<K extends string>({
  label, sortKey, activeKey, direction, onSort, align = "left", className = "",
}: {
  label: string;
  sortKey: K;
  activeKey: K;
  direction: SortDirection;
  onSort: (key: K) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const isActive = activeKey === sortKey;
  return (
    <th
      className={`text-xs font-semibold uppercase tracking-wider px-4 py-3 whitespace-nowrap ${
        align === "right" ? "text-right" : "text-left"
      } ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 cursor-pointer transition-colors ${
          isActive ? "text-white" : "text-zinc-400 hover:text-white"
        } ${align === "right" ? "flex-row-reverse" : ""}`}
      >
        {label}
        <span className="text-[10px] leading-none">{isActive ? (direction === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
}
