import { isBatchOpenForEnrollment } from "../../shared/config/batchStatusColors";
import { isNewBatch } from "./batchNewIndicator";

/**
 * Count batches currently open for enrollment (batch_status Open + seats).
 * Shared by SelfDashboard and EmployeeTrainingPanel bell badge.
 *
 * @param {object[]} batches - fetchBatches().results
 */
export function countOpenEnrollmentBatches(batches) {
  return (batches || []).filter(isBatchOpenForEnrollment).length;
}

/**
 * Single source of truth for "how many open-for-enrollment batches are new
 * AND not yet requested by this employee" — the same definition
 * EmployeeTrainingPanel.jsx's notification-bell badge already uses (isNew
 * AND no existing request for that batch), extracted so a second consumer
 * (SelfDashboard.jsx's Home quick action) can show the identical number
 * instead of a second, hand-rolled count that could quietly drift out of
 * sync with what the bell says once you actually get to My Trainings.
 *
 * @param {object[]} batches - fetchBatches().results
 * @param {object[]} myTrainings - this employee's own trainings (fetchTrainings({employee_id}).results)
 */
export function countNewOpenEnrollmentBatches(batches, myTrainings) {
  const requestedBatchNums = new Set(
    (myTrainings || [])
      .map((t) => t.batch || t.batch_num || t.batchNum)
      .filter(Boolean)
      .map(String)
  );
  return (batches || [])
    .filter(isBatchOpenForEnrollment)
    .filter((b) => isNewBatch(b) && !requestedBatchNums.has(String(b.batchNum || b.batch_num)))
    .length;
}
