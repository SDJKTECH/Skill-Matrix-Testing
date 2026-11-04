import { useEffect } from "react";

/**
 * CROSS-6: the "when some tracked value changes, scroll a container back to
 * top" pattern was hand-rolled 3 different ways (EmployeeTrainingPanel.jsx:
 * a direct ref, synchronous; BatchTable.jsx: an ancestor-walk via
 * getScrollContainer, 240ms-delayed; TeamTrainingStatusCard.jsx: a self-or-
 * descendant-or-ancestor fallback chain, 240ms-delayed). Each genuinely
 * needs its OWN container-resolution strategy — see each call site's own
 * doc comment for why (some scroll regions are real ancestors, one is a
 * descendant, one site already owns a direct ref) — this hook does NOT try
 * to pick one strategy for everyone.
 *
 * `getContainer` is supplied by the caller and re-invoked at scroll time
 * (not resolved once upfront); returning null/undefined is a safe no-op —
 * lets a caller like BatchTable.jsx fold its own "only reset when something
 * is actually expanded" guard into the resolver itself, rather than this
 * hook needing separate guard-condition API surface. `delay` defaults to 0
 * (synchronous), matching EmployeeTrainingPanel.jsx's own original timing.
 */
export function useScrollResetOnChange(getContainer, deps, { delay = 0 } = {}) {
  useEffect(() => {
    if (!delay) {
      getContainer()?.scrollTo({ top: 0, behavior: "auto" });
      return undefined;
    }
    const t = setTimeout(() => {
      getContainer()?.scrollTo({ top: 0, behavior: "auto" });
    }, delay);
    return () => clearTimeout(t);
    // `deps` is intentionally an opaque, caller-supplied array (that's the
    // whole point of this hook: each of the 3 call sites tracks genuinely
    // different values) — exhaustive-deps can't statically verify a
    // forwarded array, a known, expected limitation for this class of
    // generic wrapper hook, not an oversight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
