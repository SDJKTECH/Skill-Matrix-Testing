import React from "react";

/**
 * Circular SVG spinner + label, inline (icon then text) — the "Loading
 * batches…" markup from Training Batch's BatchTable.jsx, now the one
 * shared implementation instead of separately hand-drawn copies (Training
 * Batch, My Trainings, and Manager Dashboard's Home-screen loading gate
 * each drew their own before this, in two different visual styles).
 *
 * Just the icon+label unit, not a full-page layout — callers keep owning
 * their own outer centering wrapper (a card's `py-16` block vs a
 * full-page `h-full` center), since that varies by context and this
 * component has no opinion on it. Needs `flex items-center` on that
 * wrapper (every current caller already has it) for the icon and label to
 * sit on one line.
 */
export default function LoadingSpinner({ label, iconClassName = "h-5 w-5" }) {
  return (
    <>
      <svg className={`animate-spin mr-2 ${iconClassName}`} fill="none" viewBox="0 0 24 24" aria-hidden="true">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
      {label}
    </>
  );
}
