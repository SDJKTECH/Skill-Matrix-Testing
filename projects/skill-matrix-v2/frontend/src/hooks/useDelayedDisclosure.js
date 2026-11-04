import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_SHOW_DELAY = 400;
const DEFAULT_HIDE_DELAY = 300;

/**
 * Delayed open/close state for a hover/focus-triggered tooltip preview —
 * generalized from the show/hide timer pattern already used inline in
 * EmployeeRow.jsx for its manager drill-peek (kept as-is there, not
 * refactored, since that's existing hierarchy-navigation code). Same NN/G
 * hover-intent reasoning: a short pause before showing distinguishes
 * deliberate hovering from the cursor passing through; a short pause before
 * hiding smooths out incidental jitter at the trigger's edge.
 *
 * `scheduleShow`/`scheduleHide` apply the delay (used for both mouse hover
 * AND keyboard focus/blur here — a request-specific choice, unlike the
 * drill-peek's own instant-on-focus behavior). `showNow`/`hideNow` bypass
 * it entirely (used for click-driven UI, e.g. opening a popover should hide
 * the tooltip immediately, not after a lingering delay).
 */
export function useDelayedDisclosure({ showDelay = DEFAULT_SHOW_DELAY, hideDelay = DEFAULT_HIDE_DELAY } = {}) {
  const [open, setOpen] = useState(false);
  const showTimerRef = useRef(null);
  const hideTimerRef = useRef(null);

  useEffect(
    () => () => {
      clearTimeout(showTimerRef.current);
      clearTimeout(hideTimerRef.current);
    },
    []
  );

  const scheduleShow = useCallback(() => {
    clearTimeout(hideTimerRef.current);
    showTimerRef.current = setTimeout(() => setOpen(true), showDelay);
  }, [showDelay]);

  const scheduleHide = useCallback(() => {
    clearTimeout(showTimerRef.current);
    hideTimerRef.current = setTimeout(() => setOpen(false), hideDelay);
  }, [hideDelay]);

  const showNow = useCallback(() => {
    clearTimeout(showTimerRef.current);
    clearTimeout(hideTimerRef.current);
    setOpen(true);
  }, []);

  const hideNow = useCallback(() => {
    clearTimeout(showTimerRef.current);
    clearTimeout(hideTimerRef.current);
    setOpen(false);
  }, []);

  return { open, scheduleShow, scheduleHide, showNow, hideNow };
}
