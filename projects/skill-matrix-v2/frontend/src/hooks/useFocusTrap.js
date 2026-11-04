import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Shared focus-trap behavior for any dismissible overlay (modal, popover):
 * remembers what had focus before opening and restores it on close (WCAG
 * 2.4.3), moves focus into the overlay on open, cycles Tab/Shift+Tab within
 * it while open, and calls `onEscape` on the Escape key. Used by Modal.jsx;
 * inline (non-overlay) UI like shared/InlineDecisionPanel.jsx deliberately
 * doesn't use this — Tab should keep moving through the rest of the page
 * normally for a block that's part of page flow, not floating above it.
 *
 * @param {Object} opts
 * @param {boolean} opts.open
 * @param {React.RefObject} opts.containerRef - element to trap focus within
 * @param {React.RefObject} [opts.initialFocusRef] - focused first instead of the container itself, if given
 * @param {() => void} [opts.onEscape]
 */
export default function useFocusTrap({ open, containerRef, initialFocusRef, onEscape }) {
  const previouslyFocusedRef = useRef(null);

  useEffect(() => {
    if (open) {
      previouslyFocusedRef.current = document.activeElement;
    } else if (previouslyFocusedRef.current instanceof HTMLElement) {
      previouslyFocusedRef.current.focus();
      previouslyFocusedRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const focusTarget = initialFocusRef?.current || containerRef.current;
    focusTarget?.focus();
  }, [open, initialFocusRef, containerRef]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onEscape?.();
        return;
      }
      if (e.key !== "Tab") return;

      const focusable = Array.from(containerRef.current?.querySelectorAll(FOCUSABLE_SELECTOR) || []).filter(
        (el) => el.offsetParent !== null
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [open, onEscape, containerRef]);
}
