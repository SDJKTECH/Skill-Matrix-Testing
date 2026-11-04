import { useCallback, useMemo } from "react";
import { useAuth } from "../../../../hooks/useAuth";
import { useManagerApprovals } from "../../../../context/ManagerApprovalsContext";
import { getCurrentEmployeeId } from "../../../../helper/accessRoles";
import { getDirectReportsFromHierarchy } from "../../../../helper/hierarchyUtils";
import { useBatchPermissions, BATCH_ACTIONS } from "./batchPermissions";

// Users who are not admin/dept/hr see only their own rows and their direct
// reports' rows, not everyone in the batch. This is done only in the
// frontend; the backend still sends all rows.
export function visibleEnrollmentsForRole(enrollments, { canViewAll, currentEmployeeId, teamIds = new Set() }) {
  return canViewAll
    ? enrollments
    : enrollments.filter((e) => Number(e.employee_id) === Number(currentEmployeeId) || teamIds.has(Number(e.employee_id)));
}

export function useVisibleEnrollments() {
  const { user } = useAuth();
  const { hierarchyData } = useManagerApprovals();
  const { can } = useBatchPermissions();
  const canViewAll = can(BATCH_ACTIONS.VIEW_ALL_ENROLLMENTS);
  const currentEmployeeId = getCurrentEmployeeId(user);

  const teamIds = useMemo(() => {
    // Use the team data only if it starts from this user (not an org-wide view).
    if (hierarchyData == null || Number(hierarchyData.id) !== Number(currentEmployeeId)) return new Set();
    return new Set(getDirectReportsFromHierarchy(hierarchyData).map((emp) => Number(emp.id)));
  }, [hierarchyData, currentEmployeeId]);

  const filterVisible = useCallback(
    (enrollments) => visibleEnrollmentsForRole(enrollments, { canViewAll, currentEmployeeId, teamIds }),
    [canViewAll, currentEmployeeId, teamIds]
  );

  return { canViewAll, filterVisible };
}
