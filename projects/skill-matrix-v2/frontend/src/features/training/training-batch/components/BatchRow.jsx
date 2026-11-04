// One batch row in the Training Batches table, plus its detail panel that
// opens below it. Approval data (pending counts, approve/reject, undo) comes
// from ManagerApprovalsContext; everything else is passed in from BatchTable.
import React from "react";
import {
  FiChevronRight,
  FiInfo,
  FiEdit2,
  FiTrash2,
  FiCheck,
  FiCheckCircle,
} from "react-icons/fi";
import {
  formatDate,
  groupEnrollmentStatusCounts,
  countEnrollmentStatuses,
  countReviewDecisions,
} from "../services/trainingUtils";
import { formatOldestPendingLabel } from "../../manager-dashboard/services/approvalUrgency";
import { useManagerApprovals } from "../../../../context/ManagerApprovalsContext";
import Collapse from "../../shared/components/Collapse";
import NotCompletedPill from "../../shared/components/NotCompletedPill";
import { useVisibleEnrollments } from "../services/enrollmentVisibility";
import HighlightMatch from "../../shared/components/HighlightMatch";
import { isNestedOnlySearchMatch, getNestedMatchSnippet } from "../services/batchSearch";
import {
  StatusBadge,
  EnrollmentStatusChips,
  InfoPopover,
  TruncatableCell,
} from "./BatchTableCells";
import BatchPendingApprovalsBanner, {
  BatchPendingApprovalsDetail,
} from "./BatchPendingApprovalsBanner";
import BatchDetailPanel from "./BatchDetailPanel";

// Style for the small icon buttons in the row. cursor-pointer is needed
// because Tailwind shows a normal arrow cursor on buttons by default.
const ACTION_ICON_CLASS_NAME =
  "inline-flex items-center justify-center w-7 h-7 rounded-md cursor-pointer text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors";

