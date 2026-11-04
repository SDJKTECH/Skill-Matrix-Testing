// Configuration-driven display for training cards/detail view — adding a
// new attribute to either surface later is a one-line entry here, not a
// JSX rewrite (mirrors the OVERVIEW_FIELDS/ENROLLMENT_DETAIL_SECTIONS
// schema-driven pattern already established in component/training-batch).
// Pure data/functions only (no component export) — StatusPill lives in its
// own file so this one doesn't trip react-refresh/only-export-components,
// same reason component/training-batch/trainingUtils.js was split out from
// EnrollmentTable.jsx.
//
// Cross-page on purpose: both My Trainings (via EntityCardGrid) and Manager
// Dashboard (via TeamMemberExpandedTrainings, and directly for
// normalizeTrainingRecord/mergeBatchDetails) depend on this file, which is
// why it lives at training-progress/ root rather than nested under either
// page's own subfolder.
import React from "react";
import { formatDate, ENROLLMENT_STATUS_ICONS } from "../../training-batch/services/trainingUtils";
import { getTrainingStatus } from "./trainingStatusBuckets";
import StatusPill from "../components/StatusPill";
import { getTechBanner } from "./technologyBanners";
import { firstDefined } from "./firstDefined";
import { FiCalendar, FiClock, FiUser, FiUsers, FiTag, FiMonitor } from "react-icons/fi";

// DetailPanel (reused as-is from component/training-batch) looks up fields
// by a single literal key (`data[field.key]`) with no fallback chain of its
// own — so every training record, whichever API shape produced it
// (camelCase from get_combined_hierarchy_v2, snake_case from the
// add_training_v2 fallback fetch), is normalized to one canonical shape
// HERE, once, before it reaches either EntityCard or DetailPanel. Downstream
// components/schemas can then assume plain, guaranteed keys.
export function normalizeTrainingRecord(training) {
  const t = training || {};
  return {
    id: firstDefined(t, "employeeTrainingId", "employee_training_id", "id") ?? null,
    moduleName: firstDefined(t, "moduleName", "module_name", "module", "name", "Name") || "Training",
    areaName: firstDefined(t, "areaName", "area_name", "area") ?? null,
    subAreaName: firstDefined(t, "subAreaName", "sub_area_name", "subArea") ?? null,
    courseLevel: firstDefined(t, "courseLevel", "course_level") ?? null,
    trainingStatus: getTrainingStatus(t),
    batch: firstDefined(t, "batch", "batch_num", "batch_id") ?? null,
    startDate: firstDefined(t, "startDate", "start_date") ?? null,
    endDate: firstDefined(t, "endDate", "end_date") ?? null,
    nominatedBy: firstDefined(t, "nominatedBy", "nominated_by") ?? null,
    // Real data as of getCombinedHierarchy_v2's department_comment_data
    // LATERAL join (the decision-audit-trail "comment" row every explicit
    // approve/reject/status-change writes) — a fresh hierarchy fetch now
    // carries the real reviewer for a training reviewed in an earlier
    // session, not just the current one. Also still populated
    // client-side, transiently, for the current session right after an
    // approve/reject via reviewTrainingNominations (before the next
    // refetch catches up).
    reviewedByName: firstDefined(t, "reviewedByName", "reviewed_by_name") ?? null,
    reviewedAt: firstDefined(t, "reviewedAt", "reviewed_at") ?? null,
    // The decision/status reason (mandatory on reject, optional note on
    // approve — see shared/InlineDecisionPanel.jsx). Real, live column
    // (employee_trainings.status_remarks) — unlike reviewedByName above,
    // this one IS returned by getCombinedHierarchy_v2 today.
    statusRemarks: firstDefined(t, "statusRemarks", "status_remarks") ?? null,
    employeeComment: firstDefined(t, "employeeComment", "employee_comment") ?? null,
    managerComment: firstDefined(t, "managerComment", "manager_comment") ?? null,
    departmentComment: firstDefined(t, "departmentComment", "department_comment") ?? null,
    // employeeType is already on the raw trainingArray record (real field,
    // no merge needed — see backend/aggregations/getCombinedHierarchy_v2).
    // The next 4 are NOT on the training record itself — they live on the
    // record's BATCH, spliced in by mergeBatchDetails() below before this
    // normalizer runs, which is why they're read here under the batch's own
    // native (snake_case) field names.
    employeeType: firstDefined(t, "employeeType", "employee_type") ?? null,
    trainer: firstDefined(t, "trainer") ?? null,
    duration: firstDefined(t, "duration") ?? null,
    trainingMode: firstDefined(t, "training_mode", "trainingMode") ?? null,
    // Same batch-merged, display-ready value BatchRow.jsx (admin) already
    // shows as-is (its own "YYYY-Qn" format is normalized once at save
    // time via getTrainingQuarterFromDate, training-batch/services/
    // trainingQuarter.js) — reused directly, not re-derived, so this page
    // can never disagree with the admin view of the same batch.
    trainingQuarter: firstDefined(t, "training_quarter", "trainingQuarter") ?? null,
    batchSize: firstDefined(t, "batch_size", "batchSize") ?? null,
    // "seatsUsed" itself included so this stays idempotent if the record
    // gets normalized twice — every other new field above already has this
    // property because its canonical name matches its raw name; this is
    // the one exception (employee_count -> seatsUsed).
    seatsUsed: firstDefined(t, "employee_count", "employeeCount", "seatsUsed") ?? null,
    // Batch's own real created_at/updated_at (also batch-merged, same as
    // trainer/duration/etc above) — powers the "New"/"Recently Updated"
    // quick filter chips. Real columns, not invented for this.
    createdAt: firstDefined(t, "created_at", "createdAt") ?? null,
    updatedAt: firstDefined(t, "updated_at", "updatedAt") ?? null,
  };
}

