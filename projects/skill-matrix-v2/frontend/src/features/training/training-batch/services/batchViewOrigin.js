import { BATCH_ACTIONS } from "./batchActions";

// Which page opened the Training Batch page. Scope decides which batches
// show; origin decides which buttons show.
export const BATCH_VIEW_ORIGIN = {
  // Opened from the sidebar, or by a link with no origin: role rules only.
  DIRECT: "direct",
  // Opened from the Manager Dashboard: the manager came to review requests,
  // so edit/create buttons are hidden. Approve/Reject still works.
  MANAGER_DASHBOARD: "manager-dashboard",
};

// Actions hidden for each origin, on top of the role rules. To add a new
// origin, add it here. Origins not listed (DIRECT) use role rules only.
const ORIGIN_HIDDEN_ACTIONS = {
  [BATCH_VIEW_ORIGIN.MANAGER_DASHBOARD]: new Set([
    BATCH_ACTIONS.CREATE_BATCH,
    BATCH_ACTIONS.EDIT_BATCH,
    BATCH_ACTIONS.DELETE_BATCH,
    BATCH_ACTIONS.ADD_ENROLLMENT,
    BATCH_ACTIONS.EDIT_ENROLLMENT,
    BATCH_ACTIONS.DELETE_ENROLLMENT,
  ]),
};

export function isActionHiddenForOrigin(origin, action) {
  return ORIGIN_HIDDEN_ACTIONS[origin]?.has(action) ?? false;
}

// Used for the "View Only" label. An origin that hides nothing does not make
// a full-access user "View Only".
export function hasOriginRestrictions(origin) {
  return (ORIGIN_HIDDEN_ACTIONS[origin]?.size ?? 0) > 0;
}
