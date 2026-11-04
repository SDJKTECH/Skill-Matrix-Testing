import { useEffect, useState } from "react";

/**
 * Returns `value`, but only after it has stopped changing for `delayMs`
 * (so a search does not run on every key press). Returns [value, setValue],
 * like useState; setValue lets "Clear all filters" set it at once without
 * waiting. `initialValue` is the starting value (default: `value`).
 */
export function useDebouncedValue(value, delayMs, { initialValue = value } = {}) {
  const [debounced, setDebounced] = useState(initialValue);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return [debounced, setDebounced];
}
