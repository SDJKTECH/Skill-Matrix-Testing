import React from "react";
import { FiFilter } from "react-icons/fi";

// Kept as this file's own literal (not an alias/re-export of the shared
// shared/config/focusRing.js token) on purpose: eslint's
// react-refresh/only-export-components rule only recognizes a literal
// constant expression here as Fast-Refresh-safe (`allowConstantExport`) —
// `export const ICON_REVEAL_FOCUS = FOCUS_RING` (an identifier reference)
// trips it. Same string either way; see focusRing.js for the source of
// truth this should still match if it's ever intentionally changed.
export const ICON_REVEAL_FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900";

/**
 * Shared icon trigger for "quiet icon → interactive surface" patterns
 * (column filters, expandable search, etc.). Presentation only — open/close
 * state and what the surface contains stay in the caller.
 *
 * Prefer `count` for filters (shows how many values are applied). Use
 * `indicator` only when a binary active cue is enough (e.g. search has text).
 */
export default function IconRevealTrigger({
  open = false,
  active = false,
  onClick,
  onKeyDown,
  icon,
  "aria-label": ariaLabel,
  "aria-expanded": ariaExpanded,
  "aria-controls": ariaControls,
  "aria-haspopup": ariaHasPopup,
  indicator = false,
  count = null,
  title,
  className = "",
  buttonRef,
  size = "sm",
  rounded = "md",
}) {
  const Icon = icon ?? FiFilter;
  const sizeClass = size === "md" ? "h-9 w-9" : "h-6 w-6";
  const iconClass = size === "md" ? "h-3.5 w-3.5" : "h-3 w-3";
  const roundedClass = rounded === "full" ? "rounded-full" : "rounded-md";
  const numericCount = typeof count === "number" && count > 0 ? count : 0;
  const emphasized = open || active || numericCount > 0;

  return (
    <button
      ref={buttonRef}
      type="button"
      title={title}
      aria-label={ariaLabel}
      aria-expanded={ariaExpanded ?? open}
      aria-controls={ariaControls}
      aria-haspopup={ariaHasPopup}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={`relative inline-flex items-center justify-center shrink-0 transition-colors duration-200 cursor-pointer ${ICON_REVEAL_FOCUS} ${sizeClass} ${roundedClass} ${
        emphasized
          ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30"
          : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
      } ${className}`}
    >
      <Icon className={iconClass} aria-hidden="true" />
      {numericCount > 0 ? (
        <span
          className="absolute -top-1 -right-1.5 min-w-[14px] h-[14px] px-1 flex items-center justify-center rounded-full bg-blue-600 dark:bg-blue-500 text-[8px] font-bold leading-none text-white shadow-sm ring-1 ring-white dark:ring-gray-900"
          aria-hidden="true"
        >
          {numericCount > 99 ? "99+" : numericCount}
        </span>
      ) : indicator ? (
        <span
          className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-blue-600 dark:bg-blue-400 ring-1 ring-white dark:ring-gray-900"
          aria-hidden="true"
        />
      ) : null}
    </button>
  );
}
