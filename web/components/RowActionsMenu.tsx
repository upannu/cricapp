"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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

const MENU_WIDTH = 192; // w-48
const EDGE_PADDING = 8;

/**
 * The "⋮" row-actions menu — one shared widget for every list page's secondary/infrequent
 * actions, so the primary action (View/Edit/Billing) stays a direct, visible button and
 * everything else lives behind the same consistent affordance everywhere it appears, instead of
 * each page inventing its own icon buttons for things that aren't the main thing someone does
 * with a row. Originally built inline for AcademyClient's Edit Academy/Deactivate actions;
 * extracted here so PlayersClient/CoachesClient use the identical widget rather than
 * near-duplicates that drift apart over time.
 *
 * The open dropdown renders through a portal into `document.body`, positioned via the trigger
 * button's real screen coordinates — not nested inside the row anymore. Two bugs motivated this:
 * a row near the bottom of a table (inside the table card's own `overflow-hidden`, there for its
 * rounded corners) got its menu physically clipped, since a plain `absolute` popover never checks
 * whether there's room below; and an "Expired"-status player row carries `opacity-60` on its own
 * `<tr>`, which — because CSS opacity cascades onto DOM descendants — used to dim the menu's own
 * solid background right along with it, letting the row's text show faintly through. A portaled
 * node is no longer a descendant of that row in the actual DOM, so neither problem can reach it.
 *
 * Positioning is a two-pass measure-then-place, not a guess from item count: the menu first
 * mounts anchored below the button but `visibility: hidden` (present in the DOM, invisible, so it
 * can be measured — `display: none` wouldn't work here since a non-rendered element reports zero
 * size); a second layout effect then reads its *real* rendered height, picks whichever side
 * (above/below the button) has more room, and clamps the final position so the menu can never
 * extend past either viewport edge regardless of how tall it turns out to be. Both passes run
 * inside `useLayoutEffect`, so both commits land before the browser paints — no visible flicker
 * between the placeholder position and the corrected one. An item-count-based height estimate was
 * tried first and got this wrong for anything but the shortest menus (icons, a divider, and text
 * wrapping all shift the real height enough that a fixed per-item guess drifts).
 *
 * Self-contained: manages its own open state and closes on an outside click (or a scroll — a
 * `fixed`-positioned portal doesn't move with the table it was anchored to, so continuing to show
 * it stale is worse than just closing it, the same simplification the outside-click handler
 * already makes), so a page using more than one of these (one per row in a list) never needs to
 * lift state to keep only one open at a time — each instance closes itself the moment focus moves
 * elsewhere, including into another row's menu.
 */
export function RowActionsMenu({ items, align = "right" }: { items: RowActionItem[]; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number; ready: boolean } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Gated on position.ready (not just open) — opening can itself cause a scroll (e.g. the
  // trigger button being scrolled into view as part of the click that opened it), and that
  // scroll shouldn't immediately close the menu it was part of opening. Once positioned and
  // stable, a real subsequent scroll still closes it.
  useEffect(() => {
    if (!open || !position?.ready) return;
    function handleScroll() { setOpen(false); }
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, [open, position?.ready]);

  // Pass 1 — anchor below the button as a starting guess, not yet visible.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const idealLeft = align === "right" ? rect.right - MENU_WIDTH : rect.left;
    const left = Math.max(EDGE_PADDING, Math.min(idealLeft, window.innerWidth - MENU_WIDTH - EDGE_PADDING));
    setPosition({ left, top: rect.bottom + 4, ready: false });
  }, [open, align]);

  // Pass 2 — now that the menu is actually in the DOM, measure its real height and correct the
  // position (flip above the button if that side has more room; either way, clamp so it can never
  // render past a viewport edge), then reveal it.
  useLayoutEffect(() => {
    if (!open || !position || position.ready || !buttonRef.current || !menuRef.current) return;
    const buttonRect = buttonRef.current.getBoundingClientRect();
    const menuHeight = menuRef.current.getBoundingClientRect().height;
    const spaceBelow = window.innerHeight - buttonRect.bottom;
    const spaceAbove = buttonRect.top;
    const openUpward = menuHeight > spaceBelow && spaceAbove > spaceBelow;
    const idealTop = openUpward ? buttonRect.top - menuHeight - 4 : buttonRect.bottom + 4;
    const top = Math.max(EDGE_PADDING, Math.min(idealTop, window.innerHeight - menuHeight - EDGE_PADDING));
    setPosition((p) => (p ? { ...p, top, ready: true } : p));
  }, [open, position]);

  if (items.length === 0) return null;

  return (
    <div className="relative flex-shrink-0">
      <button
        ref={buttonRef}
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

      {open && position && createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", left: position.left, top: position.top, visibility: position.ready ? "visible" : "hidden" }}
          className="z-50 w-48 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl py-1 overflow-hidden"
        >
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
        </div>,
        document.body
      )}
    </div>
  );
}
