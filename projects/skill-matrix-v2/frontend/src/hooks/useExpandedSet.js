import { useCallback, useState } from "react";

/**
 * Which-ids-are-open state for a Set-based expand/collapse accordion — the
 * exact toggle logic previously hand-duplicated in EmployeeList.jsx (By
 * Employee row expand) and TrainingBatchGroupList.jsx (By Training row
 * expand). Owns only "which ids are open," nothing about what renders
 * inside — callers still pair it with their own <Collapse> panel.
 */
export function useExpandedSet(initial) {
  const [expandedIds, setExpandedIds] = useState(() => initial ?? new Set());

  const toggle = useCallback((id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const isExpanded = useCallback((id) => expandedIds.has(id), [expandedIds]);
  const expandAll = useCallback((ids) => setExpandedIds(new Set(ids)), []);
  const collapseAll = useCallback(() => setExpandedIds(new Set()), []);

  return { expandedIds, isExpanded, toggle, expandAll, collapseAll };
}
