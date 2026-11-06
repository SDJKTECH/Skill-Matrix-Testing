// Every DB `employee.role` value (role_enum in database/ddl_v2.sql), named
// once so a future role-specific access list can reference ROLES.USER
// instead of a magic string. "User" and "Manager" have no dedicated access
// list of their own today — no feature currently needs to single either out
// — but they're first-class values here, not an implicit "everyone else"
// case. To customize what one of them can do, add a new
// `export const X_ACCESS_ROLES = [...]` + `hasXAccess(role)` pair below,
// same shape as FULL_ACCESS_ROLES/WEBHOOK_ACCESS_ROLES.
export const ROLES = {
  ADMIN: "admin",
  DEPT: "dept",
  HR: "hr",
  MANAGER: "manager",
  USER: "user",
};

// Single source of truth for "which employee.role values get full,
// hierarchy-independent write access" — copied straight from the real
// backend gate these actions actually hit (check_role_authorization in
// backend/data/addTraining_v2/service.py: role.lower() in ['dept',
// 'department','admin','hr']). Originally lived only in
// training-batch/batchPermissions.js; promoted here once
// ManagerApprovalsContext.jsx needed the exact same list — a manager-role
// role isn't a synonym for "has direct reports" (user.isManager, a pure
// org-chart flag — see AuthContext.jsx's own comment: "True if any
// employee has this employee as their manager_id"), so gating
// approve/reject visibility on isManager alone silently excluded an
// admin/dept/hr user with no direct reports from ever seeing it, even
// though the backend already lets them act on anyone's request regardless
// of hierarchy position.
//
// Also gates whether the Update/Admin-Dashboard tab is reachable at all
// (component/MainComponent.jsx's canSeeUpdateTab, component/Sidebar.jsx's
// canSeeAdminAndReports) — those used to run a separate, narrower list
// missing "hr" (product decision: HR should reach the tab, matching its
// write access everywhere else) — consolidated into this one list rather
// than kept as two constants with identical values. Only the 3 real
// role_enum values — `employee.role` is a Postgres enum column (see
// database/ddl_v2.sql), so a "department" (full-word) spelling can never
// occur in real data; no defensive alt-spelling needed.
export const FULL_ACCESS_ROLES = [ROLES.ADMIN, ROLES.DEPT, ROLES.HR];

/** role: the DB `employee.role` string (any casing) or null/undefined. */
export function hasFullAccessRole(role) {
  return FULL_ACCESS_ROLES.includes((role || "").toLowerCase());
}

// Roles allowed to configure webhook/event-subscription URLs (Manage
// Webhooks, gates component/MainComponent.jsx's Manage Webhooks tab and
// AdminConsoleWebhooks.jsx itself). Deliberately narrower than
// FULL_ACCESS_ROLES: this is system/integration config (external data
// delivery), a different risk class than day-to-day training/skill/cert
// data — HR doesn't need it for their actual job. Product decision.
export const WEBHOOK_ACCESS_ROLES = [ROLES.ADMIN, ROLES.DEPT];

/** role: the DB `employee.role` string (any casing) or null/undefined. */
export function hasWebhookAccess(role) {
  return WEBHOOK_ACCESS_ROLES.includes((role || "").toLowerCase());
}

// Roles allowed to switch Manager Dashboard into org-wide scope ("View
// Entire Organization" — gates both the toggle's visibility and Manager
// Dashboard's own reachability for someone who isn't an org-chart manager,
// see HomeScreen.jsx/SelfDashboard.jsx). Admin only — narrower than
// FULL_ACCESS_ROLES (Dept/HR don't get this): seeing every employee's data
// at once, not just their own team, is a materially bigger blast radius
// than the day-to-day training/skill/cert write access FULL_ACCESS_ROLES
// already covers. Product decision, same shape as WEBHOOK_ACCESS_ROLES
// above for the same reason (a feature-specific list narrower than the
// general "full access" one).
export const ORG_WIDE_VIEW_ROLES = [ROLES.ADMIN];

/** role: the DB `employee.role` string (any casing) or null/undefined. */
export function hasOrgWideViewAccess(role) {
  return ORG_WIDE_VIEW_ROLES.includes((role || "").toLowerCase());
}

// Roles that get the Learning Center (employee-facing training/learning
// content). Employee roles only — "user" and "manager"; admin/dept/hr are
// administrative roles that manage training elsewhere (Update tab), so they
// don't get this entry. Product decision, same shape as WEBHOOK_ACCESS_ROLES.
export const EMPLOYEE_ACCESS_ROLES = [ROLES.USER, ROLES.MANAGER];

/** role: the DB `employee.role` string (any casing) or null/undefined. */
export function hasEmployeeAccess(role) {
  return EMPLOYEE_ACCESS_ROLES.includes((role || "").toLowerCase());
}

/** The logged-in user's DB employee id, wherever it happens to live on the
 * auth object — was 9 independent copies of this exact fallback chain
 * across training-batch/manager-dashboard, feeding self/ownership checks
 * (nominator identity, "own record only" enrollment visibility, approval
 * reviewer id). */
export function getCurrentEmployeeId(user) {
  return user?.dbEmployeeId ?? user?.employeeId;
}
