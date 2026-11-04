// Pure filter functions for the Manager Dashboard's team-member list — kept
// separate from useManagerDashboardData.js's data-fetching/aggregation
// concerns (single responsibility), and independently testable/reusable.
import { getDirectReportsFromHierarchy } from "../../../../helper/hierarchyUtils";
import { STATUS_BUCKET_CONFIG, getTrainingStatus } from "../../shared/config/trainingStatusBuckets";
import { filterBySearchQuery } from "../../shared/config/searchMatch";
import { normalizeTrainingRecord } from "../../shared/config/trainingRecordAdapter";

/**
 * OCP config: searchable fields for one "By Employee" roster row (the shape
 * useTeamHierarchyView.js's buildRowFromRaw produces — name/role/empId plus
 * the reportee's own raw trainings array, already resident on the row with
 * no extra fetch needed). Was name-only (a `filterByName` that only ever
 * checked `.name`) — broadened per the search-fix requirement to also match
 * role/employee id and each of the employee's own training titles/statuses,
 * so "python" or "completed" typed here finds the right person too, not
 * only an exact name.
 */
export const EMPLOYEE_ROW_SEARCH_FIELDS = [
  (row) => row.name,
  (row) => row.role,
  (row) => row.empId,
  (row) => (row.trainings || []).map((t) => normalizeTrainingRecord(t).moduleName),
  (row) => (row.trainings || []).map((t) => getTrainingStatus(t)),
];

/**
 * Case-insensitive, partial, multi-token search across an employee row's
 * name/role/id and their own trainings — thin wrapper over shared/search/
 * searchMatch.js's generic filterBySearchQuery (DIP: this file only
 * supplies the field config, the actual matching logic lives in one shared
 * place). Replaces the old name-only filterByName.
 */
export function filterEmployeeRowsBySearch(rows, search) {
  return filterBySearchQuery(rows, search, EMPLOYEE_ROW_SEARCH_FIELDS);
}

/** Keeps only rows with >=1 training in ANY of the selected status buckets
 * (e.g. ["Completed", "In Progress"]) — labels are the identity here, same
 * convention as the Status/Mode filters on My Trainings, where the option
 * string IS the value. A multi-select complement to the single-select
 * StatusTabs above the list: StatusTabs can only show one bucket at a time,
 * this lets a manager combine several (e.g. "In Progress OR Not Started" —
 * everyone not yet done). */
export function filterByTrainingStatus(rows, selectedStatusLabels = []) {
  if (!selectedStatusLabels.length) return rows;
  const selectedKeys = STATUS_BUCKET_CONFIG
    .filter((bucket) => selectedStatusLabels.includes(bucket.label))
    .map((bucket) => bucket.key);
  return rows.filter((r) => selectedKeys.some((key) => (r.counts[key] ?? 0) > 0));
}

/** Keeps only rows with >=1 training in the given status bucket ("assigned" passes everyone through, since it's every record unfiltered). */
export function filterByStatusBucket(rows, bucketKey) {
  if (!bucketKey || bucketKey === "assigned") return rows;
  return rows.filter((r) => (r.counts[bucketKey] ?? 0) > 0);
}

/** Whether a single employee row matches the active list filters (not name search). */
export function employeeMatchesListFilters(row, filters) {
  if (filters.statusLabels?.length && filterByTrainingStatus([row], filters.statusLabels).length === 0) return false;
  if (filters.statusBucket && filters.statusBucket !== "assigned" && filterByStatusBucket([row], filters.statusBucket).length === 0) {
    return false;
  }
  return true;
}

export function hasActiveListFilters(filters) {
  return Boolean(
    (filters.statusBucket && filters.statusBucket !== "assigned") ||
    (filters.statusLabels && filters.statusLabels.length > 0)
  );
}

/**
 * Flat index of every employee in the hierarchy with ancestor chain for
 * global search path labels and click-to-navigate.
 */
export function buildEmployeeSearchIndex(hierarchyData) {
  if (!hierarchyData) return [];

  const results = [];

  function walk(node, ancestors) {
    for (const child of getDirectReportsFromHierarchy(node)) {
      const pathLabel =
        ancestors.length === 0
          ? "Direct report"
          : ancestors.map((a) => `${a.name}'s Team`).join(" › ");
      results.push({
        id: child.id,
        name: child.name || "Unknown",
        role: child.role || "Employee",
        ancestors: [...ancestors],
        pathLabel,
      });
      walk(child, [...ancestors, { id: child.id, name: child.name || "Unknown" }]);
    }
  }

  walk(hierarchyData, []);
  return results;
}
