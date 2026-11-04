import { useLayoutEffect, useState } from "react";

/**
 * Viewport-clamped `position: fixed` style for a portaled panel anchored
 * directly below a trigger element. Extracted from InlineMultiSelectFilter.jsx
 * (and, later, FiltersPopover.jsx) — both open straight below their anchor
 * and just clamp to the viewport edges, so this is the shared math between
 * those two specifically.
 *
 * Deliberately does NOT cover BatchTable.jsx's InfoPopover: that one also
 * flips above the trigger when there's no room below, and resolves its
 * "how much room is there" boundary from the nearest visible table row
 * rather than just the viewport — a meaningfully different algorithm, kept
 * as its own implementation on purpose rather than folded in here.
 *
 * @param {Object} opts
 * @param {React.RefObject} opts.anchorRef - trigger/anchor element ref
 * @param {React.RefObject} opts.panelRef - portaled panel element ref
 * @param {boolean} opts.open - whether the panel is currently open (position isn't computed while closed)
 * @param {Array} [opts.deps] - extra effect deps beyond open/margin/align (e.g. content that can resize the panel)
 * @param {number} [opts.margin] - viewport edge margin in px
 * @param {"left"|"right"} [opts.align] - "left": panel's left edge lines up with the anchor's left edge (InlineMultiSelectFilter). "right": panel's right edge lines up with the anchor's right edge (FiltersPopover).
 * @returns {{position: "fixed", top: number, left: number, visibility: string}}
 */
export default function usePortalPosition({ anchorRef, panelRef, open, deps = [], margin = 4, align = "left" }) {
  const [style, setStyle] = useState({ position: "fixed", top: -9999, left: -9999, visibility: "hidden" });

  useLayoutEffect(() => {
    if (!open || !anchorRef.current || !panelRef.current) return;

    const recompute = () => {
      if (!anchorRef.current || !panelRef.current) return;
      const anchorRect = anchorRef.current.getBoundingClientRect();
      const panelRect = panelRef.current.getBoundingClientRect();

      const top = Math.min(anchorRect.bottom + margin, window.innerHeight - panelRect.height - margin);
      const left = align === "right"
        ? Math.min(anchorRect.right - panelRect.width, window.innerWidth - panelRect.width - margin)
        : Math.min(anchorRect.left, window.innerWidth - panelRect.width - margin);

      setStyle({
        position: "fixed",
        top: Math.max(margin, top),
        left: Math.max(margin, left),
        visibility: "visible",
      });
    };

    recompute();
    // A `position: fixed` panel does NOT automatically follow its anchor
    // the way an absolutely-positioned one would — if the anchor moves
    // (window resized, or any ancestor scrolled — capture:true catches
    // scroll on a scrollable card, not just the window) without `deps`
    // changing, the panel would otherwise freeze at stale coordinates
    // while its anchor visibly moves out from under it, ending up floating
    // disconnected from whatever opened it.
    window.addEventListener("resize", recompute);
    window.addEventListener("scroll", recompute, true);
    return () => {
      window.removeEventListener("resize", recompute);
      window.removeEventListener("scroll", recompute, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, margin, align, ...deps]);

  return style;
}
