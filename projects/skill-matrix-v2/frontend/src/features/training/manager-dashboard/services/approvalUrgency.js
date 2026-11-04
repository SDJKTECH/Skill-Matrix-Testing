/** Waiting-time / urgency helpers for pending approval requests. */

export function getWaitingDays(requestedAt) {
  if (!requestedAt) return 0;
  const parsed = new Date(requestedAt);
  if (Number.isNaN(parsed.getTime())) return 0;
  const diffMs = Date.now() - parsed.getTime();
  return Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
}

export function formatOldestPendingLabel(waitingDays) {
  if (waitingDays == null || waitingDays < 0) return null;
  if (waitingDays === 0) return "oldest pending: today";
  if (waitingDays === 1) return "oldest pending: 1 day";
  return `oldest pending: ${waitingDays} days`;
}

export function formatWaitingLabel(requestedAt) {
  const days = getWaitingDays(requestedAt);
  if (days === 0) return "New today";
  if (days === 1) return "Waiting 1 day";
  return `Waiting ${days} days`;
}

/** Longest-waiting first. */
export function sortRequestsByUrgency(requests) {
  return [...requests].sort((a, b) => getWaitingDays(b.requestedAt) - getWaitingDays(a.requestedAt));
}

export function getOldestWaitingDays(requests) {
  if (!requests?.length) return null;
  return requests.reduce((max, request) => Math.max(max, getWaitingDays(request.requestedAt)), 0);
}
