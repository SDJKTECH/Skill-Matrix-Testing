/**
 * Combines a fresh list from the server with changes made on screen that the
 * server has not confirmed yet. A batch in `touchedById` keeps its on-screen
 * version until its time limit ends, so a slow, older reply cannot undo it.
 *
 * @template {{batch_id: number|string}} T
 * @param {T[]} freshList - loadBatches' latest full snapshot
 * @param {Map<number|string, number>} touchedById - id -> grace-period expiry (Date.now() ms)
 * @param {number} now - Date.now() at merge time (passed in for testability)
 * @returns {T[]}
 */
export function mergeBatchesWithLocalOptimism(freshList, localList, touchedById, now = Date.now()) {
  const localById = new Map(localList.map((b) => [b.batch_id, b]));
  const freshIds = new Set(freshList.map((b) => b.batch_id));

  const isProtected = (id) => {
    const expiry = touchedById.get(id);
    return typeof expiry === "number" && expiry > now;
  };

  const merged = freshList
    // A batch deleted on screen but still in an older server list: keep it
    // hidden until its time limit ends.
    .filter((fresh) => !(isProtected(fresh.batch_id) && !localById.has(fresh.batch_id)))
    // A batch changed on screen keeps its on-screen version (not the older
    // one from the server) until its time limit ends.
    .map((fresh) => (isProtected(fresh.batch_id) ? localById.get(fresh.batch_id) || fresh : fresh));

  // Batches only the screen has: a new batch with a "temp-" id (always kept),
  // or a just-added batch the server list does not show yet (kept until its
  // time limit ends).
  const localOnly = localList.filter((b) => {
    if (freshIds.has(b.batch_id)) return false;
    return typeof b.batch_id !== "number" || isProtected(b.batch_id);
  });

  return [...merged, ...localOnly];
}
