// Pure filter functions for the "By Training" batch-group list — mirrors
// employeeListFilters.js's convention (single responsibility, kept
// separate from useTrainingBatchGroups.js's data-fetching/grouping
// concerns) but for the group/nominee shape instead of the employee-row
// shape.
import { getBucketForStatus } from "../../shared/config/trainingStatusBuckets";
import { filterBySearchQuery } from "../../shared/config/searchMatch";

/**
 * OCP config: searchable fields for one batch group (useTrainingBatchGroups.js's
 * `groups` shape: {batchNum, moduleName, areaName, nominees: [{employeeName,
 * trainingStatus, managerGroup}]}). Was module/area/batchNum only — broadened
 * per the search-fix requirement to also match each nominee's name/status/
 * team, so searching an employee's name surfaces the batches they're
 * nominated into, not only a training/module/batch-code match.
 */
export const TRAINING_GROUP_SEARCH_FIELDS = [
  (g) => g.moduleName,
  (g) => g.areaName,
  (g) => g.batchNum,
  (g) => (g.nominees || []).map((n) => n.employeeName),
  (g) => (g.nominees || []).map((n) => n.trainingStatus),
  (g) => (g.nominees || []).map((n) => n.managerGroup),
];

/**
 * Case-insensitive, partial, multi-token search across a batch group's own
 * fields and its nominees' name/status/team — thin wrapper over
 * shared/search/searchMatch.js's generic filterBySearchQuery.
 */
export function filterGroupsBySearch(groups, search) {
  return filterBySearchQuery(groups, search, TRAINING_GROUP_SEARCH_FIELDS);
}

/**
 * Keeps only nominees whose training status falls in the given bucket
 * ("assigned" passes everyone through, unfiltered — same semantic as
 * employeeListFilters.js's filterByStatusBucket). A pending-only
 * nominee (no real enrollment record yet, trainingStatus is null) buckets
 * as "notStarted" via getBucketForStatus's own fallback for empty/unknown
 * status — nothing special-cased here.
 */
export function filterNomineesByStatusBucket(nominees, bucketKey) {
  if (!bucketKey || bucketKey === "assigned") return nominees;
  return nominees.filter((n) => getBucketForStatus(n.trainingStatus) === bucketKey);
}
