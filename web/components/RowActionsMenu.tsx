"use client";

import { useEffect, useRef, useState } from "react";

export interface RowActionItem {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  /** A divider renders above this item — for separating a destructive/secondary action from the
   * rest, the way AcademyClient's original menu split Edit from Deactivate. */
  dividerBefore?: boolean;
  variant?: "default" | "danger" | "warning" | "success";
  disabled?: boolean;
}

const VARIANT_CLASSES: Record<NonNullable<RowActionItem["variant"]>, string> = {
  default: "text-zinc-200 hover:bg-zinc-700 hover:text-white",
  danger: "text-red-400 hover:bg-red-500/10",
  warning: "text-amber hover:bg-amber/10",
  success: "text-pace-green hover:bg-pace-green/10",
};

/**
 * The "⋮" row-actions menu — one shared widget for every list page's secondary/infrequent
 * actions, so the primary action (View/Edit/Billing) stays a direct, visible button and
 * everything else lives behind the same consistent affordance everywhere it appears, instead of
 * each page inventing its own icon buttons for things that aren't the main thing someone does
 * with a row. Originally built inline for AcademyClient's Edit Academy/Deactivate actions;
 * extracted here so PlayersClient/CoachesClient use the identical widget rather than
 * near-duplicates that drift apart over time.
 *
 * Self-contained: manages its own open state and closes on an outside click, so a page using more
 * than one of these (one per row in a list) never needs to lift state to keep only one open at a
 * time — each instance closes itself the moment focus moves elsewhere, including into another
 * row's menu.
 */
export function RowActionsMenu({ items, align = "right" }: { items: RowActionItem[]; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        title="More actions"
        aria-label="More actions"
        className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-colors cursor-pointer ${
          open ? "border-zinc-500 bg-zinc-700 text-white" : "border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500"
        }`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
        </svg>
      </button>

      {open && (
        <div className={`absolute ${align === "right" ? "right-0" : "left-0"} top-10 z-30 w-48 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl py-1 overflow-hidden`}>
          {items.map((item, i) => (
            <div key={i}>
              {item.dividerBefore && <div className="h-px bg-zinc-700 mx-3 my-1" />}
              <button
                type="button"
                disabled={item.disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  item.onClick();
                }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${
                  item.disabled ? "opacity-40 cursor-not-allowed" : `cursor-pointer ${VARIANT_CLASSES[item.variant ?? "default"]}`
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
