import React from "react";
import { FiCheckCircle, FiInbox } from "react-icons/fi";
import BatchListItem from "./BatchListItem";
import ViewAllLink from "./ViewAllLink";
import { OPEN_BATCH_STATUS_STYLES } from "../config/openBatchesAdapter";

// Scoped, injected-once animation CSS — same pattern OpenEnrollmentGrid.jsx
// already uses for its own card-highlight keyframes (one <style> tag per
// card, not per row). `both` fill-mode on obc-row holds the "from" state
// (opacity 0, translateY 8px) through each row's own animation-delay, which
// is what makes the stagger visible instead of every row popping in at once
// then just re-animating in place.
const OPEN_BATCHES_STYLES = `
  @keyframes obc-fade-rise {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes obc-ripple-expand {
    from { opacity: 0.35; transform: scale(0); }
    to { opacity: 0; transform: scale(9); }
  }
  .obc-row { animation: obc-fade-rise 260ms ease-out both; }
  .obc-ripple { animation: obc-ripple-expand 500ms ease-out forwards; }
  @media (prefers-reduced-motion: reduce) {
    .obc-row { animation: none; }
    .obc-ripple { animation: none; opacity: 0; }
  }
`;

const COLLAPSED_ROW_COUNT = 3;

/**
 * Home Screen "Open Batches" card — row 2, between Quick Actions and
 * Training Progress (see SelfDashboard.jsx's grid). Shows only batches
 * this employee has never requested (see openBatchesAdapter.js's
 * isUnrequestedOpenBatch) — the whole point is to prompt a NEW nomination,
 * so there's no filter/toggle to a broader "All open batches" view. Data
 * comes from hooks/useOpenBatchesCard.js — this component never fetches
 * (DIP).
 *
 * Collapses to COLLAPSED_ROW_COUNT rows, no in-card expand toggle — the
 * header's ViewAllLink instead navigates to the real Open Enrollment
 * catalog (`onViewAll`, same onOpenTrainingsPanel(null, null, true) call
 * Quick Actions' "Nominate for Training" hero action already uses), so
 * "View All" always means the same place everywhere it appears.
 *
 * Rows are top-aligned (no `justify-center` on the list container) rather
 * than vertically centered within this card's grid-stretched height — a
 * centered group left a visually "empty" gap below the last row that read
 * as unfinished, unlike TrainingProgressCard's own centering (kept as-is
 * there), which sits below a taller, denser header (year filter + link) so
 * the same centered gap doesn't read as empty in the same way.
 *
 * Props: { unrequestedItems, totalOpenCount?, onItemClick?, onViewAll?, className? }
 */
export default function OpenBatchesCard({
  unrequestedItems,
  totalOpenCount = 0,
  onItemClick,
  onViewAll,
  className = "",
}) {
  const visibleItems = unrequestedItems.slice(0, COLLAPSED_ROW_COUNT);

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-2.5 flex flex-col overflow-hidden min-h-[150px] cursor-default transition-[transform,box-shadow] duration-300 motion-safe:hover:-translate-y-[3px] hover:shadow-md ${className}`}>
      <style>{OPEN_BATCHES_STYLES}</style>
      <div className="flex items-center justify-between mb-1.5 shrink-0 gap-2">
        <h2 className="text-xs font-semibold text-gray-900 dark:text-white shrink-0">Open Batches</h2>
        {unrequestedItems.length > 0 && ( // hidden when the card lists nothing
          <ViewAllLink onClick={onViewAll}>View All</ViewAllLink>
        )}
      </div>
      {unrequestedItems.length > 0 ? (
        <div className="flex-1 flex flex-col space-y-0.5 overflow-y-auto overflow-x-hidden min-h-0">
          {visibleItems.map((item, index) => (
            <BatchListItem
              key={item.key}
              item={item}
              index={index}
              statusStyleMap={OPEN_BATCH_STATUS_STYLES}
              onClick={onItemClick}
            />
          ))}
        </div>
      ) : totalOpenCount > 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <FiCheckCircle className="h-7 w-7 text-green-300 dark:text-green-700 mb-1" />
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">You're all caught up</p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500">You've already responded to every open batch</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <FiInbox className="h-7 w-7 text-gray-300 dark:text-gray-600 mb-1" />
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">No open batches</p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500">Check back later for new trainings</p>
        </div>
      )}
    </div>
  );
}
