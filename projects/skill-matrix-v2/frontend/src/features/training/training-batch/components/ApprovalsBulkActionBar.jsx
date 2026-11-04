import React, { useEffect, useState } from "react";
import { FiCheck, FiX } from "react-icons/fi";
import { APPROVAL_ACTION_BTN, APPROVAL_FOCUS_RING, APPROVE_BUTTON_CLASS, REJECT_BUTTON_CLASS } from "./ApprovalCheckbox";
import InlineDecisionPanel from "../../shared/components/InlineDecisionPanel";
import { ELEVATION } from "../../shared/config/elevation";

const REASON_MIN_LENGTH = 10;

/**
 * Bar that floats at the bottom when the user selects many pending requests,
 * to approve or reject them together. The note/reason box opens inside this
 * bar (not as a popup). The bar stays a moment after closing so it can fade out.
 */
export default function ApprovalsBulkActionBar({
  selectedCount,
  batchSpan,
  onApprove,
  onReject,
  onClear,
}) {
  const shouldShow = selectedCount > 0;
  const [rendered, setRendered] = useState(shouldShow);
  const [entered, setEntered] = useState(false);
  // "approve" | "reject" | null: which note box is open. It closes when the
  // selected items change.
  const [activeAction, setActiveAction] = useState(null);

  useEffect(() => {
    if (!shouldShow) setActiveAction(null);
  }, [shouldShow]);

  useEffect(() => {
    if (shouldShow) {
      setRendered(true);
      const frame = requestAnimationFrame(() => setEntered(true));
      return () => cancelAnimationFrame(frame);
    }
    setEntered(false);
    const timer = setTimeout(() => setRendered(false), 280);
    return () => clearTimeout(timer);
  }, [shouldShow]);

  if (!rendered) return null;

  const batchLabel =
    batchSpan === 1 ? "1 batch" : `${batchSpan} batch${batchSpan === 1 ? "" : "es"}`;

  return (
    <div
      role="region"
      aria-label="Bulk approval actions"
      className={`fixed z-50 bottom-3 left-3 right-3 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-xl sm:-translate-x-1/2 pointer-events-none`}
    >
      <div
        className={`pointer-events-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm ${ELEVATION.floating} px-3 py-2.5 transition-all duration-300 ease-out motion-reduce:transition-none ${
          entered ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-3 scale-95"
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <p className="text-xs sm:text-sm font-medium text-gray-800 dark:text-gray-100 min-w-0 flex-1" aria-live="polite">
            <span className="font-semibold">{selectedCount}</span> selected
            {batchSpan > 0 ? (
              <span className="text-gray-500 dark:text-gray-400 font-normal">
                {" "}
                across {batchLabel}
              </span>
            ) : null}
          </p>
          {activeAction === null && (
            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setActiveAction("approve")}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold ${APPROVE_BUTTON_CLASS} ${APPROVAL_ACTION_BTN} ${APPROVAL_FOCUS_RING}`}
              >
                <FiCheck className="h-3.5 w-3.5" />
                Approve selected
              </button>
              <button
                type="button"
                onClick={() => setActiveAction("reject")}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold ${REJECT_BUTTON_CLASS} ${APPROVAL_ACTION_BTN} ${APPROVAL_FOCUS_RING}`}
              >
                <FiX className="h-3.5 w-3.5" />
                Reject selected
              </button>
              <button
                type="button"
                onClick={onClear}
                className={`inline-flex items-center px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-300 ring-1 ring-gray-300 dark:ring-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/80 ${APPROVAL_ACTION_BTN} ${APPROVAL_FOCUS_RING}`}
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {activeAction === "approve" && (
          <InlineDecisionPanel
            tone="approve"
            fieldLabel="Add a note"
            placeholder="Optional note"
            confirmLabel={`Approve ${selectedCount}`}
            submittingLabel="Approving…"
            onCancel={() => setActiveAction(null)}
            onSubmit={(note) => {
              setActiveAction(null);
              onApprove?.(note);
            }}
          />
        )}
        {activeAction === "reject" && (
          <InlineDecisionPanel
            tone="reject"
            helper={`This reason will be attached to all ${selectedCount} selected requests.`}
            fieldLabel="Reason for rejecting"
            placeholder="Explain why these requests are being rejected…"
            required
            minLength={REASON_MIN_LENGTH}
            confirmLabel={`Reject ${selectedCount}`}
            submittingLabel="Rejecting…"
            onCancel={() => setActiveAction(null)}
            onSubmit={(reason) => {
              setActiveAction(null);
              onReject?.(reason);
            }}
          />
        )}
      </div>
    </div>
  );
}
