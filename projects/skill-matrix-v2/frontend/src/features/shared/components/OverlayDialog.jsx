import React, { useRef } from "react";
import { createPortal } from "react-dom";
import { FiX } from "react-icons/fi";
import useFocusTrap from "../../../hooks/useFocusTrap";
import { FOCUS_RING } from "../config/focusRing";

const SIZE_CLASSES = { md: "max-w-md", xl: "max-w-6xl" };

// Generic overlay dialog shell (backdrop, centered card, focus trap, Esc-to-close) — renamed/moved from training's Modal.jsx since learning-center uses it too.
export default function OverlayDialog({ open, onClose, title, children, initialFocusRef, labelledBy, size = "md" }) {
  const dialogRef = useRef(null);
  const titleId = labelledBy || "dialog-title";

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
        className={`w-full ${SIZE_CLASSES[size] || SIZE_CLASSES.md} rounded-xl shadow-2xl overflow-hidden bg-white dark:bg-gray-800 outline-none ${FOCUS_RING}`}
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
