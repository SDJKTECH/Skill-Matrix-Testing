// Home "Open Batches" lists batches this person has never requested.
// personalStatus null means that. "Not Started" means already approved, so it stays off this list.
export function isUnrequestedOpenBatch(item) {
  return item.personalStatus == null;
}

// Nominated or Pending Approval -> pending. Completed -> completed. Anything else, including approved "Not Started", -> notStarted.
export function getOpenBatchStatusKey(personalStatus) {
  const status = String(personalStatus || "").trim().toLowerCase();
  if (status === "nominated" || status === "pending approval") return "pending";
  if (status === "completed") return "completed";
  return "notStarted";
}

// Dot color and label for each status. The label is there so status is not shown by color alone.
export const OPEN_BATCH_STATUS_STYLES = {
  notStarted: { dot: "bg-gray-300 dark:bg-gray-600", text: "text-gray-400 dark:text-gray-500", label: "" },
  pending: { dot: "bg-amber-400", text: "text-amber-600 dark:text-amber-400", label: "Pending" },
  completed: { dot: "bg-green-500", text: "text-green-600 dark:text-green-400", label: "Completed" },
};

// One open-enrollment batch as one Home card row. Area and sub-area become the subtitle.
export function toOpenBatchesCardItem(item) {
  return {
    key: item.batchNum,
    batchNum: item.batchNum,
    name: item.moduleName,
    subtitle: [item.areaName, item.subAreaName].filter(Boolean).join(" · "),
    statusKey: getOpenBatchStatusKey(item.personalStatus),
    isUnrequested: isUnrequestedOpenBatch(item),
    isNew: item.isNew,
    startDate: item.startDate || null,
  };
}

// Not requested, then pending, then completed. Then new batches, then the earliest start date. No date goes last.
const STATUS_SORT_PRIORITY = { notStarted: 0, pending: 1, completed: 2 };

export function sortOpenBatchesCardItems(items) {
  return [...items].sort((a, b) => {
    const rankDiff = (STATUS_SORT_PRIORITY[a.statusKey] ?? 0) - (STATUS_SORT_PRIORITY[b.statusKey] ?? 0);
    if (rankDiff !== 0) return rankDiff;
    if (a.isNew !== b.isNew) return (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0);
    const aTime = new Date(a.startDate || 0).getTime() || Infinity;
    const bTime = new Date(b.startDate || 0).getTime() || Infinity;
    const byStart = aTime - bTime;
    if (byStart) return byStart;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
}
