// Helpers used by both BatchTable and EnrollmentTable, so dates and colors
// look the same in both.

import { FiClock, FiCheckCircle, FiPlayCircle, FiCircle, FiSlash, FiXCircle, FiPauseCircle, FiAlertCircle, FiUserX } from "react-icons/fi";
import { BATCH_STATUS_COLORS } from "../../shared/config/batchStatusColors";

export const sortAlpha = (values) => values.sort((a, b) => a.localeCompare(b));

// Unique, non-empty values, sorted A-Z (for dropdown options).
export function uniqueSorted(arr) {
  return [...new Set(arr.filter(Boolean))].sort();
}

// Wait time (ms) before scrolling, so the open/close animation can finish.
export const SCROLL_INTO_VIEW_DELAY = 240;

// The value saved as nominated_by: "Self nomination" when the nominator is
// the same person as the enrolled employee (checked by id, else by name or
// emp_id); otherwise the nominator's name.
export function resolveNominatedBy(nominator, employee) {
  if (!nominator) return undefined;
  const name = typeof nominator === "string" ? nominator : (nominator.name || nominator.emp_id);
  if (!employee || !name) return name;
  const isSelf = typeof nominator === "string"
    ? (name === employee.name || name === employee.emp_id)
    : (
        (nominator.id != null && employee.id != null && String(nominator.id) === String(employee.id)) ||
        (nominator.name && nominator.name === employee.name) ||
        (nominator.emp_id && nominator.emp_id === employee.emp_id)
      );
  return isSelf ? "Self nomination" : name;
}

// True when the nominator is the logged-in user (the default choice).
function isDefaultNominator(nominator, defaultNominator) {
  return Boolean(
    nominator?.id != null && defaultNominator?.id != null
      && String(nominator.id) === String(defaultNominator.id)
  );
}

// Like resolveNominatedBy, but if the logged-in user picked themselves it
// saves "Self nomination". `employee` is optional.
export function nominatedByValue(nominator, defaultNominator, employee = null) {
  return isDefaultNominator(nominator, defaultNominator) ? "Self nomination" : resolveNominatedBy(nominator, employee);
}

// Status order for sorting (Planned -> Open -> In Progress -> Completed ->
// Cancelled -> Archived), taken from the key order of BATCH_STATUS_COLORS.
const BATCH_STATUS_ORDER = Object.keys(BATCH_STATUS_COLORS);
export function sortByWorkflowOrder(values) {
  return [...values].sort((a, b) => {
    const ia = BATCH_STATUS_ORDER.indexOf(a.toLowerCase());
    const ib = BATCH_STATUS_ORDER.indexOf(b.toLowerCase());
    if (ia === -1 && ib === -1) return a.localeCompare(b); // unknown values: alphabetical fallback
    if (ia === -1) return 1;  // unknown values sort after known ones
    if (ib === -1) return -1;
    return ia - ib;
  });
}

// useRetryOnOpen is in ../hooks/useRetryOnOpen.js.

export function formatDate(d) {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date)) return d;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// Colors for each training status. Kept here (not in a component file) so
// BatchTable and EnrollmentTable can both use them.
export const ENROLLMENT_STATUS_COLORS = {
  nominated:       "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300",
  // "Pending Approval" is the real status name. `nominated` above is kept for
  // old records that still use that name.
  "pending approval": "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  completed:       "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  "in progress":   "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  "not started":   "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
  dropped:         "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  cancelled:       "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
  "on hold":       "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  "not completed": "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  "no show":       "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300",
};

// One icon for each training status, used on every screen, so the same
// status always has the same icon. `nominated` uses the same icon as
// "pending approval" because they mean the same thing.
export const ENROLLMENT_STATUS_ICONS = {
  nominated: FiClock,
  "pending approval": FiClock,
  completed: FiCheckCircle,
  "in progress": FiPlayCircle,
  "not started": FiCircle,
  dropped: FiSlash,
  cancelled: FiXCircle,
  "on hold": FiPauseCircle,
  "not completed": FiAlertCircle,
  "no show": FiUserX,
};

// Counts enrollments for each status, using the real status names.
export function countEnrollmentStatuses(enrollments) {
  const counts = {};
  for (const e of enrollments) {
    const status = e.training_status || "Unknown";
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}

// Approved and rejected totals from a
// Map(employee_training_id -> "approved" | "rejected").
export function countReviewDecisions(decisions) {
  const approved = [...(decisions?.values() ?? [])].filter((d) => d === "approved").length;
  return { approved, rejected: (decisions?.size ?? 0) - approved };
}

// Only the "Not Completed" status goes into the "Not Completed" chip. Other
// statuses (Not Started, On Hold, …) get their own chips.
export const NOT_COMPLETED_STATUSES = ["Not Completed"];

// Splits the counts into the "Not Completed" total and the rest (`rest`),
// which each get their own chip.
export function groupEnrollmentStatusCounts(counts) {
  let notCompletedCount = 0;
  NOT_COMPLETED_STATUSES.forEach((status) => { notCompletedCount += counts[status] || 0; });
  const rest = { ...counts };
  NOT_COMPLETED_STATUSES.forEach((status) => { delete rest[status]; });
  return { notCompletedCount, rest };
}

export function toDateInput(val) {
  if (!val) return "";
  const s = String(val);
  // Already a date like "2026-04-29" (or with a time): take the date part
  // directly, so the time zone cannot change the day.
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  // The backend can also send dates like "Wed, 29 Apr 2026 00:00:00 GMT".
  // Read the UTC parts so the day stays correct.
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
