import React, { useState } from "react";
import { FiCheck, FiChevronDown, FiX } from "react-icons/fi";
import { formatWaitingLabel } from "../../manager-dashboard/services/approvalUrgency";
import ApprovalCheckbox, {
  APPROVAL_ACTION_BTN,
  APPROVAL_FOCUS_RING,
  APPROVE_BUTTON_CLASS,
  REJECT_BUTTON_CLASS,
} from "./ApprovalCheckbox";
import InlineDecisionPanel from "../../shared/components/InlineDecisionPanel";
import NotCompletedSummary from "../../shared/components/NotCompletedSummary";
import { useGoToTrainingBatches } from "../../../../hooks/useGoToTrainingBatches";
import { useTrainingBatchOrigin } from "../context/TrainingBatchOriginContext";

const REASON_MIN_LENGTH = 10;

/**
 * One pending request row. Approve or Reject opens a small note box inside
 * this row (not a popup). The real approve/reject is done by the onApprove
 * and onReject functions passed in (from ManagerApprovalsContext).
 */
function PendingApprovalRow({
  request,
  isInGrace,
  getGraceDecision,
  getGraceBatchId,
  isFinalizing,
  onApprove,
  onReject,
  onUndo,
  isSelected,
  onToggleSelect,
}) {
  // Which note box is open: "approve", "reject" or null. One value (not two
  // true/false values) so both boxes can never be open at the same time.
  const [activeAction, setActiveAction] = useState(null);
  const goToTrainingBatches = useGoToTrainingBatches();
  const batchOrigin = useTrainingBatchOrigin();
  const graceDecision = getGraceDecision?.(request.id);
  const inGrace = Boolean(graceDecision) || isInGrace?.(request.id);
  // Once saving has started, Undo cannot stop it, so show "Saving…" instead of
  // the Undo button.
  const finalizing = Boolean(isFinalizing?.(request.id));
  const waiting = formatWaitingLabel(request.requestedAt);
  const selected = !inGrace && Boolean(isSelected?.(request.id));

  return (
    <div
      className={`rounded-lg border transition-colors duration-200 ease-out ${
        inGrace
          ? "border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/15"
          : selected
            ? "border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/25"
            : "border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900/40"
      }`}
    >
      <div className="flex flex-wrap items-start gap-2 px-2.5 py-2">
        {!inGrace && onToggleSelect ? (
          <ApprovalCheckbox
            checked={selected}
            onChange={() => onToggleSelect(request.id)}
            aria-label={`Select ${request.employeeName}'s request`}
          />
        ) : null}

        <div className="min-w-0 flex-1 lg:flex-none lg:max-w-xs">
          {/* No module name here: the batch row above already shows it. */}
          <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
            {request.employeeName}
          </p>
          {/* Waiting time and the note are on separate lines, so a long note cannot
              hide the waiting time. "Nominated by" is shown only when someone else
              nominated the employee (for a self-nomination it would repeat the name). */}
          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
            {waiting}
            {request.nominatedBy && request.nominatedBy !== "Self nomination" && (
              <> · Nominated by {request.nominatedBy}</>
            )}
          </p>
          {request.note && (
            <p className="text-[10px] italic text-gray-600 dark:text-gray-300 truncate" title={request.note}>
              &ldquo;{request.note}&rdquo;
            </p>
          )}
        </div>

        <NotCompletedSummary
          trainings={request.notCompletedTrainings}
          attendedCount={request.attendedCount}
          onViewBatch={(batchNum) => goToTrainingBatches(batchNum, batchOrigin)} // keep this page's origin (view rules + Back)
        />

        {inGrace ? (
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            <span className="text-[11px] font-medium text-blue-700 dark:text-blue-300 inline-flex items-center gap-1.5">
              {finalizing && (
                <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              )}
              {finalizing
                ? "Saving…"
                : graceDecision === "approved" ? "✓ Approved — undoable" : "✕ Rejected — undoable"}
            </span>
            {!finalizing && (
            <button
              type="button"
              onClick={() => onUndo?.(getGraceBatchId?.(request.id))}
              className={`text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline transition-colors duration-200 ${APPROVAL_FOCUS_RING}`}
            >
              Undo
            </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 shrink-0 ml-auto max-sm:w-full">
            <button
              type="button"
              onClick={() => setActiveAction((v) => (v === "approve" ? null : "approve"))}
              aria-expanded={activeAction === "approve"}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium max-sm:flex-1 max-sm:justify-center max-sm:min-h-11 pointer-coarse:min-h-11 ${APPROVE_BUTTON_CLASS} ${APPROVAL_ACTION_BTN} ${APPROVAL_FOCUS_RING}`}
            >
              <FiCheck className="h-3 w-3" /> Approve
            </button>
            <button
              type="button"
              onClick={() => setActiveAction((v) => (v === "reject" ? null : "reject"))}
              aria-expanded={activeAction === "reject"}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium max-sm:flex-1 max-sm:justify-center max-sm:min-h-11 pointer-coarse:min-h-11 ${REJECT_BUTTON_CLASS} ${APPROVAL_ACTION_BTN} ${APPROVAL_FOCUS_RING}`}
            >
              <FiX className="h-3 w-3" /> Reject
            </button>
          </div>
        )}
      </div>

      {activeAction === "approve" && (
        <div className="px-2.5 pb-2.5">
          <InlineDecisionPanel
            tone="approve"
            prompt={`Approve ${request.employeeName}'s nomination for ${request.moduleName}?`}
            fieldLabel="Add a note"
            placeholder="Optional note"
            confirmLabel="Confirm Approval"
            submittingLabel="Approving…"
            onCancel={() => setActiveAction(null)}
            onSubmit={(note) => {
              setActiveAction(null);
              onApprove?.(request.id, request.employeeName, note);
            }}
          />
        </div>
      )}
      {activeAction === "reject" && (
        <div className="px-2.5 pb-2.5">
          <InlineDecisionPanel
            tone="reject"
            prompt={`Reject ${request.employeeName}'s nomination for ${request.moduleName}?`}
            fieldLabel="Reason for rejecting"
            placeholder="Explain why this request is being rejected…"
            required
            minLength={REASON_MIN_LENGTH}
            confirmLabel="Confirm Rejection"
            submittingLabel="Rejecting…"
            onCancel={() => setActiveAction(null)}
            onSubmit={(reason) => {
              setActiveAction(null);
              onReject?.(request.id, request.employeeName, reason);
            }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Short list of pending requests for one training batch, oldest-waiting first.
 * The checkboxes only select rows; Approve, Reject and Undo work as before.
 */
export function BatchPendingApprovalsDetail({
  id,
  requests,
  isInGrace,
  getGraceDecision,
  getGraceBatchId,
  isFinalizing,
  onApprove,
  onReject,
  onUndo,
  isSelected,
  onToggleSelect,
}) {
  if (!requests?.length) {
    return (
      <div id={id} className="px-3 py-2 text-[11px] text-gray-500 dark:text-gray-400">
        No pending approvals for this batch.
      </div>
    );
  }

  return (
    <div id={id} className="px-3 py-2 space-y-1.5 max-h-64 overflow-y-auto">
      {requests.map((request) => (
        <PendingApprovalRow
          key={request.id}
          request={request}
          isInGrace={isInGrace}
          getGraceDecision={getGraceDecision}
          getGraceBatchId={getGraceBatchId}
          isFinalizing={isFinalizing}
          onApprove={onApprove}
          onReject={onReject}
          onUndo={onUndo}
          isSelected={isSelected}
          onToggleSelect={onToggleSelect}
        />
      ))}
    </div>
  );
}

/**
 * Pending requests header for one batch, with an optional checkbox and a
 * "Review requests" button. The rows stay hidden until the user opens them,
 * so the page is not filled with Approve/Reject buttons.
 */
export function BatchPendingApprovalsDisclosure({
  pendingCount,
  oldestLabel,
  expanded,
  panelId,
  onToggle,
  children,
  batchSelect = null,
}) {
  if (!pendingCount) return null;

  const selectedCount = batchSelect?.selectedCount ?? 0;
  const showPartialCount =
    batchSelect && selectedCount > 0 && selectedCount < pendingCount;

  return (
    <div className="my-1 rounded-lg border border-amber-200/80 dark:border-amber-800/50 bg-amber-50/80 dark:bg-amber-900/15 overflow-hidden transition-colors duration-200">
      <div className="w-full flex flex-wrap items-center gap-2 px-2.5 py-1.5">
        {batchSelect ? (
          <ApprovalCheckbox
            checked={batchSelect.checked}
            indeterminate={batchSelect.indeterminate}
            onChange={() => batchSelect.onToggle?.()}
            aria-label={`Select all ${pendingCount} pending approval${pendingCount === 1 ? "" : "s"} in this batch`}
          />
        ) : null}

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggle?.();
          }}
          aria-expanded={expanded}
          aria-controls={panelId}
          className={`min-w-0 flex-1 flex flex-wrap items-center justify-between gap-2 text-left rounded-md -my-0.5 py-0.5 ${APPROVAL_FOCUS_RING}`}
        >
          <span className="flex items-center gap-1.5 min-w-0 text-[11px] text-amber-900 dark:text-amber-100">
            <FiChevronDown
              className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ease-out ${
                expanded ? "rotate-180" : ""
              }`}
              aria-hidden="true"
            />
            <span>
              <span className="font-semibold">{pendingCount}</span> pending approval
              {pendingCount === 1 ? "" : "s"} linked to this batch
              {/* Shown only while closed, as a hint. When open, each row shows its own
                  waiting time, so this would repeat it. */}
              {oldestLabel && !expanded ? (
                <span className="text-amber-800/80 dark:text-amber-200/80"> · {oldestLabel}</span>
              ) : null}
              {showPartialCount ? (
                <span className="ml-1.5 inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 px-1.5 py-0.5 text-[10px] font-semibold">
                  {selectedCount} selected
                </span>
              ) : null}
            </span>
          </span>
          <span className="shrink-0 text-[11px] font-semibold text-blue-700 dark:text-blue-300 transition-colors duration-200">
            {expanded ? "Hide requests" : "Review requests"}
          </span>
        </button>
      </div>
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-in-out motion-reduce:transition-none ${
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden min-w-0">{expanded ? children : null}</div>
      </div>
    </div>
  );
}
