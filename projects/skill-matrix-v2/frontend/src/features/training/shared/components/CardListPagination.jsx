import React from "react";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { FOCUS_RING } from "../config/focusRing";

/**
 * Shared "X–Y of Z <items>" + Prev/Next footer for any EntityCardGrid-based
 * list. Extracted from EmployeeTrainingPanel.jsx's My Trainings pagination
 * (byte-for-byte the same markup/behavior) so every card grid in this app
 * that needs paging — My Trainings and the Open-for-Enrollment view alike —
 * renders and behaves identically by construction, not by two hand-copied
 * blocks that can quietly drift apart.
 *
 * `hasMorePages`: for a server-paginated caller that doesn't know the true
 * total ahead of time (My Trainings' default scope) — shows "N+" instead of
 * a fixed page count. A caller that already has the full, real list in hand
 * (Open Enrollment, paginated client-side) always knows its exact total, so
 * it simply omits this (defaults to false) and gets a normal "page / total"
 * label.
 */
export default function CardListPagination({ page, totalPages, total, pageSize, itemLabel = "items", hasMorePages = false, onPrev, onNext }) {
  if (total <= 0) return null;
  return (
    <div className="shrink-0 flex items-center justify-between px-1 py-1 text-xs text-gray-500 dark:text-gray-400">
      <span>
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total} {itemLabel}
      </span>
      {totalPages > 1 || hasMorePages ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPrev}
            disabled={page <= 1}
            className={`min-h-9 min-w-9 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors ${FOCUS_RING}`}
            aria-label="Previous page"
          >
            <FiChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="px-2 tabular-nums" aria-live="polite">
            {hasMorePages && page >= totalPages - 1 ? `${page}+` : `${page} / ${totalPages}`}
          </span>
          <button
            type="button"
            onClick={onNext}
            disabled={!hasMorePages && page >= totalPages}
            className={`min-h-9 min-w-9 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors ${FOCUS_RING}`}
            aria-label="Next page"
          >
            <FiChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
