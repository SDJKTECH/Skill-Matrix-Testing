// CROSS-4/MT-1: the `Map<String(batch_num), batchRow>` construction was
// hand-duplicated 3x (twice in EmployeeTrainingPanel.jsx, once in
// manager-dashboard/hooks/useBatchByNum.js) — this is just that one
// expression, shared. `requireBatchNum` stays a caller-chosen option rather
// than a single unified default: useBatchByNum.js filters out batches with
// no batch_num before building the map, EmployeeTrainingPanel.jsx doesn't —
// a real, pre-existing behavioral difference between the two, preserved
// here rather than silently unified.
export function buildBatchByNumMap(batches, { requireBatchNum = false } = {}) {
  const list = requireBatchNum ? batches.filter((b) => b.batch_num) : batches;
  return new Map(list.map((b) => [String(b.batch_num), b]));
}
