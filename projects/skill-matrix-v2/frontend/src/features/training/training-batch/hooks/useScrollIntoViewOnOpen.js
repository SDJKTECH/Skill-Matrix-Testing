import { useEffect, useRef } from "react";

// Scrolls a panel into view when it opens. Returns a ref to put on the panel.
// It runs when `openKey` gets a value or changes to another one (e.g. Edit on
// another row), not while the user types. A short wait lets the panel appear first.
export function useScrollIntoViewOnOpen(openKey, { block = "start" } = {}) {
  const ref = useRef(null);

  useEffect(() => {
    if (!openKey) return;
    const t = setTimeout(() => ref.current?.scrollIntoView({ behavior: "smooth", block }), 50);
    return () => clearTimeout(t);
  }, [openKey, block]);

  return ref;
}
