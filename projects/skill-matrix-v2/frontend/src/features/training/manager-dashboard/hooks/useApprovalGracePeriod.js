import { useCallback, useEffect, useRef, useState } from "react";
import React from "react";
import toast from "react-hot-toast";

export const APPROVAL_GRACE_MS = 5000;
/** Slightly longer window for bulk decisions so managers can review impact. */
export const APPROVAL_BULK_GRACE_MS = 8000;

function graceToastMessage(decision, count, employeeName) {
  if (count > 1) {
    return decision === "approved"
      ? `${count} requests approved`
      : `${count} requests rejected`;
  }
  const subject = employeeName ? `${employeeName}'s request` : "Request";
  return decision === "approved" ? `${subject} approved` : `${subject} rejected`;
}

/**
 * Grace-window state for approve/reject — decisions finalize after APPROVAL_GRACE_MS
 * (or a caller-supplied graceMs for bulk) unless undone via inline control or toast.
 * Applies immediately in the UI; the API commit waits for the window to expire.
 */
export function useApprovalGracePeriod({ onFinalizeApprove, onFinalizeReject }) {
  const [graceById, setGraceById] = useState(() => new Map());
  // Ids whose real save is actually in flight (countdown over, batchesRef
  // entry already deleted) — distinct from graceById, which now also
  // covers this window so the row keeps its "Approved — undoable" styling.
  // Undo can't do anything real once a save has started (undoBatch's own
  // batchesRef lookup would just no-op), so the row UI uses this to swap
  // the still-live-looking "Undo" button for a disabled "Saving…" state
  // instead of leaving a dead click behind.
  const [finalizingIds, setFinalizingIds] = useState(() => new Set());
  const timersRef = useRef(new Map());
  const batchesRef = useRef(new Map());

  const clearTimer = useCallback((id) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const removeGraceIds = useCallback((ids) => {
    setGraceById((prev) => {
      const next = new Map(prev);
      for (const id of ids) next.delete(String(id));
      return next;
    });
  }, []);

  const finalizeBatch = useCallback(
    async (batchId) => {
      const batch = batchesRef.current.get(batchId);
      if (!batch) return;
      batchesRef.current.delete(batchId);
      clearTimer(batchId);

      const { decision, ids, reason } = batch;

      // Grace stays active (row keeps showing "Approved — undoable") until
      // the real save actually finishes, not just when the countdown ends —
      // clearing it here first was the bug: it made an approved-but-still-
      // saving row revert to looking like a fresh, untouched, fully
      // clickable pending request for as long as the network call (GET
      // lookup + PUT, several seconds on this app's remote DB) took, before
      // the eventual hierarchyData patch caught up and removed it for real.
      setFinalizingIds((prev) => new Set([...prev, ...ids]));

      try {
        if (decision === "approved") {
          await onFinalizeApprove?.(ids, reason);
        } else {
          await onFinalizeReject?.(ids, reason);
        }
      } catch (error) {
        console.error("Failed to finalize approval decision:", error);
        toast.error("Could not save decision. Please try again.");
      } finally {
        removeGraceIds(ids);
        setFinalizingIds((prev) => {
          const next = new Set(prev);
          for (const id of ids) next.delete(id);
          return next;
        });
      }
    },
    [onFinalizeApprove, onFinalizeReject, removeGraceIds, clearTimer]
  );

  const undoBatch = useCallback(
    (batchId, toastId) => {
      const batch = batchesRef.current.get(batchId);
      if (!batch) return;
      clearTimer(batchId);
      batchesRef.current.delete(batchId);
      removeGraceIds(batch.ids);
      if (toastId) toast.dismiss(toastId);
      toast.success("Decision undone");
    },
    [clearTimer, removeGraceIds]
  );

  const scheduleDecision = useCallback(
    ({ ids, decision, reason = null, employeeName = null, graceMs = APPROVAL_GRACE_MS }) => {
      const normalizedIds = ids.map(String).filter(Boolean);
      if (normalizedIds.length === 0) return null;

      const duration = Math.max(Number(graceMs) || APPROVAL_GRACE_MS, 1000);
      const batchId = `grace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      batchesRef.current.set(batchId, { ids: normalizedIds, decision, reason });

      setGraceById((prev) => {
        const next = new Map(prev);
        for (const id of normalizedIds) {
          next.set(id, { decision, batchId });
        }
        return next;
      });

      clearTimer(batchId);
      const timer = setTimeout(() => finalizeBatch(batchId), duration);
      timersRef.current.set(batchId, timer);

      toast.custom(
        (t) =>
          React.createElement(
            "div",
            {
              className: `flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 shadow-lg text-xs text-gray-800 dark:text-gray-100 max-w-[min(100vw-2rem,24rem)] transition-all duration-300 ease-out motion-reduce:transition-none ${
                t.visible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-2 scale-95"
              }`,
            },
            React.createElement(
              "span",
              { className: "min-w-0" },
              `${graceToastMessage(decision, normalizedIds.length, employeeName)} — undoable`
            ),
            React.createElement(
              "button",
              {
                type: "button",
                onClick: () => undoBatch(batchId, t.id),
                className:
                  "shrink-0 font-semibold text-blue-600 dark:text-blue-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded transition-colors duration-200",
              },
              "Undo"
            )
          ),
        { duration }
      );

      return batchId;
    },
    [clearTimer, finalizeBatch, undoBatch]
  );

  useEffect(
    () => () => {
      for (const timer of timersRef.current.values()) clearTimeout(timer);
      timersRef.current.clear();
      batchesRef.current.clear();
    },
    []
  );

  return {
    graceById,
    scheduleDecision,
    undoBatch,
    isInGrace: (id) => graceById.has(String(id)),
    getGraceDecision: (id) => graceById.get(String(id))?.decision ?? null,
    getGraceBatchId: (id) => graceById.get(String(id))?.batchId ?? null,
    isFinalizing: (id) => finalizingIds.has(String(id)),
  };
}
