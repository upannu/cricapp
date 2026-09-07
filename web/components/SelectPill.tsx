"use client";

import { useEffect, useRef, useState } from "react";

export interface SelectPillOption<T extends string> {
  value: T;
  label: string;
}

/**
 * A rounded pill button that opens a small dropdown panel — the same "industry standard" pattern
 * most consumer search UIs use (a styled trigger + custom popover) instead of a native `<select>`,
 * which is stuck with the browser/OS's own dropdown chrome and can't match the rest of the app's
 * look. Reuses the exact self-contained open-state/outside-click-close mechanics RowActionsMenu
 * already established, rather than inventing a second way to do the same thing.
 *
 * The trigger's accessible name is always `ariaLabel` (fixed, via aria-label overriding the
 * visible text) — same convention as RowActionsMenu's "More actions" button always being findable
 * by that one fixed name regardless of what's currently selected.
 *
 * `active` is a separate, caller-computed signal from `open` — same "applied vs. currently
 * interacting with" split StatCard's own `active` prop already draws — for a pill used as a
 * filter, so a closed pill can still show it has a value applied instead of only highlighting
 * while its popover happens to be open.
 *
 * `iconOnly` swaps the trigger's visible content for a small funnel glyph (still carrying the
 * same fixed `ariaLabel` as its accessible name) and shrinks the button to an icon-sized square —
 * for reusing this exact same filter, unchanged, as a quick inline control inside a table column
 * header (e.g. SortableHeader's `filterSlot`) rather than duplicating the open/close/option
 * logic in a second component.
 */
export function SelectPill<T extends string>({
  value, options, onChange, ariaLabel, align = "left", active = false, iconOnly = false,
}: {
  value: T;
  options: SelectPillOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  align?: "left" | "right";
  active?: boolean;
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const current = options.find((o) => o.value === value);

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={iconOnly ? ariaLabel : undefined}
        className={
          iconOnly
            ? `flex items-center justify-center w-7 h-7 rounded-lg border transition-colors cursor-pointer ${
                open
                  ? "border-pace-green text-pace-green bg-ink"
                  : active
                    ? "border-pace-green/50 bg-pace-green/10 text-pace-green"
                    : "border-transparent text-zinc-500 hover:text-white hover:border-zinc-500"
              }`
            : `flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                open
                  ? "border-pace-green text-white bg-ink"
                  : active
                    ? "border-pace-green/50 bg-pace-green/10 text-pace-green"
                    : "border-zinc-700 text-zinc-300 bg-ink hover:border-zinc-500"
              }`
        }
      >
        {iconOnly ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
        ) : (
          <>
            {current?.label ?? ariaLabel}
            <span className={`text-[10px] transition-transform duration-200 ${open ? "rotate-180" : ""}`}>▾</span>
          </>
        )}
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className={`absolute ${align === "right" ? "right-0" : "left-0"} top-full mt-2 z-30 w-48 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl py-1 overflow-hidden`}
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              onClick={() => { setOpen(false); onChange(o.value); }}
              className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm text-left transition-colors cursor-pointer ${
                o.value === value ? "text-pace-green bg-pace-green/10" : "text-zinc-200 hover:bg-zinc-700 hover:text-white"
              }`}
            >
              {o.label}
              {o.value === value && <span aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
