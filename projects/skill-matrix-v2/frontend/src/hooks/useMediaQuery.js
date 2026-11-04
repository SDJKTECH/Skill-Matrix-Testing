import { useState, useEffect } from "react";

/**
 * Returns true when the media query matches (e.g. mobile when max-width: 767px).
 * Matches Tailwind's default "md" breakpoint: mobile = below 768px.
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const media = window.matchMedia(query);
    setMatches(media.matches);
    const listener = (e) => setMatches(e.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [query]);

  return matches;
}

/** True when viewport width is below Tailwind md (768px). */
export function useIsMobile() {
  return useMediaQuery("(max-width: 767px)");
}
