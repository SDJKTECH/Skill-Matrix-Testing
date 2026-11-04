import axios from "axios";
import { BASE_URL } from "../config/apiConfig";

/**
 * POST get_combined_hierarchy_v2 — fetches a manager's whole team tree in
 * one call. Hierarchy drill-down into a sub-manager's team is handled
 * entirely client-side instead — see useTeamHierarchyView.js's
 * loadDrillRoot, which looks up the sub-manager's node (via
 * hierarchyUtils.js's findNodeById) inside the tree this function already
 * returned, rather than re-fetching.
 *
 * `root: "organization"` (Admin "View Entire Organization") re-roots the
 * whole tree at the actual top of the org instead of `employeeId` —
 * resolved DYNAMICALLY server-side (`resolve_org_root_id` in main.py), not
 * a hardcoded id here, so this keeps working with zero frontend changes
 * whenever the real org root changes. `employeeId` is ignored by the
 * backend when this is set, but still accepted as a param here so a
 * caller doesn't have to conditionally omit it. Named `root`, not `scope`
 * — this codebase already has an unrelated `scope` concept (Direct
 * Reports vs Entire Team, see ManagerDashboard.jsx's own `scope` state);
 * this flag is a different axis (which employee roots the WHOLE tree),
 * not how much of it to include.
 */
export async function fetchCombinedHierarchy(employeeId, { root } = {}) {
  const body = root === "organization" ? { root: "organization" } : { employeeId };
  const response = await axios.post(`${BASE_URL}get_combined_hierarchy_v2`, body, {
    headers: { "Content-Type": "application/json" },
  });
  return response.data;
}
