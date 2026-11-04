import { useRef } from "react";

/**
 * Stops a fast double click from saving twice. A ref changes at once, while
 * state changes only after a re-render, so the second click is blocked.
 * lock() and unlock() are separate, so callers can check the form first and
 * return early without locking.
 */
export function useSubmitGuard() {
  const ref = useRef(false);
  return {
    isLocked: () => ref.current,
    lock: () => {
      ref.current = true;
    },
    unlock: () => {
      ref.current = false;
    },
  };
}
