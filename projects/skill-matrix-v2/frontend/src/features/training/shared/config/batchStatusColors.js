// Color for each batch status. Keys are the status names in lowercase.
// Only the color is set here; the status text always comes from the backend.
// If the backend adds or renames a status, add it here too, or it shows gray.
export const BATCH_STATUS_COLORS = {
  planned: "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-300 dark:bg-slate-700/60 dark:text-slate-300 dark:ring-slate-500",
  open: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  "in progress": "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  archived: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
};

// A batch is "open for enrollment" only when its status is exactly "Open".
// Use this one function everywhere, so all pages count open batches the same.
export function isBatchOpenForEnrollment(batch) {
  const status = String(batch?.batch_status ?? batch?.batchStatus ?? "").trim().toLowerCase();
  if (status !== "open") return false;
  const seatsAvailable = batch?.seats_available ?? batch?.seatsAvailable ?? null;
  return seatsAvailable == null || Number(seatsAvailable) > 0;
}
