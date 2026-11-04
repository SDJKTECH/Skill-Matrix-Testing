import { useEffect, useRef } from "react";

// If a list failed to load in the background, try once more when the panel
// that needs it opens. It runs only when `open` changes (other values are
// read from refs), so it retries once each time the panel opens, never in a loop.
export function useRetryOnOpen(open, state, retry) {
  const stateRef = useRef(state);
  const retryRef = useRef(retry);
  stateRef.current = state;
  retryRef.current = retry;

  useEffect(() => {
    if (open && stateRef.current === "error") retryRef.current();
  }, [open]);
}
