import React, { useEffect, useId, useRef } from "react";

const FOCUS_RING =
  "peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-2 dark:peer-focus-visible:ring-offset-gray-900";

/**
 * Checkbox with our own look, built on a real checkbox input, so the keyboard
 * (Tab, Space) and screen readers still work.
 */
export default function ApprovalCheckbox({
  checked = false,
  indeterminate = false,
  onChange,
  disabled = false,
  label = null,
  "aria-label": ariaLabel,
  className = "",
  size = "sm",
}) {
  const inputRef = useRef(null);
  const autoId = useId();

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = Boolean(indeterminate) && !checked;
    }
  }, [indeterminate, checked]);

  const boxSize = size === "md" ? "h-[18px] w-[18px]" : "h-4 w-4";

  return (
    <label
      className={`inline-flex items-center gap-2 select-none ${
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
      } ${className}`}
    >
      <span className={`relative inline-flex shrink-0 ${boxSize}`}>
        <input
          ref={inputRef}
          id={autoId}
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          aria-checked={indeterminate && !checked ? "mixed" : checked}
          aria-label={ariaLabel}
          onChange={(event) => {
            if (disabled) return;
            onChange?.(event.target.checked, event);
          }}
        />
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 flex items-center justify-center rounded-[5px] border-2 transition-all duration-200 ease-out ${FOCUS_RING} ${
            checked || indeterminate
              ? "bg-blue-600 border-blue-600 dark:bg-blue-500 dark:border-blue-500 shadow-sm"
              : "bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 peer-hover:border-blue-400 dark:peer-hover:border-blue-400"
          }`}
        >
          {/* Tick mark with a small animation */}
          <svg
            viewBox="0 0 12 12"
            className={`h-2.5 w-2.5 text-white transition-all duration-200 ease-out ${
              checked && !indeterminate ? "opacity-100 scale-100" : "opacity-0 scale-50"
            }`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2.5 6.2 L4.8 8.5 L9.5 3.5" />
          </svg>
          {/* Dash shown when only some items are selected */}
          <span
            className={`absolute h-0.5 w-2 rounded-full bg-white transition-all duration-200 ease-out ${
              indeterminate && !checked ? "opacity-100 scale-100" : "opacity-0 scale-75"
            }`}
          />
        </span>
      </span>
      {label ? (
        <span className="text-xs text-gray-700 dark:text-gray-200">{label}</span>
      ) : null}
    </label>
  );
}

/** Hover and click effects shared by the Approve, Reject and bulk bar buttons. */
export const APPROVAL_ACTION_BTN =
  "transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-sm motion-reduce:transition-none motion-reduce:hover:translate-y-0";

// Written out here (not imported) because the lint rule needs a plain text
// value here. Keep it the same as the value in shared/config/focusRing.js.
export const APPROVAL_FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900";

// Button styles for Approve and Reject, used in single rows and the bulk bar
// so they look the same. Approve is filled (the usual choice); Reject is
// outlined (still easy to use, but less strong).
export const APPROVE_BUTTON_CLASS =
  "bg-green-600 text-white hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-500 active:bg-green-800 dark:active:bg-green-700 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-green-600 disabled:active:scale-100";

export const REJECT_BUTTON_CLASS =
  "ring-1 ring-red-500 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/20 active:bg-red-200 dark:active:bg-red-900/40 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:active:scale-100";
