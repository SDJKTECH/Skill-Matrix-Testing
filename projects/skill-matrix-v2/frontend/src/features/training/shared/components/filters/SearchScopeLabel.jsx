import React from "react";

/**
 * "Searching in: X" pill — always visible next to a search field so users
 * never wonder where their query is running (UX doc §5.1). Pure display;
 * the caller decides what `scope` text means for its own page (active tab,
 * By Employee/Direct Reports toggle state, active filter chips, etc).
 */
export default function SearchScopeLabel({ scope, className = "" }) {
  if (!scope) return null;
  return (
    <span
      className={`inline-flex items-center shrink-0 rounded-full bg-gray-100 dark:bg-gray-700/60 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:text-gray-400 ${className}`}
    >
      Searching in: <span className="ml-1 text-gray-700 dark:text-gray-300">{scope}</span>
    </span>
  );
}
