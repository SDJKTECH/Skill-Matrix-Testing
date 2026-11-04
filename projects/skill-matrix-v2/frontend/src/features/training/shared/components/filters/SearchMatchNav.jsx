import React from "react";
import { FiChevronUp, FiChevronDown } from "react-icons/fi";
import { ICON_REVEAL_FOCUS } from "./IconRevealTrigger";

/**
 * "n of N" match pill for a search box, with optional prev/next cycling.
 * Pass onPrev/onNext for a cycling pill ("3 of 12" + chevrons); omit both
 * for a count-only pill ("12 employees"). Renders nothing at count 0.
 */
export default function SearchMatchNav({ count, activeIndex = 0, onPrev, onNext, itemLabel = "results", className = "" }) {
  if (!count) return null;
  const cyclable = typeof onPrev === "function" && typeof onNext === "function";

  return (
    <span
      className={`inline-flex items-center shrink-0 gap-0.5 rounded-full bg-gray-100 dark:bg-gray-700/60 pl-2 py-0.5 text-[10px] font-medium text-gray-500 dark:text-gray-400 ${
        cyclable ? "pr-0.5" : "pr-2"
      } ${className}`}
    >
      <span aria-live="polite">
        {cyclable ? `${Math.min(activeIndex + 1, count)} of ${count}` : count} {itemLabel}
      </span>
      {cyclable && (
        <span className="inline-flex items-center">
          <button
            type="button"
            onClick={onPrev}
            aria-label="Previous match"
            className={`inline-flex items-center justify-center h-4 w-4 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 ${ICON_REVEAL_FOCUS}`}
          >
            <FiChevronUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onNext}
            aria-label="Next match"
            className={`inline-flex items-center justify-center h-4 w-4 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 ${ICON_REVEAL_FOCUS}`}
          >
            <FiChevronDown className="h-3 w-3" />
          </button>
        </span>
      )}
    </span>
  );
}
