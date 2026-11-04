// Split out of pendingRequests.js — that file collects/loads pending
// approval requests; this one formats the outcome copy for bulk actions
// taken on them. Different concern (UI-text generation vs. data
// collection), so a file named "pendingRequests" shouldn't be where a
// future developer has to look for toast wording.
//
// Shared partial-failure toast copy for bulk approve/reject — both
// ManagerApprovalsContext.jsx (Manage Training Batch's inline approve/
// reject path, shared/InlineDecisionPanel.jsx) and useTrainingBatchGroups.js
// (the "By Training" view's quick approve/reject) call
// reviewTrainingNominations and both need to surface the same "N of M
// failed" message consistently (SRP: this is the one place that decides
// the wording; toast display itself stays with each caller, which already
// owns its own toast/UI layer — this file is pure data, no toast import
// here). Returns null when there's nothing to report, so callers can do
// `const msg = formatPartialFailureMessage(...); if (msg) toast.error(msg);`
// without their own extra branching.
export function formatPartialFailureMessage(failures, totalCount, action = "process") {
  if (!failures || failures.length === 0) return null;
  const succeededCount = totalCount - failures.length;
  const verb = action === "approve" ? "approved" : action === "reject" ? "rejected" : action;
  if (failures.length === totalCount) {
    return totalCount === 1
      ? `Could not ${action} — ${failures[0].error}`
      : `Could not ${verb} any of the ${totalCount} selected requests — ${failures[0].error}`;
  }
  return `${succeededCount} of ${totalCount} ${verb} — ${failures.length} failed: ${failures[0].error}`;
}
