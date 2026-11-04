import React from "react";

/**
 * One "label + horizontal proportion bar + right-aligned value" row — shared
 * markup behind SkillDomainsCard.jsx and SkillLevelDistributionCard.jsx,
 * which previously hand-duplicated the same flex/bar/value structure with
 * only their own width%/color math differing. Deliberately takes an
 * already-computed `widthPercent` and `color` rather than raw counts — each
 * card keeps its own width-formula and color-picking logic (they genuinely
 * differ: SkillDomainsCard floors at 10% and cycles a color array by index;
 * SkillLevelDistributionCard has no floor and looks its color up by a fixed
 * key) — this component only owns the shared row markup, not that per-card
 * math. `title` defaults to `label` since both current callers pass the
 * same string for each.
 */
export default function BarListRow({
  label,
  title,
  value,
  widthPercent,
  color,
  labelClassName = "w-28",
  valueClassName = "w-10",
}) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <span className={`text-xs text-gray-700 dark:text-gray-300 shrink-0 truncate ${labelClassName}`} title={title ?? label}>
        {label}
      </span>
      <div className="flex-1 h-4 bg-gray-100 dark:bg-gray-700 rounded-md overflow-hidden">
        <div className="h-full rounded-md transition-all" style={{ width: `${widthPercent}%`, backgroundColor: color }} />
      </div>
      <span className={`text-xs font-semibold text-gray-900 dark:text-white text-right shrink-0 ${valueClassName}`}>{value}</span>
    </div>
  );
}
