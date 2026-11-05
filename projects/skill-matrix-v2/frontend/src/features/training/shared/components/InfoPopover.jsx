import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Portals content to document.body as `position: fixed` off the trigger's own rect — escapes any
// overflow-x-auto ancestor, which would otherwise clip it (overflow-x: auto forces overflow-y clipping too).
export default function InfoPopover({ triggerEl, children, onClose }) {
  const popoverRef = useRef(null);
  const [style, setStyle] = useState({ position: "fixed", top: -9999, left: -9999, visibility: "hidden" });
  const [arrow, setArrow] = useState({ left: 16, side: "top" });

  // Position is a one-off snapshot, not continuously tracked — close on scroll instead of re-tracking.
  useEffect(() => {
    if (!onClose) return;
    const handleScroll = () => onClose();
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, [onClose]);

  useLayoutEffect(() => {
    if (!triggerEl || !popoverRef.current) return;
    const triggerRect = triggerEl.getBoundingClientRect();
    const popoverRect = popoverRef.current.getBoundingClientRect();
    const margin = 6;

    // Collision boundary is the nearest visible row, not just the viewport edge — a table row is a much closer boundary.
    const findVisibleBoundary = (startEl, direction) => {
      let el = direction === "next" ? startEl?.nextElementSibling : startEl?.previousElementSibling;
      while (el) {
        const rect = el.getBoundingClientRect();
        if (rect.height > 2) return direction === "next" ? rect.top : rect.bottom;
        el = direction === "next" ? el.nextElementSibling : el.previousElementSibling;
      }
      return null;
    };
    const rowEl = triggerEl.closest("tr");
    const nextRowTop = findVisibleBoundary(rowEl, "next");
    const prevRowBottom = findVisibleBoundary(rowEl, "prev");
    const belowBoundary = nextRowTop != null ? Math.min(window.innerHeight, nextRowTop) : window.innerHeight;
    const aboveBoundary = prevRowBottom != null ? Math.max(0, prevRowBottom) : 0;

    const spaceBelow = belowBoundary - triggerRect.bottom;
    const spaceAbove = triggerRect.top - aboveBoundary;
    const openUp = spaceBelow < popoverRect.height + margin && spaceAbove > spaceBelow;
    const top = openUp
      ? Math.max(margin, triggerRect.top - popoverRect.height - margin)
      : triggerRect.bottom + margin;

    const spaceRight = window.innerWidth - triggerRect.right;
    const alignRight = spaceRight < popoverRect.width;
    const left = alignRight
      ? Math.max(margin, triggerRect.right - popoverRect.width)
      : Math.min(triggerRect.left, window.innerWidth - popoverRect.width - margin);

    setStyle({ position: "fixed", top, left, visibility: "visible" });
    // Arrow sits roughly under/over the trigger's own horizontal center,
    // clamped so it never renders past the popover's own rounded corners.
    const arrowLeft = Math.min(Math.max(triggerRect.left + triggerRect.width / 2 - left - 4, 8), popoverRect.width - 16);
    setArrow({ left: arrowLeft, side: openUp ? "bottom" : "top" });
  }, [triggerEl, children]);

  return createPortal(
    <div
      ref={popoverRef}
      style={style}
      className="w-52 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl p-3 z-50"
    >
      {/* Directional arrow — CSS-only rotated square, border on just the two
          outward-facing edges so it reads as a seamless triangular tip
          pointing back at the trigger, matching whichever side (top/bottom)
          the popover opened from. */}
      <div
        style={{ left: arrow.left }}
        className={`absolute w-2 h-2 rotate-45 bg-white dark:bg-slate-800 ${
          arrow.side === "top"
            ? "-top-1 border-l border-t border-slate-200 dark:border-slate-700"
            : "-bottom-1 border-r border-b border-slate-200 dark:border-slate-700"
        }`}
      />
      {children}
    </div>,
    document.body
  );
}
