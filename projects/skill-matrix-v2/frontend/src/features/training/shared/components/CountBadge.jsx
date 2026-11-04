import React from "react";

/**
 * Number-only count pill — paired with a plain-text label beside it
 * (`<span>Skills</span><CountBadge count={6} />`), never a label baked
 * inside the same chip. Standard badge convention is one content type per
 * badge; a chip reading "Skills 6" mixes a category label with a count in
 * one shape, which is exactly what NotCompletedPill.jsx (label+count inside
 * one interactive chip) also does — but that one earns the exception by
 * being a real button that opens a popover. This badge is passive, so it
 * stays to the single-content-type rule the label+badge pairing convention
 * itself calls for.
 *
 * Zero state stays visible (muted colors, not hidden) so every row keeps
 * the same badge count and column alignment whether an employee has 0 or 20
 * of something — hiding at zero would make row shape vary employee to
 * employee, which is the opposite of what a scannable list wants.
 */
export default function CountBadge({ count, className = "" }) {
  const value = count ?? 0;
  const muted = value === 0;

  return (
    <span
      className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-[10px] font-semibold tabular-nums ${
        muted
          ? "bg-gray-50 dark:bg-gray-800 text-gray-300 dark:text-gray-600"
          : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
      } ${className}`}
    >
      {value}
    </span>
  );
}