// The "Not Completed" trainings, normalized — shared by every view that
// lists them with their reasons.
export function getNotCompletedTrainings(trainings) {
  return (trainings || []).filter((t) => getTrainingStatus(t) === "Not Completed").map(normalizeTrainingRecord);
}

/**
 * Splices a training record's BATCH-level fields (trainer/duration/
 * training_mode/batch_size/employee_count — none of which exist on the
 * per-employee training record itself) onto it BEFORE normalization, keyed
 * by batch_num. `batchByNum` is a Map<string, batchRow> built once from
 * trainingBatchesApi.fetchBatches() (the same "fetch all batches" call
 * BatchTable.jsx already makes — no new endpoint). Operates on the RAW
 * (pre-normalize) record so normalizeTrainingRecord's own fallback chains
 * above pick the merged fields up like any other field. A training whose
 * batch_num has no match (batch deleted, or batches still loading) is
 * returned unchanged — the card then simply omits those fields, same
 * null-safe convention as everywhere else in this module.
 */
export function mergeBatchDetails(training, batchByNum) {
  const t = training || {};
  if (!batchByNum) return t;
  const batchNum = firstDefined(t, "batch", "batch_num", "batch_id");
  const batch = batchNum != null ? batchByNum.get(String(batchNum)) : null;
  if (!batch) return t;
  return {
    ...t,
    trainer: t.trainer ?? batch.trainer ?? null,
    duration: t.duration ?? batch.duration ?? null,
    training_mode: t.training_mode ?? batch.training_mode ?? null,
    training_quarter: t.training_quarter ?? batch.training_quarter ?? null,
    batch_size: t.batch_size ?? batch.batch_size ?? null,
    employee_count: t.employee_count ?? batch.employee_count ?? null,
    created_at: t.created_at ?? batch.created_at ?? null,
    updated_at: t.updated_at ?? batch.updated_at ?? null,
  };
}

/**
 * mergeBatchDetails + normalizeTrainingRecord over a raw training array —
 * the chain EmployeeExpandedRecords.jsx needs on an employee's trainings
 * before sorting/rendering/deriving a batch_num list from them.
 */
export function normalizeTrainingList(trainings = [], batchByNum) {
  return trainings.map((raw) => normalizeTrainingRecord(mergeBatchDetails(raw, batchByNum)));
}

// Real training_mode_enum values (verified live against skill_matrix_v2_qa):
// "Internal Videos", "External Platforms", "Hybrid", "Internal
// Instructor-led", "External Instructor-led" — there is no literal
// "Online"/"Classroom"/"Instructor-led" value anywhere in the schema.
// Grouped into 3 buckets (not the earlier 2 — a 4th, "Classroom", was
// considered and dropped: nothing in the real enum distinguishes "a live
// instructor session" from "a live instructor session held in a physical
// room," so a separate Classroom bucket would either exactly duplicate
// Instructor-led or have zero real batches behind it). Add a new
// training_mode value here if the enum grows, not scattered elsewhere.
const TRAINING_MODE_BUCKET = {
  "internal videos": "online",
  "external platforms": "online",
  "hybrid": "hybrid",
  "internal instructor-led": "instructorLed",
  "external instructor-led": "instructorLed",
};

export function getTrainingModeBucket(trainingMode) {
  return TRAINING_MODE_BUCKET[String(trainingMode || "").trim().toLowerCase()] || null;
}

