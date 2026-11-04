import React, { useRef } from "react";
import { createPortal } from "react-dom";
import { FiX } from "react-icons/fi";
import useFocusTrap from "../../../../hooks/useFocusTrap";
import { FOCUS_RING } from "../config/focusRing";

/**
 * Generic modal dialog shell — backdrop, centered card, focus trap, Esc to
 * close, focus returned to the trigger on close. Visual treatment (backdrop
 * blur, centered rounded card, shadow-2xl) matches the one existing
 * full-screen modal precedent in this app (DevLoginModal.jsx), extended
 * with the a11y behavior that one doesn't need (it's an admin-only dev
 * tool) but a reject/approve decision modal does.
 *
 * shadow-2xl (not shared/elevation.js's ELEVATION.floating = shadow-xl):
 * deliberately one notch heavier than popovers/menus — a centered,
 * backdrop-covering modal is a bigger, more central surface than a small
 * anchored popover, so a stronger shadow is warranted even within the same
 * "Level 2 / floating" tier the addendum describes. Not an oversight.
 *
 * SRP: this component owns dialog mechanics only (open/close, focus, Esc,
 * backdrop click) — it renders whatever `children` a caller supplies and
 * knows nothing about reasons, statuses, or approvals. Any future centered
 * dialog is built on top of this, not a copy of it. Focus-trap/Esc/return-
 * focus behavior itself lives in useFocusTrap, not duplicated here.
 *
 * Not currently used by the Approve/Reject/nomination flows — those moved
 * to shared/InlineDecisionPanel.jsx's inline (non-overlay) pattern instead,
 * since none of those three are the kind of high-stakes, fully-blocking
 * decision a backdrop-covering modal is meant for. This shell stays for
 * whatever future flow genuinely is (e.g. a destructive delete-confirm).
 */
export default function Modal({ open, onClose, title, children, initialFocusRef, labelledBy }) {
  const dialogRef = useRef(null);
  const titleId = labelledBy || "modal-title";

  useFocusTrap({ open, containerRef: dialogRef, initialFocusRef, onEscape: onClose });

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-100/80 dark:bg-slate-900/80 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`w-full max-w-md rounded-xl shadow-2xl overflow-hidden bg-white dark:bg-gray-800 outline-none ${FOCUS_RING}`}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <h2 id={titleId} className="text-sm font-semibold text-gray-900 dark:text-white">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className={`shrink-0 p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer ${FOCUS_RING}`}
          >
            <FiX className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>,
    document.body
  );
}
