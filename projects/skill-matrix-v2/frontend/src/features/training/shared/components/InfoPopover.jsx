import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Portals content to document.body as `position: fixed` off the trigger's own rect — escapes any
// overflow-x-auto ancestor, which would otherwise clip it (overflow-x: auto forces overflow-y clipping too).
export default function InfoPopover({
  triggerEl,
  children,
  onClose,
  placement = "auto",
}) {
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
    const openUp =
      placement === "top-left" ||
      (spaceBelow < popoverRect.height + margin &&
        spaceAbove > spaceBelow);
    const top = openUp
      ? Math.max(margin, triggerRect.top - popoverRect.height - margin)
      : triggerRect.bottom + margin;

    const spaceRight = window.innerWidth - triggerRect.right;
    const alignRight = spaceRight < popoverRect.width;
    const left =
      placement === "left"
        ? Math.max(margin, triggerRect.left - popoverRect.width - margin)
        : placement === "top-left"
          ? Math.max(
              margin,
              Math.min(
                triggerRect.right - popoverRect.width,
                window.innerWidth - popoverRect.width - margin
              )
            )
          : alignRight
            ? Math.max(margin, triggerRect.right - popoverRect.width)
            : Math.min(
                triggerRect.left,
                window.innerWidth - popoverRect.width - margin
              );

    setStyle({ position: "fixed", top, left, visibility: "visible" });
    const arrowLeft = Math.min(
      Math.max(
        triggerRect.left + triggerRect.width / 2 - left - 6,
        8
      ),
      popoverRect.width - 20
    );
    setArrow({ left: arrowLeft, side: openUp ? "bottom" : "top" });
  }, [triggerEl, children, placement]);

  return createPortal(
    <div
      ref={popoverRef}
      style={style}
      className="relative z-50 w-52 rounded-lg border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-800"
    >
      <div
        style={{ left: arrow.left }}
        className={`absolute h-2 w-3 ${
          arrow.side === "top"
            ? "-top-[7px] [clip-path:polygon(50%_0,100%_100%,0_100%)] bg-slate-200 dark:bg-slate-700"
            : "-bottom-[7px] [clip-path:polygon(0_0,100%_0,50%_100%)] bg-slate-200 dark:bg-slate-700"
        }`}
      >
        <span
          className={`absolute inset-x-px h-[6px] bg-white dark:bg-slate-800 ${
            arrow.side === "top"
              ? "top-px [clip-path:polygon(50%_0,100%_100%,0_100%)]"
              : "top-0 [clip-path:polygon(0_0,100%_0,50%_100%)]"
          }`}
        />
      </div>
      {children}
    </div>,
    document.body
  );
}
