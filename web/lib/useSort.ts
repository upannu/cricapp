"use client";

import { useState } from "react";

export type SortDirection = "asc" | "desc";

/**
 * Shared click-to-sort state for a list/table page — one hook instead of each page hand-rolling
 * its own sortKey/sortDir state and toggle logic. Clicking the already-active column flips
 * direction; clicking a different column switches to it, defaulting to ascending.
 */
export function useSort<K extends string>(defaultKey: K, defaultDir: SortDirection = "asc") {
  const [sortKey, setSortKey] = useState<K>(defaultKey);
  const [sortDir, setSortDir] = useState<SortDirection>(defaultDir);

  function handleSort(key: K) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  return { sortKey, sortDir, handleSort };
}
