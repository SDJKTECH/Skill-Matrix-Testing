import React, { useEffect, useRef, useState } from "react";
import EmployeeRow from "./EmployeeRow";
import EmployeeExpandedRecords from "./EmployeeExpandedRecords";
import { useExpandedSet } from "../../../../hooks/useExpandedSet";
import { FOCUS_RING } from "../../shared/config/focusRing";
import HighlightMatch from "../../shared/components/HighlightMatch";

/**
 * Current drill-level employee rows with optional global-search results mode.
 */
export default function EmployeeList({
  rows,
  batchByNum,
  onNavigateToBatch,
  onDrillInto,
  drillingEnabled = false,
  globalSearchResults = [],
  globalSearchTotalCount = 0,
  isGlobalSearchActive = false,
  searchQuery = "",
  onSearchResultSelect,
  activeResultIndex = 0,
  onActiveResultIndexChange,
}) {
  const { isExpanded: isRowExpanded, toggle: toggleExpand } = useExpandedSet();
  // Keyed by result id, not index, so a stale ref never gets scrolled to.
  const resultRefs = useRef(new Map());
  useEffect(() => {
    if (!isGlobalSearchActive) return;
    const active = globalSearchResults[activeResultIndex];
    if (!active) return;
    resultRefs.current.get(active.id)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [isGlobalSearchActive, globalSearchResults, activeResultIndex]);
  // Which employee's Not Completed popover is open — a single value, not a
  // Set, so only one can ever be open at a time (opening a second one just
  // replaces this value, closing whichever was open before). Owned here,
  // the nearest common ancestor of every row, same reasoning as
  // isRowExpanded above living here rather than in each row.
  const [openNotCompletedId, setOpenNotCompletedId] = useState(null);
  const toggleNotCompletedPopover = (id) => {
    setOpenNotCompletedId((prev) => (prev === id ? null : id));
  };

  if (isGlobalSearchActive) {
    if (globalSearchResults.length === 0) {
      return <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">No employees match your search.</p>;
    }
    return (
      <div className="space-y-1.5">
        {/* Listbox visuals/ARIA — arrow keys handled in
            TeamTrainingStatusCard, DOM focus stays in the search input. */}
        <div role="listbox" aria-label="Search results" className="space-y-1.5">
          {globalSearchResults.map((result, index) => (
            <button
              key={result.id}
              ref={(node) => {
                if (node) resultRefs.current.set(result.id, node);
                else resultRefs.current.delete(result.id);
              }}
              type="button"
              role="option"
              aria-selected={index === activeResultIndex}
              onClick={() => onSearchResultSelect?.(result)}
              onMouseEnter={() => onActiveResultIndexChange?.(index)}
              className={`w-full text-left rounded-lg border shadow-sm py-2 px-2.5 transition-colors cursor-pointer ${FOCUS_RING} ${
                index === activeResultIndex
                  ? "border-blue-300 dark:border-blue-700 bg-blue-50/60 dark:bg-blue-900/20 ring-1 ring-blue-300 dark:ring-blue-700"
                  : "border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-blue-200 dark:hover:border-blue-800"
              }`}
            >
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                <HighlightMatch text={result.name} query={searchQuery} />
              </p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate mt-0.5">{result.pathLabel}</p>
            </button>
          ))}
        </div>
        {globalSearchTotalCount > globalSearchResults.length && (
          <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center py-1.5">
            Showing {globalSearchResults.length} of {globalSearchTotalCount} — refine your search to see more.
          </p>
        )}
      </div>
    );
  }

  if (rows.length === 0) {
    return <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">No employees match this filter.</p>;
  }

  return (
    <div className="space-y-1.5">
      {rows.map((employee) => {
        const isExpanded = isRowExpanded(employee.id);
        return (
          <div key={employee.id} className="min-w-0">
            <EmployeeRow
              employee={employee}
              isExpanded={isExpanded}
              onToggleExpand={toggleExpand}
              onDrillInto={onDrillInto}
              drillingEnabled={drillingEnabled}
              notCompletedPopoverOpen={openNotCompletedId === employee.id}
              onToggleNotCompletedPopover={toggleNotCompletedPopover}
              searchQuery={searchQuery}
            />
            <EmployeeExpandedRecords
              open={isExpanded}
              trainings={employee.trainings}
              certifications={employee.certifications}
              batchByNum={batchByNum}
              onNavigateToBatch={onNavigateToBatch}
              panelId={`employee-records-${employee.id}`}
              employeeName={employee.name}
            />
          </div>
        );
      })}
    </div>
  );
}
