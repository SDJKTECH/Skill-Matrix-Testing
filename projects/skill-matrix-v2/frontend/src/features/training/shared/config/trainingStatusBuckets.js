// Single source of truth for the simplified 5-bucket training status view
// (Assigned / Completed / In Progress / Not Started / Not Completed) used
// across the Employee and Manager Training Progress widgets. The live
// backend training_status enum (Nominated, Not Started, In Progress,
// Completed, Dropped, Cancelled, On Hold, Not Completed, No Show) has no
// "Assigned" value — here "Assigned" means every record, unfiltered. Every
// status besides Completed/In Progress/Not Completed folds into "Not
// Started" via NOT_STARTED_FOLD_STATUSES, the same array-based fold pattern
// already used by NOT_COMPLETED_STATUSES in
// component/training-batch/trainingUtils.js. Individual training
// cards/detail views always show the real, unfolded status — the fold only
// applies at this bucket/counting layer.
//
// "Pending Approval" is the one remaining exception, carved out into its
// own internal bucket instead of folding into "Not Started" — it's a real,
// live training_status_enum value (see TEAM_STATUS_BUCKET_CONFIG below,
// which already treats all 5 real values as fully separate with no
// folding) with its own dedicated badge color in ENROLLMENT_STATUS_COLORS
// (training-batch/trainingUtils.js) and card display text, so a record
// showing that badge would otherwise surface under a "Not Started" filter
// tab while visibly disagreeing with it. `pendingApproval` is not a
// STATUS_BUCKET_CONFIG entry — no tab for it — it simply stays visible only
// under "Assigned"/"All". ("Not Completed" used to get the same
// internal-only treatment; promoted to a real tab below since managers
// need to filter down to it directly, not just see it folded into "All".)
// (Dropped/Cancelled/On Hold/No Show remain folded into "Not Started" below
// — unlike Pending Approval/Not Completed, none of them is a live enum
// value today, confirmed by HOME_PROGRESS_BUCKET_CONFIG's own comment
// further down, so there's no live card whose badge could currently
// disagree with that fold.)

import { FiGrid } from "react-icons/fi";
import { ENROLLMENT_STATUS_ICONS } from "../../training-batch/services/trainingUtils";

// Documents exactly which statuses are currently folded into "Not Started"
// (anything besides Completed/In Progress also lands there by default — see
// getBucketForStatus — so this list doubles as the audit trail of what that
// default currently covers). None of these is a live enum value today (see
// HOME_PROGRESS_BUCKET_CONFIG's own comment further down) — this is a
// defensive catch-all, not evidence they occur in real data. "Nominated"/
// "Pending Approval"/"Not Completed" are deliberately NOT here — see the
// module comment above for why they get their own bucket instead. To move
// one of these to a different bucket later (e.g. if it becomes real), add
// an explicit branch for it in getBucketForStatus and remove it from this
// list.
export const NOT_STARTED_FOLD_STATUSES = [
  "On Hold",
  "Dropped",
  "Cancelled",
  "No Show",
];

// Drives chip/tab order/label/icon/color everywhere a status breakdown is
// rendered (both StatusTabs instances) — adding a future 5th bucket is a
// config edit here, not a rewrite of any component. Icons (besides
// "assigned", which isn't a real status) come from ENROLLMENT_STATUS_ICONS
// — the single source of truth for "what icon means this training status"
// — rather than a second, independently-picked icon per bucket that could
// silently drift from what the same status shows as a StatusPill elsewhere.
export const STATUS_BUCKET_CONFIG = [
  {
    key: "assigned",
    // Display label is "All" (matches its real semantics — every record,
    // unfiltered — see the module comment above); the "assigned" key stays
    // as-is since it's threaded through session-persisted filters, the
    // Manager leaderboard aggregation, and the `counts.assigned`
    // denominator, none of which need to change for a label swap.
    label: "All",
    icon: FiGrid,
    color: "indigo",
  },
  {
    key: "completed",
    label: "Completed",
    icon: ENROLLMENT_STATUS_ICONS.completed,
    color: "green",
  },
  {
    key: "inProgress",
    label: "In Progress",
    icon: ENROLLMENT_STATUS_ICONS["in progress"],
    color: "blue",
  },
  {
    key: "notStarted",
    label: "Not Started",
    icon: ENROLLMENT_STATUS_ICONS["not started"],
    color: "gray",
  },
  {
    key: "notCompleted",
    label: "Not Completed",
    icon: ENROLLMENT_STATUS_ICONS["not completed"],
    color: "red",
  },
];

