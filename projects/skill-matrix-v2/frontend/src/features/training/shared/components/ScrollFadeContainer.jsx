import React, { useLayoutEffect, useRef, useState } from "react";

// Caps the region's height so expanding/collapsing content never changes
// the CARD's own height — the card's contribution to page layout stays
// constant, which is what stops an expand from cascading into a page-wide
// scroll jump that drags surrounding stable content (header/KPI strip/
// sticky sidebar) out of sync. min(...) keeps it from eating most of a
// short mobile viewport while still capping at a sensible max on desktop.
export const LIST_MAX_HEIGHT = "min(60vh,440px)";

/**
 * Height-capped scroll region with a bottom fade-affordance, extracted
 * from the Manager Dashboard's Team Training Status card once a second
 * consumer (the By-Training batch-group list) needed the exact same
 * independent-scroll + fade behavior. Also used for the alert-driven flat
 * employee list and, once drill-down is wired in, each breadcrumb level's
 * roster — i.e. the CONTENT swaps under this wrapper far more often than
 * the original single-consumer version ever had to handle.
 *
 * The fade tracks both scroll position (onScroll) AND content-size changes
 * (ResizeObserver on the container + its first child) — a row
 * expanding/collapsing in place, or a filter/view-mode/drill-down swap,
 * resizes the scrollable content without necessarily firing a scroll
 * event. Critically, the ResizeObserver effect is keyed on `watch`, not
 * mounted once: swapping to a structurally different subtree (Employee
 * list <-> Training groups <-> alert-driven list <-> a different
 * breadcrumb level) unmounts/remounts the observed `firstElementChild`,
 * and a mount-only `.observe()` call would never re-attach to the new
 * node — silently freezing the fade at whatever it last measured. Callers
 * MUST pass a `watch` array covering every prop that changes what's
 * rendered inside (e.g. `[viewMode, breadcrumbKey, rows, alertFilter]`),
 * not just ones that resize an already-mounted child.
 *
 * Props: { children, watch: any[], maxHeight?, className? }
 */
export default function ScrollFadeContainer({ children, watch = [], maxHeight = LIST_MAX_HEIGHT, className = "" }) {
  const scrollRef = useRef(null);
  const [showFade, setShowFade] = useState(false);

  const updateFade = () => {
    const el = scrollRef.current;
    if (!el) return;
    setShowFade(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
  };

  useLayoutEffect(() => {
    updateFade();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `watch` is the caller-declared, complete dependency list; updateFade itself is stable
  }, watch);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(updateFade);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-attach whenever `watch` changes, so a structurally-swapped child gets freshly observed instead of the stale one from before the swap
  }, watch);

  return (
    <div className={`relative ${className}`}>
      <div
        ref={scrollRef}
        onScroll={updateFade}
        style={{ maxHeight, scrollbarWidth: "thin", scrollbarColor: "rgba(148,163,184,0.7) transparent" }}
        className="overflow-y-auto pr-1"
      >
        {children}
      </div>
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 bottom-0 h-8 rounded-b-lg bg-gradient-to-t from-white dark:from-gray-800 to-transparent transition-opacity duration-150 ${
          showFade ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}
