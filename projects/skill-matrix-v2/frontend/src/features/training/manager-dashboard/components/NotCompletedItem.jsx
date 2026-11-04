import React from "react";
import { formatDate } from "../../training-batch/services/trainingUtils";
import { NO_REASON } from "../../shared/components/NotCompletedTrainingRow";

/**
 * One training's full Not Completed detail — name, reason, who marked it
 * and when. Rendered per item inside NotCompletedPreview (the single
 * hybrid hover-preview/click-popover panel).
 */
export default function NotCompletedItem({ training }) {
  const hasReviewInfo = Boolean(training.reviewedByName || training.reviewedAt);

  return (
    <div>
      <p className="text-xs font-medium text-gray-900 dark:text-white truncate">{training.moduleName}</p>
      <p className="text-[11px] text-gray-600 dark:text-gray-300 mt-0.5">
        {training.statusRemarks || NO_REASON}
      </p>
      {/* Hidden rather than shown as "Marked by —" when both fields are
          empty (e.g. seed/test data with no real decision-audit-trail
          row) — a placeholder repeated across every item in a multi-item
          list is pure noise, not information. See NotCompletedItem's
          reviewedByName/reviewedAt source: getCombinedHierarchy_v2's
          department_comment_data join. */}
      {hasReviewInfo && (
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
          {training.reviewedByName ? `Marked by ${training.reviewedByName}` : null}
          {training.reviewedAt ? `${training.reviewedByName ? " · " : ""}${formatDate(training.reviewedAt)}` : ""}
        </p>
      )}
    </div>
  );
}
