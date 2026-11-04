import React from "react";
import TrainingBatchGroup from "./TrainingBatchGroup";
import { useExpandedSet } from "../../../../hooks/useExpandedSet";

/**
 * Renders the "By Training" view's batches as a flat list, one row per
 * training/batch — no domain-category (Backend/Cloud/Data) grouping layer.
 * Each row keeps its own expand chevron (TrainingBatchGroup) which opens
 * in place to show the actual nominee names (TrainingBatchNomineeRow),
 * unchanged from before.
 *
 * Expand state is the same useExpandedSet hook EmployeeList.jsx's By
 * Employee row-expand uses (SRP: this component owns rendering, the hook
 * owns "which ids are open").
 *
 * Props: { groups }
 */
export default function TrainingBatchGroupList({ groups }) {
  const { isExpanded, toggle } = useExpandedSet();

  if (groups.length === 0) {
    return <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">No trainings match this filter.</p>;
  }

  return (
    <div className="space-y-1.5">
      {groups.map((group) => (
        <TrainingBatchGroup
          key={group.batchNum}
          group={group}
          isExpanded={isExpanded(group.batchNum)}
          onToggleExpand={toggle}
        />
      ))}
    </div>
  );
}
