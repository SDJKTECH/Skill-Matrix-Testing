import { useMemo } from "react";
import { getTrainingBucketsForScope } from "../services/trainingProgressAggregation";

/**
 * Root-scoped training summary — renamed and slimmed down from
 * useManagerDashboardData.js now that its `rows` (superseded by
 * useTeamHierarchyView.js's drill-aware roster) and `batchByNum`
 * (promoted to the shared useBatchByNum.js, since it's no longer a
 * single-consumer concern) have moved out. What's left is the StatusTabs
 * badge numbers for the "By Training" view (batch grouping is scope-wide,
 * not hierarchy-positional, so it has no drilled equivalent to re-scope
 * to). "By Employee" no longer uses this — see useTeamHierarchyView.js's
 * own `counts`, which re-scopes to the current drill position instead.
 *
 * @param {object} hierarchyData
 * @param {"direct"|"all"} [scope] - "direct" (default) = immediate reports only; "all" = entire recursive team
 * @returns {{ counts }}
 */
export function useTeamScopeSummary(hierarchyData, scope = "direct") {
  const { counts } = useMemo(() => getTrainingBucketsForScope(hierarchyData, scope), [hierarchyData, scope]);

  return { counts };
}
