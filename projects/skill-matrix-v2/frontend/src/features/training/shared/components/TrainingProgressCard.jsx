import React, { useState } from "react";
import { FiChevronRight, FiInbox } from "react-icons/fi";
import YearFilter from "./YearFilter";
import ViewAllLink from "./ViewAllLink";

// Icon/background tokens for each row's status color. Same family as
// StatusChipRow's own COLOR_CLASSES (indigo/green/blue/gray) plus
// amber/red for statuses that only ever appear in this card's own status
// list, not the 4-tab STATUS_BUCKET_CONFIG StatusChipRow renders.
const PROGRESS_ROW_COLORS = {
  indigo: { iconBg: "bg-indigo-50 dark:bg-indigo-900/20", icon: "text-indigo-500 dark:text-indigo-400" },
  blue: { iconBg: "bg-blue-50 dark:bg-blue-900/20", icon: "text-blue-500 dark:text-blue-400" },
  green: { iconBg: "bg-green-50 dark:bg-green-900/20", icon: "text-green-500 dark:text-green-400" },
  gray: { iconBg: "bg-gray-100 dark:bg-gray-700", icon: "text-gray-500 dark:text-gray-400" },
  amber: { iconBg: "bg-amber-50 dark:bg-amber-900/20", icon: "text-amber-500 dark:text-amber-400" },
  red: { iconBg: "bg-red-50 dark:bg-red-900/20", icon: "text-red-500 dark:text-red-400" },
};

// Rows shown before "View More" is needed — sized so the card's default
// (collapsed) height stays modest regardless of how short a viewer's
// browser viewport is. Deliberately NOT "however many rows fit today's
// viewport": that number is unknowable at render time and differs per
// screen, so a fixed, always-legible row count + an explicit expand
// affordance is the only version of "no scroll needed" that actually holds
// across screens, rather than a min-height guess that works on some
// monitors and silently fails on shorter ones (see the min-h-[480px]
// version this replaced — measured on a real 585px-tall viewport, that
// approach needed ~460px more room than existed).
const COLLAPSED_ROW_COUNT = 4;

/**
 * Home Screen "Training Progress" card — a year-filterable, dynamic-length
 * list of status rows (icon / label / count / chevron), sized to whatever
 * `statuses` it's given rather than any fixed row count. Shows the first
 * COLLAPSED_ROW_COUNT rows by default with a "View More" toggle for the
 * rest, same collapse/expand convention as this page's own "Top Skill
 * Domains" card (allDomains.slice(0, 4) + View All/Show Less).
 *
 * Props:
 *   statuses       — [{ key, label, icon, color, count }], any length incl. 0
 *   years          — number[] for the YearFilter dropdown
 *   selectedYear   — currently selected year
 *   onYearChange   — (year) => void
 *   onViewAll      — () => void, "View All" trigger (navigates to the full My Trainings page — distinct from the in-card "View More" expand toggle below)
 *   onSelectStatus — (statusKey) => void, fired on row click
 */
export default function TrainingProgressCard({
  statuses,
  years,
  selectedYear,
  onYearChange,
  onViewAll,
  onSelectStatus,
}) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = statuses.length > COLLAPSED_ROW_COUNT;
  const visibleStatuses = expanded ? statuses : statuses.slice(0, COLLAPSED_ROW_COUNT);

  return (
    // No sm:col-span-2/md:col-span-1 — this card lives in SelfDashboard.jsx's
    // Quick Actions/Open Batches row, a 3-equal-column grid at md+ (2 at sm,
    // 1 on mobile) where every card naturally takes its own slot, same as
    // the 3-column bottom row Pending Approvals occupies.
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-2.5 h-full flex flex-col overflow-hidden min-h-[150px] cursor-default transition-[transform,box-shadow] duration-300 motion-safe:hover:-translate-y-[3px] hover:shadow-md">
      <div className="flex items-center justify-between mb-1.5 shrink-0 gap-2">
        <h2 className="text-xs font-semibold text-gray-900 dark:text-white shrink-0">Training Progress</h2>
        <div className="flex items-center gap-2 shrink-0">
          <YearFilter years={years} value={selectedYear} onChange={onYearChange} />
          <ViewAllLink onClick={onViewAll}>View All</ViewAllLink>
        </div>
      </div>

      {statuses.length === 0 ? (
        // Same empty-state idiom as the Pending Approvals card elsewhere on
        // this page: centered icon + two-line message, identical type scale.
        <div className="flex-1 flex flex-col items-center justify-center text-center min-h-0">
          <FiInbox className="h-7 w-7 text-gray-300 dark:text-gray-600 mb-1" />
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">No trainings yet</p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500">Status breakdown will appear here</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Visible (not hidden) scrollbar — this only ever engages when
              the grid genuinely can't give this card enough room for even
              the collapsed row count (a very short viewport); a real
              scrollbar here is discoverable, unlike the hide-scrollbar
              pattern used elsewhere on this page, which is what let rows
              silently clip off-screen before this card had a "View More"
              affordance at all.
              justify-center: this card is stretched to match its Quick
              Actions row-mate's height (see SelfDashboard.jsx's grid —
              equal-height by default), which is usually taller than a
              short 3-4-row status list needs; without this the list would
              sit flush at the top with a dead gap trailing below it.
              Centering the rows as a group in whatever extra height exists
              reads as deliberate, same idea as the "All caught up!" empty
              state on this same page's Pending Approvals card. Still
              scrolls (not clipped) if the reverse happens and there's LESS
              room than the rows need. */}
          <div className="flex-1 flex flex-col justify-center space-y-0.5 overflow-y-auto overflow-x-hidden min-h-0">
            {visibleStatuses.map((status) => {
              const colors = PROGRESS_ROW_COLORS[status.color] || PROGRESS_ROW_COLORS.gray;
              return (
                <button
                  key={status.key}
                  type="button"
                  onClick={() => onSelectStatus?.(status.key)}
                  className="group w-full flex items-center gap-2 py-0.5 px-2 rounded-lg border-l-[3px] border-l-transparent hover:border-l-blue-300 dark:hover:border-l-blue-300 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors duration-200 cursor-pointer text-left"
                >
                  <div className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center ${colors.iconBg}`}>
                    <status.icon className={`h-3.5 w-3.5 ${colors.icon}`} />
                  </div>
                  <span className="flex-1 min-w-0 text-xs text-gray-700 dark:text-gray-300 truncate">{status.label}</span>
                  <span className="text-xs font-semibold text-gray-900 dark:text-white shrink-0">{status.count}</span>
                  <FiChevronRight className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600 shrink-0" />
                </button>
              );
            })}
          </div>

          {hasMore && (
            <ViewAllLink
              onClick={() => setExpanded((v) => !v)}
              expanded={expanded}
              className="w-full justify-center py-1 mt-0.5"
            >
              {expanded ? "Show less" : "View All"}
            </ViewAllLink>
          )}
        </div>
      )}
    </div>
  );
}