export default function BatchRow({
  batch,
  idx,
  firstRowRef,
  expandedId,
  deletingId,
  setDeletingId,
  toggleRow,
  openEdit,
  handleDeleteConfirm,
  loadBatches,
  canEditBatch,
  canDeleteBatch,
  detailRowRefs,
  debouncedSearch,
  truncatedCells,
  openTextPopoverKey,
  setOpenTextPopoverKey,
  textCellRefs,
  textTriggerRefs,
  infoButtonRefs,
  hoverBatchId,
  setHoverBatchId,
  enrollmentsCache,
  enrollmentsErrorIds,
  fetchEnrollmentsFor,
  updateEnrollmentsCache,
  invalidateEnrollments,
  applyEnrollmentCountDelta,
  approvalsExpandedBatchIds,
  toggleApprovalsExpanded,
  getScopeState,
  toggleMany,
  isSelected,
  toggleOne,
  hideApprovals = false,
  reviewedDecisions,
}) {
  const b = batch;
  const {
    canManageApprovals,
    getPendingCountForBatch,
    getOldestWaitingDaysForBatch,
    getRequestsForBatch,
    isInGrace,
    getGraceDecision,
    getGraceBatchId,
    isFinalizing,
    scheduleApprove,
    scheduleReject,
    undoBatch,
  } = useManagerApprovals();

  const isExpanded = expandedId === b.batch_id;
  const isDeleting = deletingId === b.batch_id;
  // When a closed row matches the search only because of an enrolled employee,
  // show which employee matched. Not needed once the row is open.
  const nestedMatchSnippet =
    !isExpanded && isNestedOnlySearchMatch(b, debouncedSearch)
      ? getNestedMatchSnippet(b, debouncedSearch, enrollmentsCache)
      : null;
  const remarkText = b.batch_status_remarks || "";
  const { canViewAll, filterVisible } = useVisibleEnrollments();
  const visibleEnrollments = enrollmentsCache[b.batch_id] ? filterVisible(enrollmentsCache[b.batch_id]) : null;
  const enrollmentCount = canViewAll ? Number(b.employee_count ?? 0) : visibleEnrollments?.length ?? 0;
  const reviewedCounts = countReviewDecisions(reviewedDecisions);
  const pendingApprovalsCount = canManageApprovals && !hideApprovals
    ? getPendingCountForBatch(b.batch_num)
    : 0;
  const oldestWaitingDays =
    pendingApprovalsCount > 0
      ? getOldestWaitingDaysForBatch(b.batch_num)
      : null;
  const oldestPendingLabel = formatOldestPendingLabel(oldestWaitingDays);
  const approvalsPanelId = `batch-approvals-${b.batch_id}`;
  const approvalsExpanded = approvalsExpandedBatchIds.has(String(b.batch_id));

  return (
    <React.Fragment>
      {/* The batch row. Click anywhere on it to open or close it. The first row
          is also measured to work out how many rows fit on one page. */}
      <tr
        ref={idx === 0 ? firstRowRef : undefined}
        onClick={() => toggleRow(b.batch_id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleRow(b.batch_id);
          }
        }}
        tabIndex={0}
        role="button"
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? "Collapse" : "Expand"} batch ${b.batch_num} ${b.module_name}`}
        className={`cursor-pointer transition-colors divide-x-0 ${
          isDeleting
            ? "bg-red-50/60 dark:bg-red-900/10"
            : isExpanded
              ? "bg-blue-50/40 dark:bg-blue-900/10 border-l-2 border-l-blue-400 dark:border-l-blue-500"
              : "hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-l-2 hover:border-l-blue-300 dark:hover:border-l-blue-700 border-l-2 border-l-transparent"
        }`}
      >
        {/* Chevron */}
        <td className="px-3 py-2 w-8">
          <FiChevronRight
            className={`h-3.5 w-3.5 text-gray-400 dark:text-gray-500 transition-transform duration-150 ${isExpanded ? "rotate-90 text-blue-500 dark:text-blue-400" : ""}`}
            aria-hidden="true"
          />
        </td>
        <td className="px-3 py-2">
          <div
            className="truncate font-normal text-gray-900 dark:text-gray-100"
            title={b.batch_num || undefined}
          >
            <HighlightMatch text={b.batch_num || ""} query={debouncedSearch} />
          </div>
        </td>
        <td className="px-3 py-2">
          <TruncatableCell
            cellKey={`desc:${b.batch_id}`}
            text={b.batch_desc || ""}
            className="text-xs text-gray-600 dark:text-gray-300"
            isTruncated={truncatedCells.has(`desc:${b.batch_id}`)}
            isOpen={openTextPopoverKey === `desc:${b.batch_id}`}
            onToggle={() =>
              setOpenTextPopoverKey((k) =>
                k === `desc:${b.batch_id}` ? null : `desc:${b.batch_id}`,
              )
            }
            onOpen={() => setOpenTextPopoverKey(`desc:${b.batch_id}`)}
            onClose={() =>
              setOpenTextPopoverKey((k) =>
                k === `desc:${b.batch_id}` ? null : k,
              )
            }
            textCellRefs={textCellRefs}
            textTriggerRefs={textTriggerRefs}
            searchQuery={debouncedSearch}
          />
        </td>
        <td className="px-3 py-2">
          <div
            className="truncate text-gray-700 dark:text-gray-300"
            title={b.module_name || undefined}
          >
            <HighlightMatch text={b.module_name || ""} query={debouncedSearch} />
          </div>
        </td>
        <td className="px-3 py-2 whitespace-nowrap">
          <span className="text-gray-600 dark:text-gray-300 text-xs">
            {b.training_quarter || ""}
          </span>
        </td>
        <td className="px-3 py-2 whitespace-nowrap">
          <StatusBadge status={b.batch_status} />
        </td>
        <td className="px-3 py-2">
          <div className="flex flex-col items-start gap-1 text-xs min-w-0">
            <span className="whitespace-nowrap text-gray-600 dark:text-gray-300">
              Enrollments ({enrollmentCount})
            </span>
            {enrollmentCount > 0 &&
              visibleEnrollments &&
              (() => {
                const { notCompletedCount } = groupEnrollmentStatusCounts(
                  countEnrollmentStatuses(visibleEnrollments),
                );
                return <NotCompletedPill count={notCompletedCount} />;
              })()}
            {pendingApprovalsCount > 0 && (
              <span className="flex flex-col items-start gap-0.5 min-w-0">
                <span className="whitespace-nowrap inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                  {pendingApprovalsCount} pending
                </span>
                {oldestPendingLabel ? (
                  <span className="text-[10px] text-amber-800/90 dark:text-amber-200/80 leading-tight">
                    {oldestPendingLabel}
                  </span>
                ) : null}
              </span>
            )}
            {nestedMatchSnippet && (
              <span
                className="whitespace-nowrap max-w-full truncate inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
                title={`Matches: ${nestedMatchSnippet}`}
              >
                Matches: {nestedMatchSnippet}
              </span>
            )}
          </div>
        </td>
        <td className="px-3 py-2">
          <TruncatableCell
            cellKey={`remark:${b.batch_id}`}
            text={remarkText}
            className="text-xs text-gray-600 dark:text-gray-300"
            isTruncated={truncatedCells.has(`remark:${b.batch_id}`)}
            isOpen={openTextPopoverKey === `remark:${b.batch_id}`}
            onToggle={() =>
              setOpenTextPopoverKey((k) =>
                k === `remark:${b.batch_id}` ? null : `remark:${b.batch_id}`,
              )
            }
            onOpen={() => setOpenTextPopoverKey(`remark:${b.batch_id}`)}
            onClose={() =>
              setOpenTextPopoverKey((k) =>
                k === `remark:${b.batch_id}` ? null : k,
              )
            }
            textCellRefs={textCellRefs}
            textTriggerRefs={textTriggerRefs}
            searchQuery={debouncedSearch}
          />
        </td>
        <td className="px-3 py-2">
          <div
            className="flex items-center justify-end gap-1"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <>
              <button
                ref={(el) => {
                  if (el) infoButtonRefs.current.set(b.batch_id, el);
                  else infoButtonRefs.current.delete(b.batch_id);
                }}
                type="button"
                onMouseEnter={() => {
                  setHoverBatchId(b.batch_id);
                  if (Number(b.employee_count ?? 0) > 0)
                    fetchEnrollmentsFor([b.batch_id]);
                }}
                onMouseLeave={() =>
                  setHoverBatchId((id) => (id === b.batch_id ? null : id))
                }
                className={ACTION_ICON_CLASS_NAME}
                title="Employee status summary"
                aria-label={`Employee status summary for batch ${b.batch_num}`}
              >
                <FiInfo className="h-3.5 w-3.5" />
              </button>
              {hoverBatchId === b.batch_id && (
                <InfoPopover
                  triggerEl={infoButtonRefs.current.get(b.batch_id)}
                  onClose={() =>
                    setHoverBatchId((id) => (id === b.batch_id ? null : id))
                  }
                >
                  {/* Start and end dates, shown in the same popup. */}
                  <div className="text-[11px] text-gray-600 dark:text-gray-300 mb-1.5 pb-1.5 border-b border-gray-100 dark:border-gray-700">
                    <div>
                      Start: {b.start_date ? formatDate(b.start_date) : "—"}
                    </div>
                    <div>End: {b.end_date ? formatDate(b.end_date) : "—"}</div>
                  </div>
                  {Number(b.employee_count ?? 0) === 0 || visibleEnrollments?.length === 0 ? (
                    <p className="text-[11px] text-gray-400 dark:text-gray-500">
                      No enrollments yet
                    </p>
                  ) : enrollmentsErrorIds.has(b.batch_id) ? (
                    // If loading failed, show an error message, not an empty popup.
                    <p className="text-[11px] text-red-400 dark:text-red-400">
                      Couldn't load — open Enrollments below to retry
                    </p>
                  ) : enrollmentsCache[b.batch_id] ? (
                    // If we already have data, show it even while it is being refreshed,
                    // instead of showing "Loading" again.
                    <EnrollmentStatusChips
                      counts={countEnrollmentStatuses(visibleEnrollments)}
                    />
                  ) : (
                    <p className="text-[11px] text-gray-400 dark:text-gray-500">
                      Loading…
                    </p>
                  )}
                </InfoPopover>
              )}
            </>
            {/* Edit and Delete icons. An icon is not shown at all (not just greyed
                out) when the user's role cannot use it (see batchPermissions.js). */}
            {canEditBatch && (
              <button
                type="button"
                onClick={() => openEdit(b)}
                className="inline-flex items-center justify-center w-7 h-7 rounded-md cursor-pointer text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                title="Edit batch"
                aria-label={`Edit batch ${b.batch_num} ${b.module_name}`}
              >
                <FiEdit2 className="h-3.5 w-3.5" />
              </button>
            )}
            {canDeleteBatch && (
              <button
                type="button"
                onClick={() => setDeletingId(b.batch_id)}
                className="inline-flex items-center justify-center w-7 h-7 rounded-md cursor-pointer text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                title="Delete batch"
                aria-label={`Delete batch ${b.batch_num} ${b.module_name}`}
              >
                <FiTrash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </td>
      </tr>

      {pendingApprovalsCount > 0 && (
        <tr>
          <td colSpan={9} className="px-3 py-0 bg-white dark:bg-gray-900">
            {(() => {
              const batchRequests = getRequestsForBatch(b.batch_num);
              const selectableIds = batchRequests
                .filter((request) => !isInGrace(request.id))
                .map((request) => String(request.id));
              const batchSelectState = getScopeState(selectableIds);
              return (
                <BatchPendingApprovalsBanner
                  pendingCount={pendingApprovalsCount}
                  oldestLabel={oldestPendingLabel}
                  expanded={approvalsExpanded}
                  panelId={approvalsPanelId}
                  onToggle={() => toggleApprovalsExpanded(String(b.batch_id))}
                  batchSelect={{
                    checked: batchSelectState.checked,
                    indeterminate: batchSelectState.indeterminate,
                    selectedCount: batchSelectState.selectedCount,
                    onToggle: () => toggleMany(selectableIds),
                  }}
                >
                  <BatchPendingApprovalsDetail
                    id={approvalsPanelId}
                    requests={batchRequests}
                    isInGrace={isInGrace}
                    getGraceDecision={getGraceDecision}
                    getGraceBatchId={getGraceBatchId}
                    isFinalizing={isFinalizing}
                    onApprove={(id, employeeName, note) =>
                      scheduleApprove([id], employeeName, { note })
                    }
                    onReject={(id, employeeName, reason) =>
                      scheduleReject([id], reason, employeeName)
                    }
                    onUndo={undoBatch}
                    isSelected={isSelected}
                    onToggleSelect={toggleOne}
                  />
                </BatchPendingApprovalsBanner>
              );
            })()}
          </td>
        </tr>
      )}

      {pendingApprovalsCount === 0 && reviewedDecisions?.size > 0 && (
        <tr>
          <td colSpan={9} className="px-3 py-1.5 bg-white dark:bg-gray-900">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-400">
              <FiCheckCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {`All requests reviewed · ${reviewedCounts.approved} approved${reviewedCounts.rejected ? `, ${reviewedCounts.rejected} rejected` : ""}`}
            </span>
          </td>
        </tr>
      )}

      {/* Inline delete confirm row */}
      {isDeleting && (
        <tr className="bg-red-50/80 dark:bg-red-900/10">
          <td colSpan={9} className="px-4 py-2.5">
            <div className="flex items-center gap-3 text-sm">
              <span className="text-red-700 dark:text-red-400 font-medium">
                Delete <strong>{b.module_name}</strong> ({b.batch_num})?
              </span>
              <button
                type="button"
                onClick={() => handleDeleteConfirm(b)}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-md cursor-pointer text-xs font-medium text-white bg-red-600 hover:bg-red-700"
              >
                <FiCheck className="h-3 w-3" /> Yes, delete
              </button>
              <button
                type="button"
                onClick={() => setDeletingId(null)}
                className="inline-flex items-center px-3 py-1 rounded-md cursor-pointer text-xs font-medium text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
            </div>
          </td>
        </tr>
      )}

      {/* Detail panel (Batch Details, Enrollments, Notes). It is always on the
          page so it can slide open and closed smoothly. */}
      <tr
        ref={(node) => {
          if (node) detailRowRefs.current.set(b.batch_id, node);
          else detailRowRefs.current.delete(b.batch_id);
        }}
      >
        <td colSpan={9} className="p-0">
          <Collapse open={isExpanded && !isDeleting}>
            {/* Same blue color and left border as the row above, so the row and its
                panel look like one block. */}
            <div className="bg-blue-50/40 dark:bg-blue-900/10 border-l-2 border-l-blue-400 dark:border-l-blue-500 border-b border-blue-200 dark:border-blue-800">
              <BatchDetailPanel
                batch={b}
                isExpanded={isExpanded}
                searchQuery={debouncedSearch}
                onEdit={() => openEdit(b)}
                onEnrollmentChange={(delta) =>
                  typeof delta === "number"
                    ? applyEnrollmentCountDelta(b.batch_id, delta)
                    : loadBatches({ silent: true })
                }
                cachedEnrollments={enrollmentsCache[b.batch_id]}
                hasEnrollmentsError={enrollmentsErrorIds.has(b.batch_id)}
                onFetchEnrollments={fetchEnrollmentsFor}
                onEnrollmentsCacheUpdate={updateEnrollmentsCache}
                onInvalidateEnrollments={invalidateEnrollments}
                reviewedDecisions={reviewedDecisions}
              />
            </div>
          </Collapse>
        </td>
      </tr>
    </React.Fragment>
  );
}
