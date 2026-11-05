import { useEffect, useRef } from "react";

// Calls flushFn on visibilitychange(hidden)/beforeunload/pagehide/unmount —
// the generic "don't lose unsaved state when the user leaves" wiring, with
// no knowledge of what's being saved or how. flushFn is read from a ref so
// listeners are registered once (mount) and never need to resubscribe just
// because the caller's save function identity changed between renders.
export function useFlushOnExit(flushFn) {
  const flushRef = useRef(flushFn);
  flushRef.current = flushFn;

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushRef.current();
    };
    const onPageHide = () => flushRef.current();

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("beforeunload", onPageHide);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("beforeunload", onPageHide);
      window.removeEventListener("pagehide", onPageHide);
      flushRef.current(); // component unmount — same as exiting
    };
  }, []);
}
