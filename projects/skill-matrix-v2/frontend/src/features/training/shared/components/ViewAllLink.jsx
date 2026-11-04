import React from "react";
import { FiChevronRight } from "react-icons/fi";
import HoverPillLabel from "./HoverPillLabel";

/**
 * Standardized "view more" trigger — no underline; hover/focus-visible
 * darkens the text and shows a soft blue pill background instead (the pill
 * mechanics themselves live in HoverPillLabel, shared with EntityCard.jsx's
 * footer CTA, which uses the same reveal but a different rest-state color
 * and icon — see that component's own doc comment). Covers both
 * page-navigation links (e.g. Training Progress's header "View All") and
 * in-place expand/collapse toggles (every card's own "View All"/"Show
 * less" — pass `expanded` to rotate the chevron upward instead of
 * swapping icons).
 */
export default function ViewAllLink({ onClick, expanded, children, className = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      className={`group shrink-0 cursor-pointer ${className}`}
    >
      <HoverPillLabel className="gap-0.5 text-xs font-semibold text-blue-600 dark:text-blue-400 group-hover:text-blue-700 dark:group-hover:text-blue-300 group-focus-visible:text-blue-700 dark:group-focus-visible:text-blue-300">
        {children}
        <FiChevronRight
          className={`h-3 w-3 shrink-0 transition-transform duration-200 motion-safe:group-hover:translate-x-px motion-safe:group-focus-visible:translate-x-px ${expanded ? "-rotate-90" : ""}`}
        />
      </HoverPillLabel>
    </button>
  );
}
