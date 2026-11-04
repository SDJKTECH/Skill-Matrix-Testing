// Ways another page can open the Training Batch page already filtered.
// BATCH opens one batch row. OWN/TEAM/EMPLOYEE show many batches, with a
// "Scope" tag the user can remove. Add a new scope here.
export const BATCH_SCOPE = {
  BATCH: "batch",
  OWN: "own",
  TEAM: "team",
  EMPLOYEE: "employee",
  // From the Manager Dashboard bell: show batches with pending requests.
  // BatchTable finds which batches have pending requests right now.
  PENDING_APPROVALS: "pending_approvals",
};

// Fixed label for each scope. EMPLOYEE has none; the caller passes the
// person's name.
export const BATCH_SCOPE_LABEL = {
  [BATCH_SCOPE.OWN]: "My Trainings",
  [BATCH_SCOPE.TEAM]: "My Team",
  [BATCH_SCOPE.PENDING_APPROVALS]: "Pending approvals",
};

// Scopes that show a "Scope: X" tag. BATCH shows none (it just opens the row).
export const PILL_SCOPES = new Set([
  BATCH_SCOPE.OWN,
  BATCH_SCOPE.TEAM,
  BATCH_SCOPE.EMPLOYEE,
  BATCH_SCOPE.PENDING_APPROVALS,
]);
