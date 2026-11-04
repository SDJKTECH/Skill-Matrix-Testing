import React, { forwardRef } from "react";

// The border makes the label easy to see next to normal text.
const BASE_CLASS =
  "shrink-0 whitespace-nowrap inline-flex items-center px-1.5 py-0.5 rounded-full border text-[10px] font-medium bg-orange-100 border-orange-200 text-orange-800 dark:bg-orange-900/30 dark:border-orange-800/50 dark:text-orange-300";
const INTERACTIVE_CLASS =
  "cursor-pointer transition-colors hover:bg-orange-200 dark:hover:bg-orange-900/50 active:bg-orange-300 dark:active:bg-orange-900/70";

/**
 * Small "N not completed" label. It is used on the Training Batch page and
 * the Team Training Status page. It is not shown when count is 0.
 * If `interactive` is true, the user can click it; if not, it is plain text.
 */
const NotCompletedPill = forwardRef(function NotCompletedPill({ count, interactive = false, className = "", ...rest }, ref) {
  if (!count || count <= 0) return null;

  const classes = `${BASE_CLASS} ${interactive ? INTERACTIVE_CLASS : ""} ${className}`.trim();
  const label = `${count} not completed`;

  if (interactive) {
    return (
      <button ref={ref} type="button" className={classes} {...rest}>
        {label}
      </button>
    );
  }
  return (
    <span ref={ref} className={classes} {...rest}>
      {label}
    </span>
  );
});

export default NotCompletedPill;
