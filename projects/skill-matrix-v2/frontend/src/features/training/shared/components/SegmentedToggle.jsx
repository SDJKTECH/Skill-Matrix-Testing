import React from "react";

/**
 * Compact 2+-option segmented pill toggle — visually subordinate to
 * StatusTabs' sliding-indicator tabs (smaller, no sliding animation, meant
 * to sit inline next to a heading rather than as a primary tab row).
 * Originally the Manager Dashboard's Direct/Entire-Team scope control;
 * extracted here once a second use appeared (the By-Employee/By-Training
 * view-mode toggle) so both share one implementation instead of two copies
 * of the same pill markup drifting apart.
 *
 * `disabled`: for contexts where this control temporarily doesn't apply
 * (e.g. the Manager Dashboard's Team Alerts detail view — scope/view-mode
 * are meaningless while looking at one alert's own detail) — every option
 * button gets a real `disabled` attribute (not just a dimmed look), so a
 * manager can't accidentally change scope/view-mode out from under a
 * detail view that's relying on them staying put.
 *
 * Props: { options: [{key,label}], value, onChange, ariaLabel, disabled? }
 */
export default function SegmentedToggle({ options, value, onChange, ariaLabel, disabled = false }) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled}
      className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-900/40 p-0.5 text-[11px] font-semibold"
    >
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          role="radio"
          aria-checked={value === opt.key}
          disabled={disabled}
          onClick={() => onChange(opt.key)}
          className={`px-2.5 py-1 rounded-full transition-colors ${disabled ? "cursor-not-allowed" : "cursor-pointer"} ${
            value === opt.key
              ? "bg-blue-600 text-white shadow-sm"
              : disabled
                ? "text-gray-300 dark:text-gray-600"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
