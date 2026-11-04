import React, { useId, useState } from "react";
import { FiChevronDown } from "react-icons/fi";
import Collapse from "./Collapse";
import NotCompletedPill from "./NotCompletedPill";
import NotCompletedTrainingRow from "./NotCompletedTrainingRow";
import { FOCUS_RING } from "../config/focusRing";

/**
 * Expandable "N not completed" summary for one employee. Collapsed: badge
 * and a prompt to open "View details". Expanded: every training shows as a
 * numbered row. Owns only its own open state. Layout inside a wrapping
 * flex row: full-width second row on tablet, middle column next to the
 * employee info on desktop (lg+).
 * `trainings` are normalized records ({ id, moduleName, batch, statusRemarks });
 * `attendedCount` adds "out of N trainings attended"; `onViewBatch(batchNum)`
 * turns each row's batch into a link.
 */
export default function NotCompletedSummary({ trainings, attendedCount, onViewBatch }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  if (!trainings?.length) return null;

  return (
    <div className="min-w-0 basis-full sm:order-last lg:order-none lg:basis-0 lg:flex-1 text-xs">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className={`w-full min-h-11 flex items-center gap-2 rounded-md px-1.5 text-left cursor-pointer transition-colors duration-200 motion-reduce:transition-none hover:bg-blue-50 dark:hover:bg-blue-900/20 ${FOCUS_RING}`}
      >
        <NotCompletedPill count={trainings.length} />
        {attendedCount > 0 && <span className="shrink-0 text-gray-700 dark:text-gray-200">out of {attendedCount} trainings attended.</span>}
        <span className="min-w-0 flex-1 truncate text-gray-500 dark:text-gray-400">
          {open ? "Check the reasons below." : "Click View details to see each reason."}
        </span>
        <span className="ml-auto shrink-0 inline-flex items-center gap-0.5 font-medium text-blue-600 dark:text-blue-400">
          {open ? "Hide details" : "View details"}
          <FiChevronDown
            className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </span>
      </button>

      <Collapse open={open}>
        <ol
          id={panelId}
          className="grid grid-cols-1 sm:grid-cols-[auto_fit-content(40%)_auto_minmax(0,1fr)] divide-y divide-gray-100 dark:divide-gray-700 px-1.5"
        >
          {/* Column labels (sm+ only; mobile stacks name over reason). */}
          <li
            aria-hidden="true"
            className="hidden sm:grid sm:col-span-4 sm:grid-cols-subgrid gap-x-4 py-1 text-[10px] font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider"
          >
            <span className="w-4 text-center">#</span>
            <span>Training</span>
            <span>Batch</span>
            <span>Reason</span>
          </li>
          {trainings.map((t, i) => (
            <NotCompletedTrainingRow key={t.id ?? t.moduleName} index={i + 1} training={t} onViewBatch={onViewBatch} />
          ))}
        </ol>
      </Collapse>
    </div>
  );
}
