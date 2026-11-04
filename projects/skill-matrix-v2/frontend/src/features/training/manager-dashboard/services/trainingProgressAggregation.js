// Manager-side aggregation for the Training Progress widget: bucketed by
// training status, scoped to either the manager's direct reports or their
// entire (recursive) team — see the Manager Dashboard's Direct/Entire Team
// toggle. Kept separate from helper/hierarchyUtils.js on purpose — existing
// imports in this codebase flow component -> helper, never back, and this
// is the one place hierarchy-walking meets status-bucket knowledge.

import { getScopedTeamFromHierarchy } from "../../../../helper/hierarchyUtils";
import { countTrainingBuckets } from "../../shared/config/trainingStatusBuckets";
import { normalizeTrainingRecord } from "../../shared/config/trainingRecordAdapter";
import { isTestOrPlaceholderRecord } from "./testDataFilters";

/**
 * Shared aggregation core behind both computeDirectReportsTrainingBuckets
 * and computeAllReportsTrainingBuckets — one implementation, two entry
 * points, so the scope toggle can switch team composition without
 * duplicating the bucket/count walk.
 * @returns {{
 *   counts: { assigned: number, completed: number, inProgress: number, notStarted: number, notCompleted: number },
 *   byReportee: Array<{ id, name, role, empId, counts, trainings: Array, managerGroup: string }>
 * }}
 */
function computeTrainingBucketsForTeam(team) {
  const byReportee = team.map((reportee) => {
    const rawTrainings = reportee?.trainings?.trainingArray || [];
    // Seed/QA fixture rows (see testDataFilters.js) are dropped at THIS one
    // point — every manager-facing surface (StatusTabs badge counts, the
    // By Employee row rollups, expanded training cards, and the By
    // Training batch groups) derives its `trainings` from here, so
    // filtering once keeps counts and displayed records consistent
    // instead of risking a card list showing fewer items than its own "N
    // assigned" figure claims.
    const trainings = rawTrainings.filter((t) => !isTestOrPlaceholderRecord(normalizeTrainingRecord(t)));
    return {
      id: reportee.id,
      name: reportee.name || "Unknown",
      role: reportee.role || "Employee",
      empId: reportee.empId,
      counts: countTrainingBuckets(trainings),
      trainings,
      // "<name>'s team" — whoever this reportee reports to directly,
      // already resolved by getScopedTeamFromHierarchy below (the same
      // hierarchy-resolution Team Alerts' "grouped by manager" views use).
      // Threaded through here so useTrainingBatchGroups.js's nominees can
      // carry it too, without a second/independent team-ownership lookup.
      managerGroup: reportee.managerGroup || null,
    };
  });

  const counts = byReportee.reduce(
    (totals, r) => ({
      assigned: totals.assigned + r.counts.assigned,
      completed: totals.completed + r.counts.completed,
      inProgress: totals.inProgress + r.counts.inProgress,
      notStarted: totals.notStarted + r.counts.notStarted,
      notCompleted: totals.notCompleted + r.counts.notCompleted,
    }),
    { assigned: 0, completed: 0, inProgress: 0, notStarted: 0, notCompleted: 0 }
  );

  return { counts, byReportee };
}

/** Aggregates training-status buckets across the logged-in manager's DIRECT reports only. */
export function computeDirectReportsTrainingBuckets(hierarchyData) {
  return computeTrainingBucketsForTeam(getScopedTeamFromHierarchy(hierarchyData, "direct"));
}

/** Same aggregation, scoped to the manager's ENTIRE (recursive) team instead of just direct reports. */
export function computeAllReportsTrainingBuckets(hierarchyData) {
  return computeTrainingBucketsForTeam(getScopedTeamFromHierarchy(hierarchyData, "all"));
}

/**
 * Picks direct-vs-all aggregation by `scope` — the one ternary
 * useTeamScopeSummary.js, useTrainingBatchGroups.js, and
 * useTeamHierarchyView.js otherwise each independently duplicated. Callers
 * that need a different root per branch (e.g. useTeamHierarchyView.js's
 * drill-position-aware `viewRoot` for "all" vs `hierarchyData` for "direct")
 * pick that root themselves first, then pass it in here — this only owns
 * the direct-vs-all function choice, not root resolution.
 */
export function getTrainingBucketsForScope(hierarchyData, scope) {
  return scope === "all" ? computeAllReportsTrainingBuckets(hierarchyData) : computeDirectReportsTrainingBuckets(hierarchyData);
}