// Same defensive fallback chain already used in SelfDashboard.jsx for
// reading a training record's status regardless of which API shape
// (camelCase hierarchy vs snake_case add_training_v2) produced it.
export function getTrainingStatus(training) {
  return (
    training?.trainingStatus ||
    training?.status ||
    training?.Status ||
    training?.training_status ||
    "Not Started"
  );
}

// Maps a raw status string to one of the 3 non-"assigned" buckets (plus the
// internal-only "pendingApproval"/"notCompleted" — see the module comment
// above). Unknown/future statuses default to "notStarted" rather than being
// dropped, so a new backend enum value never silently disappears from the
// counts.
export function getBucketForStatus(rawStatus) {
  const status = String(rawStatus || "").trim().toLowerCase();
  if (status === "completed") return "completed";
  if (status === "in progress") return "inProgress";
  // Two raw spellings can reach here for the same "awaiting manager review"
  // state: "Nominated" (StatusPill.jsx's DISPLAY_LABEL_OVERRIDES renames it
  // to "Pending Approval" for display) from the older nomination path, and
  // the literal training_status = 'Pending Approval' the newer self-
  // nomination flow writes directly (see useTrainingBatchGroups.js's own
  // doc comment) — both fold to the same bucket here.
  if (status === "nominated" || status === "pending approval") return "pendingApproval";
  if (status === "not completed") return "notCompleted";
  return "notStarted";
}

/** Splits a training array into the 4 visible buckets plus the internal-only "pendingApproval"/"notCompleted" ones. "assigned" is the input itself, unfiltered. */
export function bucketTrainings(trainingArray = []) {
  const buckets = { assigned: trainingArray, completed: [], inProgress: [], notStarted: [], pendingApproval: [], notCompleted: [] };
  for (const training of trainingArray) {
    const bucket = getBucketForStatus(getTrainingStatus(training));
    buckets[bucket].push(training);
  }
  return buckets;
}

