// MD-7 split (2026-08-19): pending-approval-request collection, formerly one
// of 5 mixed concerns in managerDashboardData.js — see hierarchyPatching.js
// and teamGrouping.js for the other two. This file owns: deriving the
// pending-request list from a hierarchy snapshot, the mock-volume-data merge
// wrapper around that, per-batch pending counts, and the shared "N of M
// failed" toast wording for approve/reject outcomes on those requests.

import { getScopedTeamFromHierarchy } from "../../../../helper/hierarchyUtils";
import { getNotCompletedTrainings } from "../../shared/config/trainingRecordAdapter";

function trainingStatusValue(training) {
  return training?.trainingStatus ?? training?.training_status ?? null;
}

function isPendingApproval(trainingStatus) {
  return String(trainingStatus || "").trim().toLowerCase() === "pending approval";
}

// Exported: also used by hierarchyPatching.js's patchTrainingNode to match a
// review result back to the training record it applies to.
export function normalizeBatchNum(training) {
  return training?.batch || training?.batch_num || training?.batchNum || null;
}

function normalizeDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function teamForScope(hierarchyData, scope = "direct") {
  return getScopedTeamFromHierarchy(hierarchyData, scope);
}

export function collectPendingTrainingRequests(hierarchyData, scope = "direct") {
  return teamForScope(hierarchyData, scope).flatMap((employee) => {
    const trainings = employee?.trainings?.trainingArray || [];
    const pending = trainings.filter((training) => isPendingApproval(trainingStatusValue(training)));
    if (pending.length === 0) return [];
    // Nominee's "Not Completed" trainings + reasons (status_remarks), shown
    // beside each pending request so the manager decides with context.
    const notCompletedTrainings = getNotCompletedTrainings(trainings);
    const attendedCount = trainings.filter((training) => !isPendingApproval(trainingStatusValue(training))).length;
    return pending
      .map((training) => ({
        id: training.employeeTrainingId ?? training.employee_training_id ?? training.id,
        employeeId: employee.id,
        employeeName: employee.name || "Unknown",
        employeeRole: employee.role || "Employee",
        managerGroup: employee.managerGroup || "Direct report",
        batchNum: normalizeBatchNum(training),
        moduleName: training.moduleName || training.module_name || "Training",
        areaName: training.areaName || training.area_name || null,
        trainingStatus: trainingStatusValue(training),
        // The nominee's optional note (UX doc §6) — same field the
        // approve/reject reason writes into (status_remarks), just read
        // back before a decision overwrites it. Real, live field —
        // get_combined_hierarchy_v2 has returned status_remarks since the
        // P0 status-chip drill-down work.
        note: training.statusRemarks || training.status_remarks || null,
        // "Self nomination" or a real name (see addTraining_v2/main.py's
        // insert) — get_combined_hierarchy_v2 has returned nominatedBy
        // since before this field was ever surfaced on this page; a
        // manager reviewing a pending request couldn't previously tell a
        // self-nomination apart from one an admin/L&D added on the
        // employee's behalf.
        nominatedBy: training.nominatedBy || training.nominated_by || null,
        requestedAt: normalizeDate(training.createdAt || training.created_at || training.updatedAt || training.updated_at),
        reviewedBy: training.reviewedBy ?? training.reviewed_by ?? null,
        reviewedByName: training.reviewedByName || training.reviewed_by_name || null,
        reviewedAt: normalizeDate(training.reviewedAt || training.reviewed_at),
        reviewReason: training.reviewReason || training.review_reason || null,
        notCompletedTrainings,
        attendedCount,
      }));
  });
}

/**
 * Pending approval requests used by the shared ManagerApprovalsContext.
 */
export function collectManagerApprovalRequests(hierarchyData, scope = "direct") {
  return collectPendingTrainingRequests(hierarchyData, scope);
}

// formatPartialFailureMessage moved to ./approvalOutcomeMessages.js — a
// different concern (bulk-action toast copy) than what this file's name
// says it owns.

/** Count pending approvals per batch_num (shared by Batch Table banners + Manager Dashboard badge). */
export function buildPendingCountByBatchNum(requests, { excludeIds = new Set() } = {}) {
  const map = new Map();
  for (const request of requests) {
    if (excludeIds.has(String(request.id))) continue;
    const batchNum = request?.batchNum;
    if (batchNum == null || batchNum === "") continue;
    const key = String(batchNum);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}
