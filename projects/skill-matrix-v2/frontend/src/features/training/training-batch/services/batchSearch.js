import { filterBySearchQuery, matchesSearchQuery, tokenizeQuery } from "../../shared/config/searchMatch";

/**
 * Batch fields that are always in the batch list, so they can be searched
 * without loading anything else. To search a new column, add it here.
 */
export const BATCH_STATIC_SEARCH_FIELDS = [
  (b) => b.batch_num,
  (b) => b.batch_desc,
  (b) => b.module_name,
  (b) => b.area_name,
  (b) => b.sub_area_name,
  (b) => b.batch_status,
  (b) => b.batch_status_remarks,
  (b) => b.training_quarter,
  (b) => b.trainer,
  (b) => b.employee_count,
];

/**
 * Search batches by the fields above, plus extra fields the caller gives
 * (like employee names). Uses the shared search code (searchMatch.js).
 */
export function filterBatchesBySearch(batches, search, extraFieldGetters = []) {
  return filterBySearchQuery(batches, search, [...BATCH_STATIC_SEARCH_FIELDS, ...extraFieldGetters]);
}

/**
 * True when the batch row itself does not match the search, so the match is
 * inside it (for example, an enrolled employee's name). The page then opens
 * the row so the user can see why it matched.
 */
export function isNestedOnlySearchMatch(batch, search) {
  return Boolean(String(search || "").trim()) && !matchesSearchQuery(batch, search, BATCH_STATIC_SEARCH_FIELDS);
}

// Searchable fields of one enrollment row: the same columns the table shows.
// department is left out because it is not shown on this page.
const ENROLLMENT_MATCH_FIELD_DEFS = [
  // label null = matched on the person's name or id. For other fields, the
  // chip says which column matched.
  { label: null, get: (e) => e.employee_name },
  { label: null, get: (e) => e.emp_id },
  { label: "Status", get: (e) => e.training_status },
  { label: "Remark", get: (e) => e.status_remarks },
  { label: "Nominated by", get: (e) => e.nominated_by },
];
export const ENROLLMENT_SEARCH_FIELDS = ENROLLMENT_MATCH_FIELD_DEFS.map((f) => f.get);

/** True when this enrollment row matches the search (used to highlight it). */
export function enrollmentMatchesSearch(enrollment, search) {
  return Boolean(String(search || "").trim()) && matchesSearchQuery(enrollment, search, ENROLLMENT_SEARCH_FIELDS);
}

/**
 * Text for the "Matches: …" chip on a closed row, like "Jane Doe" or
 * "Jane Doe — Status: Completed". Gives nothing if the batch's enrollments
 * are not loaded yet.
 */
export function getNestedMatchSnippet(batch, search, enrollmentsCache) {
  const enrollments = (enrollmentsCache && enrollmentsCache[batch.batch_id]) || [];
  const match = enrollments.find((enrollment) => enrollmentMatchesSearch(enrollment, search));
  if (!match || !match.employee_name) return null;
  const tokens = tokenizeQuery(search);
  const reason = ENROLLMENT_MATCH_FIELD_DEFS.find(({ label, get }) => {
    if (!label) return false;
    const value = get(match);
    return value != null && tokens.some((t) => String(value).toLowerCase().includes(t));
  });
  return reason ? `${match.employee_name} — ${reason.label}: ${reason.get(match)}` : match.employee_name;
}
