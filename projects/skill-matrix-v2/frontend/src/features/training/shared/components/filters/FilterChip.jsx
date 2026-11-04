import React, { useEffect, useState } from "react";
import { FiX } from "react-icons/fi";
import { FOCUS_RING } from "../../config/focusRing";

/**
 * One removable active-filter chip. Animates in on mount and back out when
 * `exiting` flips true — entirely inline Tailwind transition classes + a
 * `visible` mount flag (same technique FilterPopover.jsx uses for its own
 * open/close), no CSS keyframes/stylesheet involved: a `transition` can't
 * animate an element's very first painted frame, so this renders once in
 * the "hidden" state, then flips to visible a frame later via
 * requestAnimationFrame so the browser actually has two frames to
 * transition between.
 *
 * The caller owns the exit timing (deferring the real state removal until
 * the exit transition has had time to play) — see the `removeChip` pattern
 * in EmployeeTrainingPanel.jsx for the reference implementation.
 *
 * Props: { label, exiting, onRemove }
 */
export default function FilterChip({ label, exiting, onRemove }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  const shown = visible && !exiting;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 pl-2.5 pr-1 py-1 text-[11px] font-medium transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none ${
        shown ? "opacity-100 scale-100" : "opacity-0 scale-90"
      }`}
    >
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter ${label}`}
        className={`p-0.5 rounded-full hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors cursor-pointer ${FOCUS_RING}`}
      >
        <FiX className="h-3 w-3" />
      </button>
    </span>
  );
}