/** Same as bucketTrainings but returns counts only. */
export function countTrainingBuckets(trainingArray = []) {
  const buckets = bucketTrainings(trainingArray);
  return {
    assigned: buckets.assigned.length,
    completed: buckets.completed.length,
    inProgress: buckets.inProgress.length,
    notStarted: buckets.notStarted.length,
    pendingApproval: buckets.pendingApproval.length,
    notCompleted: buckets.notCompleted.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Home Screen's own Training Progress list (see SelfDashboard.jsx — a
// row-list with icon/label/count/chevron, not the chip row above). This
// used to also show "Enrolled" (a derived Completed+InProgress+NotStarted
// sum, not a real status) plus "Pending Approval"/"Cancelled" (mapped from
// "Nominated"/"Cancelled" — neither is a real value in the DB's
// training_status_enum, verified live against the training_status enum
// endpoint: only 'Not Started', 'In Progress', 'Completed', 'Not
// Completed' exist). Both were always-zero against real data for that
// reason, so this is now a direct 1:1 mapping onto exactly those 4 real
// enum values — no derived rows, no folding, no rows that can never
// populate. Order here also drives row order in the UI.
export const HOME_PROGRESS_BUCKET_CONFIG = [
  { key: "notStarted", label: "Not Started", icon: ENROLLMENT_STATUS_ICONS["not started"], color: "gray" },
  { key: "inProgress", label: "In Progress", icon: ENROLLMENT_STATUS_ICONS["in progress"], color: "blue" },
  { key: "completed", label: "Completed", icon: ENROLLMENT_STATUS_ICONS.completed, color: "green" },
  { key: "notCompleted", label: "Not Completed", icon: ENROLLMENT_STATUS_ICONS["not completed"], color: "red" },
];

export function getHomeProgressBucket(rawStatus) {
  const status = String(rawStatus || "").trim().toLowerCase();
  if (status === "completed") return "completed";
  if (status === "in progress") return "inProgress";
  if (status === "not completed") return "notCompleted";
  return "notStarted";
}

/** Splits a training array into the 4 real training_status_enum buckets. */
export function bucketHomeProgressTrainings(trainingArray = []) {
  const buckets = { notStarted: [], inProgress: [], completed: [], notCompleted: [] };
  for (const training of trainingArray) {
    buckets[getHomeProgressBucket(getTrainingStatus(training))].push(training);
  }
  return buckets;
}

/** Same as bucketHomeProgressTrainings but returns counts only. */
export function countHomeProgressBuckets(trainingArray = []) {
  const buckets = bucketHomeProgressTrainings(trainingArray);
  return {
    notStarted: buckets.notStarted.length,
    inProgress: buckets.inProgress.length,
    completed: buckets.completed.length,
    notCompleted: buckets.notCompleted.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Manager Dashboard per-employee status breakdown (StatusChipGroup). Unlike
// STATUS_BUCKET_CONFIG above (which deliberately folds everything non-
// Completed/In-Progress into "Not Started" for the simplified tab view),
// this is the full, unfolded real-status breakdown a manager needs to see
// "why" at a glance — all 5 real training_status_enum values, one bucket
// each, no folding. `status` is the literal backend enum value (used both
// for bucketing here and as the StatusPill colorMap lookup key, so this
// stays in sync with StatusPill's own palette by construction rather than
// carrying a second color definition — see StatusPill.jsx's
// ENROLLMENT_STATUS_COLORS default). Adding a real 6th/7th status later
// (e.g. once Blocked/Cancelled exist as real per-employee training_status
// values) is a one-entry addition here, not a rewrite of any consumer.
// Icons come from ENROLLMENT_STATUS_ICONS (same map STATUS_BUCKET_CONFIG/
// HOME_PROGRESS_BUCKET_CONFIG above use) — this fixes a real bug this
// config used to have: "In Progress" and "Pending Approval" both rendered
// FiClock, so the 5 chips StatusChipGroup renders side-by-side had two
// visually-identical icons for two different states. Pulling from the
// shared map makes that class of bug structurally impossible going
// forward, not just manually fixed once.
export const TEAM_STATUS_BUCKET_CONFIG = [
  { key: "completed", label: "Completed", status: "Completed", icon: ENROLLMENT_STATUS_ICONS.completed },
  { key: "inProgress", label: "In Progress", status: "In Progress", icon: ENROLLMENT_STATUS_ICONS["in progress"] },
  { key: "notStarted", label: "Not Started", status: "Not Started", icon: ENROLLMENT_STATUS_ICONS["not started"] },
  { key: "pendingApproval", label: "Pending Approval", status: "Pending Approval", icon: ENROLLMENT_STATUS_ICONS["pending approval"] },
  { key: "notCompleted", label: "Not Completed", status: "Not Completed", icon: ENROLLMENT_STATUS_ICONS["not completed"] },
];

/** Maps a raw status string to its TEAM_STATUS_BUCKET_CONFIG key. Unknown/future statuses (or "Nominated" — the pre-migration value some legacy/mock records may still carry) fall into "notStarted" rather than being silently dropped from the total. */
export function getTeamStatusBucket(rawStatus) {
  const status = String(rawStatus || "").trim().toLowerCase();
  const match = TEAM_STATUS_BUCKET_CONFIG.find((bucket) => bucket.status.toLowerCase() === status);
  return match ? match.key : "notStarted";
}

/** Splits a training array into the 5 TEAM_STATUS_BUCKET_CONFIG buckets. */
export function bucketTeamTrainings(trainingArray = []) {
  const buckets = {};
  for (const bucket of TEAM_STATUS_BUCKET_CONFIG) buckets[bucket.key] = [];
  for (const training of trainingArray) {
    buckets[getTeamStatusBucket(getTrainingStatus(training))].push(training);
  }
  return buckets;
}

/** Same as bucketTeamTrainings but returns counts only, in TEAM_STATUS_BUCKET_CONFIG order. */
export function countTeamStatusBuckets(trainingArray = []) {
  const buckets = bucketTeamTrainings(trainingArray);
  const counts = {};
  for (const bucket of TEAM_STATUS_BUCKET_CONFIG) counts[bucket.key] = buckets[bucket.key].length;
  return counts;
}
