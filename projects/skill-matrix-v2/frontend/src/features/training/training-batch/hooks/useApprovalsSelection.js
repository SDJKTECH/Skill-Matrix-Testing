import { useCallback, useMemo, useState } from "react";

/**
 * Keeps track of which pending requests are ticked, and the state of the
 * "select all" checkboxes for each batch and for the page.
 */
export function useApprovalsSelection() {
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const isSelected = useCallback((id) => selectedIds.has(String(id)), [selectedIds]);

  const toggleOne = useCallback((id) => {
    const key = String(id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleMany = useCallback((ids) => {
    const keys = ids.map(String).filter(Boolean);
    if (keys.length === 0) return;
    setSelectedIds((prev) => {
      const allOn = keys.every((key) => prev.has(key));
      const next = new Set(prev);
      for (const key of keys) {
        if (allOn) next.delete(key);
        else next.add(key);
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelectedIds(new Set()), []);

  /** Remove ids that can no longer be ticked (saved, filtered out, or in Undo time). */
  const pruneTo = useCallback((allowedIds) => {
    const allowed = new Set([...allowedIds].map(String));
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set();
      for (const id of prev) {
        if (allowed.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, []);

  const getScopeState = useCallback(
    (ids) => {
      const keys = ids.map(String).filter(Boolean);
      if (keys.length === 0) {
        return { checked: false, indeterminate: false, selectedCount: 0, total: 0 };
      }
      let selectedCount = 0;
      for (const key of keys) {
        if (selectedIds.has(key)) selectedCount += 1;
      }
      return {
        checked: selectedCount === keys.length,
        indeterminate: selectedCount > 0 && selectedCount < keys.length,
        selectedCount,
        total: keys.length,
      };
    },
    [selectedIds]
  );

  const selectedCount = selectedIds.size;

  const selectedIdList = useMemo(() => [...selectedIds], [selectedIds]);

  return {
    selectedIds,
    selectedIdList,
    selectedCount,
    isSelected,
    toggleOne,
    toggleMany,
    clear,
    pruneTo,
    getScopeState,
  };
}

/** How many different batches the selected requests belong to. */
export function countSelectedBatches(selectedIds, requests) {
  const batches = new Set();
  for (const request of requests || []) {
    if (selectedIds.has(String(request.id)) && request.batchNum != null) {
      batches.add(String(request.batchNum));
    }
  }
  return batches.size;
}
