import React, { useState } from "react";
import { FiAlertCircle, FiCheckCircle, FiChevronRight, FiClock } from "react-icons/fi";
import SegmentedToggle from "./SegmentedToggle";

const COLLAPSED_ROW_COUNT = 4;
const ALL = "all";
const formatShortDate = (date) => new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/**
 * Home Screen "Approval activity" card — collapses to COLLAPSED_ROW_COUNT
 * items; the header has one "view all" button per `groups` entry that has items
 * (matched by `item.ownership`), each opening that group's page. Card shell
 * style shared with TrainingProgressCard, OpenBatchesCard, and Top
 * Skill Domains. This page has no fixed-height ancestor to scroll-clip a
 * CSS max-height region against (MainComponent.jsx's wrapper is the sole
 * scroll owner — see SelfDashboard.jsx's own note), so a data-level cap is
 * what actually keeps this card small and predictable regardless of item
 * count or screen size.
 *
 * Extracted from SelfDashboard.jsx (2026-08-21) to match its sibling widget
 * TrainingProgressCard.jsx's already-established convention: this page
 * composes reusable cards rather than inlining one widget's ~40 lines of
 * internal rendering while its neighbor is a real component — same
 * reasoning, `className` (not a baked-in grid-span) is the caller's way to
 * position this in whichever grid row it currently lives in, since that's
 * a layout concern the CALLER owns, not this card.
 *
 * Props: { items: [{key, icon, name, ownership, status, subtitle?, date?, onClick?, actionLabel?}], groups: [{key, label, onViewAll, isDefault?}], className? }
 */
export default function PendingApprovalsCard({ items, groups = [], className = "" }) {
  const groupCounts = groups.map((g) => ({ ...g, count: items.filter((item) => item.ownership === g.key).length })).filter((g) => g.count); // groups with no items get no header button
  const [filterKey, setFilterKey] = useState(null); // null = default: the group marked `isDefault` if it has items, else All
  const activeKey = filterKey === ALL || groupCounts.some((g) => g.key === filterKey) ? filterKey : groupCounts.find((g) => g.isDefault)?.key ?? ALL;
  const shownItems = activeKey === ALL ? items : items.filter((item) => item.ownership === activeKey);
  const visibleItems = shownItems.slice(0, COLLAPSED_ROW_COUNT);
  const hasAction = visibleItems.some((item) => item.actionLabel); // reserve the Review slot only when a visible row has one
  const decisionCount = shownItems.filter((item) => item.actionLabel).length; // hidden on the "My nominations" tab

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-2.5 h-full flex flex-col overflow-hidden cursor-default transition-[transform,box-shadow] duration-300 motion-safe:hover:-translate-y-[3px] hover:shadow-md ${className}`}>
      <div className="flex flex-wrap items-center mb-1.5 pb-1.5 border-b border-gray-100 dark:border-gray-700 shrink-0 gap-1.5">
        <h2 className="text-xs font-semibold text-gray-900 dark:text-white shrink-0 mr-auto">Training approval activity</h2>
        {groupCounts.length > 1 && <SegmentedToggle options={[{ key: ALL, label: "All" }, ...groupCounts.map((g) => ({ key: g.key, label: g.label }))]} value={activeKey} onChange={setFilterKey} ariaLabel="Filter training approval activity" />}
        {groupCounts.map((g) => (
          <button key={g.key} type="button" onClick={g.onViewAll} aria-label={`View all ${g.label} (${g.count})`} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30 text-[10px] font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 cursor-pointer transition-colors">{g.label} ({g.count}) <FiChevronRight className="h-3 w-3" /></button>
        ))}
      </div>
      {decisionCount > 0 && (
        <p className="flex items-start gap-1 mb-1.5 text-[10px] font-medium text-amber-700 dark:text-amber-300 shrink-0">
          <FiAlertCircle className="h-3 w-3 mt-px shrink-0" aria-hidden="true" />
          {decisionCount === 1
            ? "Action required: 1 training request is awaiting your decision. Please review and approve or reject this request."
            : `Action required: ${decisionCount} training requests are awaiting your decision. Please review and approve or reject these requests.`}
        </p>
      )}
      {items.length > 0 ? (
        <div className="flex-1 flex flex-col justify-start divide-y divide-gray-100 dark:divide-gray-700 overflow-y-auto overflow-x-hidden min-h-0">
          {visibleItems.map((item) => {
            const meta = [item.subtitle, item.date && `on ${formatShortDate(item.date)}`].filter(Boolean).join(" ");
            const Tag = item.onClick ? "button" : "div";
            return (
              <Tag
                key={item.key}
                type={item.onClick ? "button" : undefined}
                onClick={item.onClick || undefined}
                className={`group flex flex-wrap sm:flex-nowrap w-full items-center gap-x-2 gap-y-0.5 px-1.5 py-1 min-h-8 text-left ${
                  item.onClick ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors duration-200" : ""
                }`}
              >
                {/* Fixed-width columns keep every row aligned: label | name | meta | status | action. Phones: name wraps below, meta hidden. */}
                <span className="w-28 flex items-center gap-1 text-[9px] font-semibold text-violet-600 dark:text-violet-400 shrink-0"><item.icon className="h-3 w-3 shrink-0" />{item.ownership}</span>
                <span className="order-last basis-full sm:order-none sm:basis-auto min-w-0 sm:w-[24%] sm:shrink-0 text-[11px] font-semibold text-gray-900 dark:text-gray-100 truncate">{item.name}</span>
                <span title={meta} className="hidden sm:block flex-1 min-w-0 text-[9px] text-gray-500 dark:text-gray-400 truncate">{meta}</span>
                {/* Red when the user must act, amber when waiting on someone else. */}
                <span className={`ml-auto sm:ml-0 w-28 whitespace-nowrap text-center text-[9px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${item.actionLabel ? "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300" : "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"}`}>{!item.actionLabel && <FiClock className="inline h-2.5 w-2.5 mr-0.5 align-[-1px]" aria-hidden="true" />}{item.status}</span>
                {(hasAction || item.actionLabel) && <span aria-hidden={!item.actionLabel} className={`w-14 shrink-0 ${item.actionLabel ? "text-center text-[10px] font-semibold py-0.5 rounded-md bg-blue-600 text-white shadow-sm transition group-hover:bg-blue-700 group-hover:shadow group-active:bg-blue-800 motion-safe:group-active:scale-95" : ""}`}>{item.actionLabel}</span>}
              </Tag>
            );
          })}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <FiCheckCircle className="h-7 w-7 text-green-300 dark:text-green-700 mb-1" />
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">All caught up!</p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500">No requests are waiting and no approvals require your action.</p>
        </div>
      )}
    </div>
  );
}
