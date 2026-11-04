import { useCallback, useEffect, useState } from "react";

/**
 * Keeps one search value in the page URL (e.g. ?batch_q=python), so a copied
 * link opens with the same search. It replaces the URL instead of adding to
 * the browser history, so typing does not fill the Back button history.
 * It only saves the search text, not which tab is open.
 *
 * @param {string} key - query param name, e.g. "q"
 * @param {string} [defaultValue] - used when the URL doesn't have this
 *   param yet (first load, no shared link) — e.g. a caller's own
 *   localStorage-persisted last search. The URL wins once present.
 * @returns {[string, (value: string) => void]}
 */
export default function useUrlSearchParam(key, defaultValue = "") {
  const [value, setValue] = useState(() => {
    if (typeof window === "undefined") return defaultValue;
    return new URLSearchParams(window.location.search).get(key) || defaultValue;
  });

  const update = useCallback(
    (next) => {
      setValue(next);
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      if (next) params.set(key, next);
      else params.delete(key);
      const query = params.toString();
      const url = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
      window.history.replaceState(window.history.state, "", url);
    },
    [key]
  );

  // The app has no page routes, so when the user leaves this tab, remove this
  // value from the URL. Otherwise the old search stays in the address bar.
  // Only this hook's own key is removed; other values in the URL stay.
  useEffect(() => {
    return () => {
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      if (!params.has(key)) return;
      params.delete(key);
      const query = params.toString();
      const url = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
      window.history.replaceState(window.history.state, "", url);
    };
  }, [key]);

  return [value, update];
}
