// MD-7 split (2026-08-19): team-flattening/grouping, formerly one of 5 mixed
// concerns in managerDashboardData.js — see pendingRequests.js and
// hierarchyPatching.js for the other two.

// Fallback label for anything that reaches groupByManager without a
// managerGroup already attached (see hierarchyUtils.js's
// flattenTeamWithManagerContext/getScopedTeamFromHierarchy — the single
// source of truth for "who's on whose team" every caller here reads from,
// rather than re-deriving it).
export const UNGROUPED_LABEL = "Unassigned";

// Single shared "group a list of items by their manager" utility — used by
// TeamTrainingStatusCard.jsx's alert-matches view (By Employee) and
// TrainingBatchGroup.jsx's nominee list (By Training), so both views group
// by the exact same rule instead of each rolling their own. Biggest group
// first — surfaces where something is most concentrated without needing to
// know which group is "the root manager's own" (every group is now
// "<name>'s team", see hierarchyUtils.js's flattenTeamWithManagerContext
// doc comment). Array.prototype.sort is stable, so equal-size groups keep
// their original (tree-traversal) insertion order rather than jumping around.
export function groupByManager(items) {
  const map = new Map();
  for (const item of items) {
    const key = item.managerGroup || UNGROUPED_LABEL;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
}