// "New"/"Recently Updated" quick-chip window — same 14-day convention
// nominationMockData.js's isNewBatch already uses for the catalog, applied
// here to a batch's real created_at/updated_at instead.
const RECENT_WINDOW_DAYS = 14;

export function isRecent(isoDate) {
  if (!isoDate) return false;
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return false;
  const ageMs = Date.now() - d.getTime();
  return ageMs >= 0 && ageMs <= RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

// There is no real "is this training mandatory" field anywhere in the data
// model — employeeType (employee_type_enum: "New Lateral"/"Existing
// Lateral"/"Freshers"/"Customer"/"Interns", verified live) categorizes the
// EMPLOYEE's hire type, not the training's requirement level, so it can't
// be used for this. The real, defensible proxy: who nominated it.
// nominated_by is stored as the nominator's real name (see
// EnrollmentTable.jsx's own "Self nomination" detection) — a training the
// employee nominated themselves for is Optional by definition; anyone
// else (a manager, department, "Learning & Development") or no nominator
// at all (system/bulk-assigned) means it was assigned TO them — Mandatory.
export function isMandatoryTraining(training, currentUserDisplayName) {
  const by = (training.nominatedBy || "").trim();
  if (!by) return true;
  if (by.toLowerCase() === "self nomination") return false;
  if (currentUserDisplayName && by.toLowerCase() === currentUserDisplayName.trim().toLowerCase()) return false;
  return true;
}

export function getAreaSubArea(training) {
  return [training.areaName, training.subAreaName].filter(Boolean).join(" / ");
}

/**
 * Maps a normalized (+ ideally batch-merged) training record to
 * shared/cards/EntityCard.jsx's generic prop shape. This is the one place
 * training-specific business logic (the seats->70%-full scarcity threshold,
 * which metadata fields appear in which order, the "View Details" CTA
 * label) lives — EntityCard itself renders blindly off whatever this
 * produces, so a future entity type (e.g. certifications) would get its
 * own equivalent adapter, not a change to EntityCard.
 *
 * @param {object} training - already normalizeTrainingRecord()'d (and ideally mergeBatchDetails()'d first)
 * @param {{onClick?: () => void, extraMetaFields?: Array<{icon,value}>}} [opts]
 *   extraMetaFields: prepended to the standard field list — for contexts
 *   where the card doesn't already imply whose record this is (e.g. Team
 *   Alerts' "associates currently undergoing training" reveal, which shows
 *   one grid of cards spanning multiple different people, unlike every
 *   other caller today where the surrounding row/section already names
 *   the employee).
 */
export function toEntityCardProps(training, { onClick, extraMetaFields = [], employeeName } = {}) {
  const banner = getTechBanner(training);

  return {
    // No `sublabel` — it used to repeat `subtitle` (areaName) a second
    // time inside the banner strip; EntityCard.jsx no longer renders it.
    banner: { icon: banner.icon, gradient: banner.gradient, tint: banner.tint, border: banner.border, iconColor: banner.iconColor, label: banner.label },
    // employeeName (opt-in): for contexts spanning multiple people's
    // records (Team Alerts' "associates currently undergoing training"
    // reveal) where the associate's identity is the primary thing being
    // scanned for, not which training — swaps the card's headline/subtitle
    // hierarchy. Every other caller (one person's own record list) omits
    // this and keeps the training name as the headline.
    title: employeeName || training.moduleName,
    subtitle: employeeName ? training.moduleName : getAreaSubArea(training),
    // icon: same "icon + text, not text alone" pairing batchCardAdapter.jsx's
    // Open-for-Enrollment badges use, sourced from the one shared
    // ENROLLMENT_STATUS_ICONS map (trainingUtils.js) so a status's icon
    // here can never drift from what the exact same status shows anywhere
    // else in the app (TrainingBatchNomineeRow.jsx, StatusChipGroup, etc).
    statusPill: { status: training.trainingStatus, size: "sm", icon: ENROLLMENT_STATUS_ICONS[String(training.trainingStatus).toLowerCase()] },
    // No `primaryFields` — per the reference screenshot, Date sits in the
    // SAME grid as Trainer/Duration/Mode/Seats/Batch, not a separately
    // emphasized row above it. Byte-for-byte the original HEAD version's
    // metaFields array (git show HEAD), field-for-field and in the same
    // order: Reviewed By/Remarks (conditional, post-review only), Date,
    // Trainer, Duration, Mode, Seats, Batch. Date keeps HEAD's own
    // behavior too — always included with a null value when unset, so
    // MetaCell's normal "Not set" fallback renders it, not a custom
    // fallback string.
    // Grouped by theme (icon-anchored card redesign, req 3) — "schedule"
    // (when), "logistics" (who's running it / how / where), each its own
    // themed line separated by a hairline divider instead of one flat
    // grid. extraMetaFields (Team Alerts' cross-employee context) stays
    // ungrouped-first so it always leads, same position as before.
    //
    // Reviewed By / Remarks dropped from the card face (moved to
    // TRAINING_DETAIL_SECTIONS-only, below) — variable-length free text
    // and a conditional 3rd group were exactly what made card height feel
    // inconsistent/odd from one card to the next; every card now always
    // shows the same two groups (schedule, logistics), never a third.
    metaFields: [
      ...extraMetaFields,
      { icon: FiCalendar, value: training.startDate ? formatDate(training.startDate) : null, group: "schedule" },
      { icon: FiClock, value: training.duration, group: "schedule" },
      { icon: FiUser, value: training.trainer, group: "logistics" },
      { icon: FiMonitor, value: training.trainingMode, group: "logistics" },
      { icon: FiUsers, value: training.batchSize != null ? `${training.seatsUsed ?? 0} / ${training.batchSize} Seats` : null, group: "logistics" },
      { icon: FiTag, value: training.batch, group: "logistics" },
    ],
    // No seats-fill scarcity bar on this card — removed on request. The
    // "X / Y Seats" text in metaFields above already states the same
    // number plainly; certRecordAdapter.jsx and batchCardAdapter.jsx both
    // already set this to null too, so no card in the app shows one now.
    progressBar: null,
    // Same label regardless of status — the click always lands on the same
    // read-only Training Batch admin drill-down, never an in-app "continue"
    // or "view certificate" action, so one honest label replaces any
    // status-specific Continue/View Certificate/View Details split.
    ctaLabel: "View Details",
    onClick,
    ariaLabel: employeeName
      ? `View details for ${employeeName}'s ${training.moduleName}, status ${training.trainingStatus}`
      : `View details for ${training.moduleName}, status ${training.trainingStatus}`,
  };
}

// DetailPanel-shaped schema (see component/training-batch/components/DetailPanel.jsx)
// for the full click-through training detail view. Operates on an
// already-normalized record (see normalizeTrainingRecord above).
export const TRAINING_DETAIL_SECTIONS = [
  {
    key: "training",
    title: "Training",
    fields: [
      { key: "moduleName", label: "Module" },
      { key: "areaName", label: "Area" },
      { key: "subAreaName", label: "Sub Area" },
      { key: "courseLevel", label: "Level" },
      { key: "trainingStatus", label: "Status", render: (raw) => <StatusPill status={raw} /> },
      { key: "batch", label: "Batch" },
      { key: "trainingQuarter", label: "Training Quarter" },
      // Trainer/Duration/Mode/Batch/Seats/Reviewed By/Remarks below are
      // ALSO shown on the card face itself (toEntityCardProps' metaFields
      // below — exact content parity with the original card, per review)
      // — restating them here too is consistent with Module/Area/Status/
      // Start Date above, which have always appeared in both places; a
      // details view is a fuller restatement, not exclusively the delta
      // the card doesn't show. Only Level/End Date/Nominated By are
      // genuinely details-only (never added to the card face). `render(raw,
      // data)` gets the whole normalized record (DetailPanel.jsx), so
      // Seats can combine batchSize with the sibling seatsUsed field it
      // isn't keyed on.
      { key: "trainer", label: "Trainer" },
      { key: "duration", label: "Duration" },
      { key: "trainingMode", label: "Mode" },
      {
        key: "batchSize",
        label: "Seats",
        render: (raw, data) => (
          <span className="block truncate text-gray-900 dark:text-gray-100">{`${data.seatsUsed ?? 0} / ${raw} Seats`}</span>
        ),
      },
      { key: "startDate", label: "Start Date", format: formatDate },
      { key: "endDate", label: "End Date", format: formatDate },
      { key: "nominatedBy", label: "Nominated By" },
      // Also moved here from the card face — only ever populated post-
      // review, same conditional-in-effect behavior as before (DetailPanel
      // already omits any field whose value is null/undefined/"").
      { key: "reviewedByName", label: "Reviewed By" },
      { key: "statusRemarks", label: "Remarks" },
    ],
  },
  {
    key: "feedback",
    title: "Comments",
    fields: [
      { key: "employeeComment", label: "Employee" },
      { key: "managerComment", label: "Manager" },
      { key: "departmentComment", label: "Department" },
    ],
  },
];
