// Config-driven By-Employee/By-Training toggle — a new view mode is a new
// entry here, not a scattered `viewMode === "employee" ? ... : ...` check
// at every call site that cares (search placeholder, which filters apply,
// status-chip target). See TeamTrainingStatusCard.jsx for how this drives
// the shell.
export const VIEW_MODE_CONFIG = [
  { key: "employee", label: "By Employee", searchPlaceholder: "Search employees..." },
  { key: "training", label: "By Training", searchPlaceholder: "Search trainings..." },
];
