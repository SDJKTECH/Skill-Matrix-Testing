import React, { useState } from "react";
import { FiChevronDown, FiTrendingUp } from "react-icons/fi";
import BarListRow from "./BarListRow";

const DOMAIN_BAR_COLORS = ["#a5b4fc", "#67e8f9", "#86efac", "#c4b5fd", "#d1d5db"];

// Rows shown before "View More" is needed — a fixed, always-legible row
// count + an explicit expand affordance, not a fixed-pixel min-height/
// max-height guess (the previous version of this card used
// min-h-[320px]/maxHeight:"280px", which works on some monitors and
// silently fails on shorter ones). Same convention TrainingProgressCard.jsx
// already uses on the Home Screen for its own status list.
const COLLAPSED_ROW_COUNT = 4;

/**
 * "Top Skill Domains" card. Shows the first COLLAPSED_ROW_COUNT rows with a
 * "View More" toggle for the rest instead of a fixed-height scroll region.
 *
 * Props: { domains: [{name, count}] }
 */
export default function SkillDomainsCard({ domains }) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = domains.length > COLLAPSED_ROW_COUNT;
  const visibleDomains = expanded ? domains : domains.slice(0, COLLAPSED_ROW_COUNT);
  const maxCount = domains[0]?.count || 0;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-2.5 flex flex-col cursor-default">
      <div className="flex items-center gap-1.5 mb-2 shrink-0">
        <FiTrendingUp className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
        <h2 className="text-xs font-semibold text-gray-900 dark:text-white">Top Skill Domains</h2>
      </div>
      {domains.length === 0 ? (
        <p className="text-sm text-gray-500 py-3">No domain data yet</p>
      ) : (
        <div className="flex flex-col">
          <div className="space-y-1.5">
            {visibleDomains.map((d, idx) => (
              <BarListRow
                key={d.name}
                label={d.name}
                value={d.count.toLocaleString()}
                widthPercent={maxCount ? Math.max(10, (d.count / maxCount) * 100) : 0}
                color={DOMAIN_BAR_COLORS[idx % DOMAIN_BAR_COLORS.length]}
              />
            ))}
          </div>

          {hasMore && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="shrink-0 w-full flex items-center justify-center gap-1 py-1 mt-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors cursor-pointer"
            >
              {expanded ? "Show Less" : `View More (${domains.length - COLLAPSED_ROW_COUNT})`}
              <FiChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
