// Live-batch helper for the nomination catalog — "New" ribbon timing from
// real backend timestamps (created_at / updated_at on training_batches).

const NEW_BATCH_WINDOW_DAYS = 14;

function toDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** A live batch counts as "New" if it was created or updated within the last 14 days. */
export function isNewBatch(batch) {
  const sourceDate = batch?.updatedAt || batch?.updated_at || batch?.createdAt || batch?.created_at || batch?.postedDate;
  const timestamp = toDate(sourceDate);
  if (!timestamp) return false;
  const ageMs = Date.now() - timestamp.getTime();
  return ageMs >= 0 && ageMs <= NEW_BATCH_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}
