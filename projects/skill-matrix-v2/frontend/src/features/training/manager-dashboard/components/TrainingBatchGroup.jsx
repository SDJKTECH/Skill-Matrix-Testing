import React, { useMemo } from "react";
import { FiChevronDown } from "react-icons/fi";
import Collapse from "../../shared/components/Collapse";
import TrainingBatchNomineeRow from "./TrainingBatchNomineeRow";
import { groupByManager } from "../services/teamGrouping";

/**
 * One training batch's group card — header (module name + nominee count)
 * that expands into the nominee list, same persistent blue accent-on-
 * expand language as EmployeeRow/EmployeeExpandedRecords (one traceable
 * block, stays visible as "this one is open" after scrolling past it).
 * Informational only — no approve/reject actions here, see
 * TrainingBatchNomineeRow's own doc comment.
 *
 * Nominees are grouped by manager/team via the same groupByManager +
 * managerGroup data TeamTrainingStatusCard.jsx's alert-matches view (By
 * Employee) already uses — one shared hierarchy-resolution source (see
 * hierarchyUtils.js's getScopedTeamFromHierarchy), not a second
 * independent "who's on whose team" derivation. Same convention as that
 * view too: a group header only earns its place when it distinguishes one
 * group from another — a training whose nominees all report to the same
 * manager just lists them, no redundant single-group header. Plain label,
 * not collapsible — this is already one level deep inside this row's own
 * expand/collapse, a second nested collapse per manager would be more
 * interaction than a handful of names needs.
 *
 * Props: { group, isExpanded, onToggleExpand }
 */
export default function TrainingBatchGroup({ group, isExpanded, onToggleExpand }) {
  const nomineeGroups = useMemo(() => groupByManager(group.nominees), [group.nominees]);
  const showGroupHeaders = nomineeGroups.length > 1;

  return (
    <div
      className={`w-full rounded-lg border shadow-sm transition-all ${
        isExpanded
          ? "border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-900/10"
          : "border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 hover:shadow-md hover:border-blue-200 dark:hover:border-blue-800"
      }`}
    >
      <button
        type="button"
        onClick={() => onToggleExpand(group.batchNum)}
        aria-expanded={isExpanded}
        aria-controls={`training-batch-group-${group.batchNum}`}
        className="w-full flex items-center gap-2.5 py-2 px-2.5 text-left cursor-pointer"
      >
        <p className="min-w-0 flex-1 text-sm font-medium text-gray-900 dark:text-white truncate">{group.moduleName}</p>
        <span className="shrink-0 text-[11px] text-gray-400 dark:text-gray-500">
          {group.nominees.length} nominee{group.nominees.length === 1 ? "" : "s"}
        </span>
        <FiChevronDown
          className={`h-3.5 w-3.5 shrink-0 transition-transform duration-150 ${isExpanded ? "rotate-180 text-blue-500 dark:text-blue-400" : "text-gray-400 dark:text-gray-500"}`}
        />
      </button>

      <Collapse open={isExpanded}>
        <div id={`training-batch-group-${group.batchNum}`} className="pt-1 pb-2.5 pr-2.5 pl-3 ml-2 border-l-2 border-blue-200 dark:border-blue-800 space-y-2">
          {nomineeGroups.map(([managerGroup, nominees]) => (
            <div key={managerGroup}>
              {showGroupHeaders && (
                <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide px-1 mb-1">
                  {managerGroup}
                </p>
              )}
              <div className="space-y-1">
                {nominees.map((n) => (
                  <TrainingBatchNomineeRow key={n.employeeId} nominee={n} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Collapse>
    </div>
  );
}
