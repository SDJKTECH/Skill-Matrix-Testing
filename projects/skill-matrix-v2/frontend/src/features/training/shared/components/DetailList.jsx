import React from "react";

/**
 * "Title (N)" + a divided list of items — the shell
 * NotCompletedPreview.jsx originally hand-rolled inline (title styling +
 * `space-y-2.5` + a `border-t ... first:border-t-0` divider per row).
 * Extracted so the Skills/Certificates hover panels (EmployeeRow.jsx, via
 * Tooltip's `variant="panel"`) reuse the exact same title/spacing/divider
 * treatment instead of a second hand-copied version, and so
 * NotCompletedPreview itself now composes this rather than owning its own
 * copy. Presentational only — no positioning/portal/open-state logic of its
 * own; that stays owned by whatever wraps it (Tooltip in panel mode, or
 * NotCompletedPreview's own dialog chrome).
 *
 * `keyExtractor` defaults to `.key` (Skills/Certificates items) falling
 * back to `.id` (cert items) then index — callers with a different natural
 * id (e.g. NotCompletedPreview's trainings, keyed by `id ?? moduleName`)
 * pass their own.
 */
export default function DetailList({ title, items, renderItem, keyExtractor = (item, i) => item.key ?? item.id ?? i }) {
  return (
    <>
      <p className="text-xs font-semibold text-gray-900 dark:text-white mb-2">{title}</p>
      <div className="space-y-2.5">
        {items.map((item, i) => (
          <div key={keyExtractor(item, i)} className="border-t border-gray-100 dark:border-gray-700 pt-2 first:border-t-0 first:pt-0">
            {renderItem(item)}
          </div>
        ))}
      </div>
    </>
  );
}
