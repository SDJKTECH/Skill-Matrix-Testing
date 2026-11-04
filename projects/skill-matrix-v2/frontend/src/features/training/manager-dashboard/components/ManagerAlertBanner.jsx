import React from "react";
import { FiInbox, FiX } from "react-icons/fi";
import { FOCUS_RING } from "../../shared/config/focusRing";

/**
 * Dismissible pending-approvals banner.
 *
 * Visually distinct from Team Alerts: approvals are a workflow queue
 * (violet + inbox, same family as the toolbar bell), while Team Alerts
 * keep amber + warning triangle for skill/cert/training gaps. Same icon
 * and color for both made every amber triangle feel like the same kind
 * of problem — this keeps the two channels scannable at a glance.
 */
export default function ManagerAlertBanner({ pendingCount, onDismiss, onClick }) {
  if (!pendingCount) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full shrink-0 flex items-start gap-2 rounded-xl border border-violet-200 dark:border-violet-800/50 bg-violet-50 dark:bg-violet-900/20 px-3 py-2 text-left cursor-pointer hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors ${FOCUS_RING}`}
    >
      <FiInbox className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400 mt-0.5" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-xs text-violet-900 dark:text-violet-100 leading-relaxed">
        <span className="font-semibold">{pendingCount}</span> pending approval{pendingCount === 1 ? "" : "s"}
      </p>
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onDismiss(); } }}
        aria-label="Dismiss alert banner"
        className={`shrink-0 p-1 rounded text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/40 cursor-pointer ${FOCUS_RING}`}
      >
        <FiX className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}
