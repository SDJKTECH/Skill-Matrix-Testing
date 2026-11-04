// MD-7 split (2026-08-19): post-review hierarchy patching, formerly one of 5
// mixed concerns in managerDashboardData.js — see pendingRequests.js and
// teamGrouping.js for the other two. This file owns applying a
// reviewTrainingNominations result back onto a client-held hierarchy
// snapshot in place, so approve/reject reflects instantly without waiting
// for the next full refetch.

import { normalizeBatchNum } from "./pendingRequests";

function patchTrainingNode(training, update) {
  if (!training || typeof training !== "object") return training;
  const matchesId = update.id != null && String(training.employeeTrainingId ?? training.employee_training_id ?? training.id) === String(update.id);
  const matchesBatch = update.batchNum && String(normalizeBatchNum(training)) === String(update.batchNum);
  if (!matchesId && !matchesBatch) return training;
  return {
    ...training,
    trainingStatus: update.trainingStatus ?? training.trainingStatus,
    training_status: update.trainingStatus ?? training.training_status,
    reviewedBy: update.reviewedBy ?? training.reviewedBy ?? null,
    reviewed_by: update.reviewedBy ?? training.reviewed_by ?? null,
    reviewedByName: update.reviewedByName ?? training.reviewedByName ?? null,
    reviewed_by_name: update.reviewedByName ?? training.reviewed_by_name ?? null,
    reviewedAt: update.reviewedAt ?? training.reviewedAt ?? null,
    reviewed_at: update.reviewedAt ?? training.reviewed_at ?? null,
    reviewReason: update.reviewReason ?? training.reviewReason ?? null,
    review_reason: update.reviewReason ?? training.review_reason ?? null,
  };
}

function patchEmployeeNode(node, update) {
  if (!node || typeof node !== "object") return node;
  const patchedTrainings = (node.trainings?.trainingArray || []).map((training) => patchTrainingNode(training, update));
  const patchedAssociates = Object.fromEntries(
    Object.entries(node.associates || {}).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.map((child) => patchEmployeeNode(child, update)) : value,
    ])
  );
  return {
    ...node,
    trainings: node.trainings ? { ...node.trainings, trainingArray: patchedTrainings } : node.trainings,
    associates: node.associates ? patchedAssociates : node.associates,
  };
}

export function applyTrainingReviewResults(hierarchyData, reviewedResults) {
  if (!hierarchyData || !reviewedResults) return hierarchyData;
  const list = Array.isArray(reviewedResults) ? reviewedResults : reviewedResults.results || [reviewedResults];
  return list.reduce((current, result) => {
    const update = {
      id: result.employee_training_id ?? result.employeeTrainingId ?? result.id,
      batchNum: result.batch_num ?? result.batchNum ?? null,
      trainingStatus: result.training_status ?? result.trainingStatus ?? null,
      reviewedBy: result.reviewed_by ?? result.reviewedBy ?? null,
      reviewedByName: result.reviewed_by_name ?? result.reviewedByName ?? null,
      reviewedAt: result.reviewed_at ?? result.reviewedAt ?? null,
      reviewReason: result.review_reason ?? result.reviewReason ?? null,
    };
    return patchEmployeeNode(current, update);
  }, hierarchyData);
}
