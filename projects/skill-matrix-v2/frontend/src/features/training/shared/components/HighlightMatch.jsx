import React from "react";
import { getMatchSegments } from "../config/searchMatch";

/**
 * Shows `text` and marks the part that matches the search word `query`.
 * If there is no search word or no match, it shows the text as it is.
 */
export default function HighlightMatch({ text, query }) {
  const segments = getMatchSegments(text, query);
  return segments.map((segment, i) =>
    segment.match ? (
      <mark key={i} className="bg-amber-200/80 dark:bg-amber-500/30 text-inherit rounded-sm px-0.5">
        {segment.text}
      </mark>
    ) : (
      <React.Fragment key={i}>{segment.text}</React.Fragment>
    )
  );
}
