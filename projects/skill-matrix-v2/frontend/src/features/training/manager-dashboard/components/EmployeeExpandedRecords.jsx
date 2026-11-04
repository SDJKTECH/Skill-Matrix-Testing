import React, { useMemo } from "react";
import { FiArrowRight } from "react-icons/fi";
import Collapse from "../../shared/components/Collapse";
import EntityCard from "../../shared/components/EntityCard";
import EntityCardGrid from "../../shared/components/EntityCardGrid";
import { normalizeTrainingList, toEntityCardProps as toTrainingCardProps } from "../../shared/config/trainingRecordAdapter";
import { normalizeCertRecord, toEntityCardProps as toCertCardProps } from "../../shared/config/certRecordAdapter";
import { FOCUS_RING } from "../../shared/config/focusRing";
import { BATCH_SCOPE } from "../../training-batch/services/batchScopes";

// Inline preview cap — 3 fits in one row of the compact card grid at this
// column's usual width with no wrap, so the accordion stays a true
// at-a-glance preview instead of growing a second row a viewer has to
// scroll the page to reach. "View all" (below) hands off anything beyond
// this to the real Training Batch page instead of a second, in-dashboard
// copy of the same list — see that button's own comment.
const INLINE_TRAINING_LIMIT = 3;

/** In-progress first (most actionable), then most recently started — ties
 * (no start date, or two on the same date) keep their original order since
 * Array.prototype.sort is stable. */
function sortByRelevance(trainings) {
  return [...trainings].sort((a, b) => {
    const aActive = a.trainingStatus === "In Progress" ? 1 : 0;
    const bActive = b.trainingStatus === "In Progress" ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
    // `|| 0` also covers an unparseable startDate (getTime() -> NaN),
    // treating it the same as "no date" rather than letting a NaN result
    // corrupt the comparator's ordering.
    const aTime = (a.startDate && new Date(a.startDate).getTime()) || 0;
    const bTime = (b.startDate && new Date(b.startDate).getTime()) || 0;
    return bTime - aTime;
  });
}

/**
 * The per-employee expand-in-place section — renamed from
 * TeamMemberExpandedTrainings now that it shows BOTH record types.
 * Trainings and certifications each get their own labeled EntityCardGrid
 * (not interleaved in one grid) since they're structurally different
 * enough — trainings navigate to the real Training Batch page,
 * certifications currently have no destination page at all (verified: no
 * admin "certificates" section exists) and render as non-interactive
 * cards (EntityCard's own `interactive` fallback — no onClick passed).
 *
 * Carries a `border-l-2` in the same blue accent as the (also-tinted)
 * EmployeeRow above it, indented to align under that row's content — this
 * reads as one continuous highlighted block with the row, and stays
 * visible as a "this one is open" cue even after scrolling the row itself
 * out of view.
 *
 * Trainings are batch-merged (mergeBatchDetails) using the batchByNum map
 * so cards get full trainer/duration/mode/seats metadata parity instead of
 * degrading to "—" for those fields — same as before this rename.
 *
 * "View all N trainings" (shown once there are more than INLINE_TRAINING_LIMIT)
 * used to open an in-dashboard drawer with its own second copy of the list;
 * that had no destination of its own — a manager still had to leave to the
 * real Training Batch page to actually act on a record. Reuses the existing
 * `onNavigateToBatch` callback instead (same one each card's own onClick
 * already calls with a single batch_num) with the `BATCH_SCOPE.EMPLOYEE`
 * scope object shape `useGoToTrainingBatches`/BatchTable.jsx already
 * support — lands on that page with its Batch Number filter narrowed to
 * every batch this employee has a training in and a dismissible
 * "Scope: `<name>`'s Trainings" pill, no separate drawer component needed.
 *
 * Props: { open, trainings, certifications, batchByNum, onNavigateToBatch, panelId?, employeeName? }
 */
export default function EmployeeExpandedRecords({ open, trainings = [], certifications = [], batchByNum, onNavigateToBatch, panelId, employeeName }) {
  // Merge+normalize once, not per render of the (now-sliced) grid below —
  // also needed unsliced just to sort, so there's no cheaper place to do
  // this once than here.
  const normalizedTrainings = useMemo(
    () => sortByRelevance(normalizeTrainingList(trainings, batchByNum)),
    [trainings, batchByNum]
  );
  const visibleTrainings = normalizedTrainings.slice(0, INLINE_TRAINING_LIMIT);
  const hiddenCount = normalizedTrainings.length - visibleTrainings.length;
  // Every distinct batch this employee has a training in (not just the
  // INLINE_TRAINING_LIMIT preview slice) — resolved once here so "View all"
  // can hand the Training Batch page a ready-made filter set instead of it
  // re-deriving the same list from a raw `trainings` array a second time.
  const allBatchNums = useMemo(
    () => [...new Set(normalizedTrainings.map((t) => t.batch).filter(Boolean))],
    [normalizedTrainings]
  );
  const viewAllTrainings = () =>
    onNavigateToBatch({ scope: BATCH_SCOPE.EMPLOYEE, batchNums: allBatchNums, label: `${employeeName}'s Trainings` });

  return (
    <Collapse open={open}>
      <div id={panelId} className="pt-2 pb-1 pl-3 ml-2 border-l-2 border-blue-200 dark:border-blue-800 space-y-3">
        {trainings.length === 0 && certifications.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">No trainings or certifications for this employee yet.</p>
        ) : (
          <>
            {visibleTrainings.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                  Trainings{hiddenCount > 0 ? ` (${INLINE_TRAINING_LIMIT} of ${normalizedTrainings.length})` : ""}
                </p>
                <EntityCardGrid compact>
                  {visibleTrainings.map((training) => (
                    <EntityCard
                      key={training.id}
                      compact
                      {...toTrainingCardProps(training, { onClick: () => onNavigateToBatch(training.batch) })}
                    />
                  ))}
                </EntityCardGrid>
                {/* Never a silently-truncated list — states the total up front
                    and hands off to the real Training Batch page, scoped to
                    just this employee's batches, rather than growing this
                    already-expanded row any further. */}
                {hiddenCount > 0 && (
                  <button
                    type="button"
                    onClick={viewAllTrainings}
                    className={`mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline cursor-pointer rounded ${FOCUS_RING}`}
                  >
                    View all {normalizedTrainings.length} trainings
                    <FiArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            )}
            {certifications.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Certifications</p>
                <EntityCardGrid compact>
                  {certifications.map((raw) => {
                    const cert = normalizeCertRecord(raw);
                    return <EntityCard key={cert.id} compact {...toCertCardProps(cert)} />;
                  })}
                </EntityCardGrid>
              </div>
            )}
          </>
        )}
      </div>
    </Collapse>
  );
}
