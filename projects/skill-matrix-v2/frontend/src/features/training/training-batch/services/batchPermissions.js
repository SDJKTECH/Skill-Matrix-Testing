// Which roles can do which actions on the Training Batch page. Change it here
// only. The roles match the backend check (check_role_authorization):
// dept, department, admin, hr. A hidden action would fail on the backend anyway.
import { useAuth } from "../../../../hooks/useAuth";
import { BATCH_ACTIONS } from "./batchActions";
import { isActionHiddenForOrigin, hasOriginRestrictions } from "./batchViewOrigin";
import { useTrainingBatchOrigin } from "../context/TrainingBatchOriginContext";
import { FULL_ACCESS_ROLES } from "../../../../helper/accessRoles";

// Re-exported so old imports from this file still work.
export { BATCH_ACTIONS };

// Batch and enrollment changes (and seeing all enrollments) need full access.
// Actions not in this list, like ADD_NOTE, are allowed for everyone, because
// every role can add notes.
const ACTION_ALLOWED_ROLES = {
  [BATCH_ACTIONS.CREATE_BATCH]: FULL_ACCESS_ROLES,
  [BATCH_ACTIONS.EDIT_BATCH]: FULL_ACCESS_ROLES,
  [BATCH_ACTIONS.DELETE_BATCH]: FULL_ACCESS_ROLES,
  [BATCH_ACTIONS.ADD_ENROLLMENT]: FULL_ACCESS_ROLES,
  [BATCH_ACTIONS.EDIT_ENROLLMENT]: FULL_ACCESS_ROLES,
  [BATCH_ACTIONS.DELETE_ENROLLMENT]: FULL_ACCESS_ROLES,
  [BATCH_ACTIONS.VIEW_ALL_ENROLLMENTS]: FULL_ACCESS_ROLES,
};

/** role: the DB `employee.role` string (any casing) or null/undefined. */
export function canPerformBatchAction(role, action) {
  const allowed = ACTION_ALLOWED_ROLES[action];
  if (!allowed) return true; // no rule for this action (e.g. ADD_NOTE), so everyone can use it
  return allowed.includes((role || "").toLowerCase());
}

/**
 * Permissions for the logged-in user. Besides the role, the page origin can
 * hide more actions (for example, when opened from the Manager Dashboard).
 * Only the "admin" role ignores the origin; dept/hr do not.
 */
export function useBatchPermissions(originOverride) {
  const { user } = useAuth();
  const role = user?.role;
  const contextOrigin = useTrainingBatchOrigin();
  const origin = originOverride ?? contextOrigin;
  const roleFullAccess = FULL_ACCESS_ROLES.includes((role || "").toLowerCase());
  const isAdmin = (role || "").toLowerCase() === "admin";
  return {
    can: (action) => canPerformBatchAction(role, action) && (isAdmin || !isActionHiddenForOrigin(origin, action)),
    // "Does this user have full access at all?" for labels like "View Only".
    // The page origin can lower it too (except for admin).
    isFullAccess: roleFullAccess && (isAdmin || !hasOriginRestrictions(origin)),
  };
}

// Tooltip text for an action that is turned off.
export const RESTRICTED_ACTION_TITLE = "Only Admin, Department, or HR can do this";
