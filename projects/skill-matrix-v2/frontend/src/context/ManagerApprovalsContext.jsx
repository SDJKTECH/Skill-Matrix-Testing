import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useAuth } from "../hooks/useAuth";
import { fetchCombinedHierarchy } from "../helper/hierarchyApi";
import { reviewTrainingNominations } from "../helper/addTrainingV2Api";
import { applyTrainingReviewResults } from "../features/training/manager-dashboard/services/hierarchyPatching";
import {
  buildPendingCountByBatchNum,
  collectManagerApprovalRequests,
} from "../features/training/manager-dashboard/services/pendingRequests";
import { formatPartialFailureMessage } from "../features/training/manager-dashboard/services/approvalOutcomeMessages";
import { useApprovalGracePeriod } from "../features/training/manager-dashboard/hooks/useApprovalGracePeriod";
import {
  getOldestWaitingDays,
  sortRequestsByUrgency,
} from "../features/training/manager-dashboard/services/approvalUrgency";
import { hasFullAccessRole, hasOrgWideViewAccess, getCurrentEmployeeId } from "../helper/accessRoles";

const ManagerApprovalsContext = createContext(null);

// The training_status value that means "awaiting manager review".
const PENDING_APPROVAL_STATUS = "Pending Approval";

// eslint-disable-next-line react-refresh/only-export-components
export function useManagerApprovals() {
  const context = useContext(ManagerApprovalsContext);
  if (!context) {
    throw new Error("useManagerApprovals must be used within ManagerApprovalsProvider");
  }
  return context;
}

/**
 * Keeps all pending approval requests in one place. Used by the Manager
 * Dashboard count, the Training Batch banners and the approve/reject Undo.
 */
export function ManagerApprovalsProvider({ children }) {
  const { user } = useAuth();
  const [hierarchyData, setHierarchyDataState] = useState(null);
  const [requests, setRequests] = useState([]);
  const reviewedListenersRef = React.useRef(new Set());
  // Admin's "View Entire Organization" switch. It is kept here (not in
  // HomeScreen) because this file loads the team data. Two copies could
  // load the wrong data.
  const [orgWideView, setOrgWideView] = useState(false);
  const [orgWideApprovals, setOrgWideApprovalsState] = useState(false);

  const setHierarchyData = useCallback((data) => {
    setHierarchyDataState(data || null);
  }, []);

  // When the admin leaves org view, remove that data so other pages do not show it.
  const setOrgWideApprovals = useCallback((on) => {
    setOrgWideApprovalsState(on);
    if (!on) setHierarchyDataState(null);
  }, []);

  const subscribeReviewed = useCallback((listener) => {
    reviewedListenersRef.current.add(listener);
    return () => reviewedListenersRef.current.delete(listener);
  }, []);

  const empIdNum = getCurrentEmployeeId(user);
  const numericId = useMemo(() => {
    const parsed = typeof empIdNum === "string" ? parseInt(empIdNum, 10) : Number(empIdNum);
    return empIdNum == null || Number.isNaN(parsed) ? null : parsed;
  }, [empIdNum]);

  // Who can approve or reject requests: managers (people with direct reports)
  // and admin/dept/hr users, because the backend lets them review any request.
  const canManageApprovals = Boolean(user?.isManager) || hasFullAccessRole(user?.role);

  // Team data loads when the page opens, and again after this user approves
  // or rejects (no auto-refresh). hierarchyRequestIdRef ignores old replies
  // that come late. Only Admins can load the whole organization's data.
  const canViewOrgWide = hasOrgWideViewAccess(user?.role);
  const hierarchyRequestIdRef = useRef(0);
  const refetchHierarchy = useCallback(async () => {
    const useOrgRoot = (orgWideView || orgWideApprovals) && canViewOrgWide;
    if (!useOrgRoot && (!canManageApprovals || numericId == null)) return;
    const requestId = ++hierarchyRequestIdRef.current;
    try {
      const data = useOrgRoot
        ? await fetchCombinedHierarchy(null, { root: "organization" })
        : await fetchCombinedHierarchy(numericId);
      if (hierarchyRequestIdRef.current === requestId) setHierarchyDataState(data);
    } catch {
      // If this reload fails, do not show an error. The screen keeps showing
      // the last data that loaded fine.
    }
  }, [canManageApprovals, numericId, orgWideView, orgWideApprovals, canViewOrgWide]);

  // If an add/edit/delete elsewhere changes a pending request, reload the team
  // data so the pending counts stay correct.
  const refreshPendingApprovalsIfAffected = useCallback((statuses) => {
    if (statuses.includes(PENDING_APPROVAL_STATUS)) refetchHierarchy().catch(() => {});
  }, [refetchHierarchy]);

  useEffect(() => {
    refetchHierarchy();
  }, [refetchHierarchy]);

  useEffect(() => {
    if (!hierarchyData) {
      setRequests([]);
      return;
    }
    // An Admin in org-wide view sees all requests ("all"). Everyone else sees
    // only requests from their direct reports ("direct"), even though the
    // backend lets any admin/dept/hr approve any request.
    setRequests(collectManagerApprovalRequests(hierarchyData, orgWideApprovals && canViewOrgWide ? "all" : "direct"));
  }, [hierarchyData, orgWideApprovals, canViewOrgWide]);

  const applyReviewed = useCallback((reviewedPayload) => {
    setHierarchyDataState((current) => applyTrainingReviewResults(current, reviewedPayload));
    for (const listener of reviewedListenersRef.current) {
      try {
        listener(reviewedPayload);
      } catch (error) {
        console.error("ManagerApprovals reviewed listener failed:", error);
      }
    }
  }, []);

  // The logged-in user is the reviewer. The backend checks this user's role.
  const reviewerAdminId = getCurrentEmployeeId(user);
  const reviewerName = user?.displayName;

  const finalizeApprove = useCallback(
    async (ids, note = null) => {
      if (ids.length > 0) {
        const response = await reviewTrainingNominations({
          ids,
          action: "approve",
          reason: note,
          adminId: reviewerAdminId,
          reviewerName,
        });
        applyReviewed(response);
        // Get fresh data from the server. If this fails, we do not show it as an
        // approve error.
        refetchHierarchy().catch(() => {});
        // In a bulk approve, some requests can fail (for example, if someone else
        // changed them). Tell the user which ones failed.
        const failureMsg = formatPartialFailureMessage(response.failures, ids.length, "approve");
        if (failureMsg) toast.error(failureMsg);
      }
    },
    [applyReviewed, reviewerAdminId, reviewerName, refetchHierarchy]
  );

  const finalizeReject = useCallback(
    async (ids, reason = null) => {
      if (ids.length > 0) {
        const response = await reviewTrainingNominations({
          ids,
          action: "reject",
          reason,
          adminId: reviewerAdminId,
          reviewerName,
        });
        applyReviewed(response);
        refetchHierarchy().catch(() => {});
        const failureMsg = formatPartialFailureMessage(response.failures, ids.length, "reject");
        if (failureMsg) toast.error(failureMsg);
      }
    },
    [applyReviewed, reviewerAdminId, reviewerName, refetchHierarchy]
  );

  const {
    graceById,
    scheduleDecision,
    undoBatch,
    isInGrace,
    getGraceDecision,
    getGraceBatchId,
    isFinalizing,
  } = useApprovalGracePeriod({
    onFinalizeApprove: finalizeApprove,
    onFinalizeReject: finalizeReject,
  });

  const activeRequests = requests;

  const actionableRequests = useMemo(
    () => activeRequests.filter((request) => !isInGrace(request.id)),
    [activeRequests, graceById, isInGrace]
  );

  const pendingCountByBatchNum = useMemo(
    () => buildPendingCountByBatchNum(actionableRequests),
    [actionableRequests]
  );

  const getPendingCountForBatch = useCallback(
    (batchNum) => pendingCountByBatchNum.get(String(batchNum)) || 0,
    [pendingCountByBatchNum]
  );

  const getRequestsForBatch = useCallback(
    (batchNum) =>
      sortRequestsByUrgency(
        activeRequests.filter((request) => String(request.batchNum) === String(batchNum))
      ),
    [activeRequests]
  );

  const getOldestWaitingDaysForBatch = useCallback(
    (batchNum) => {
      const batchRequests = actionableRequests.filter(
        (request) => String(request.batchNum) === String(batchNum)
      );
      return getOldestWaitingDays(batchRequests);
    },
    [actionableRequests]
  );

  const totalPendingCount = useMemo(() => {
    let total = 0;
    for (const count of pendingCountByBatchNum.values()) total += count;
    return total;
  }, [pendingCountByBatchNum]);

  // The user can close the alert banner. It comes back only when a new request
  // arrives. Kept here so it stays closed when switching Self/Manager view.
  const [alertBannerDismissed, setAlertBannerDismissed] = useState(false);
  const dismissedAtCountRef = useRef(null);
  useEffect(() => {
    if (alertBannerDismissed && dismissedAtCountRef.current != null && totalPendingCount > dismissedAtCountRef.current) {
      setAlertBannerDismissed(false);
    }
  }, [totalPendingCount, alertBannerDismissed]);
  const dismissAlertBanner = useCallback(() => {
    dismissedAtCountRef.current = totalPendingCount;
    setAlertBannerDismissed(true);
  }, [totalPendingCount]);

  const batchesWithPendingCount = useMemo(() => {
    let count = 0;
    for (const value of pendingCountByBatchNum.values()) {
      if (value > 0) count += 1;
    }
    return count;
  }, [pendingCountByBatchNum]);

  const scheduleApprove = useCallback(
    (ids, employeeName = null, options = {}) => {
      scheduleDecision({
        ids,
        decision: "approved",
        reason: options.note ?? null,
        employeeName,
        graceMs: options.graceMs,
      });
    },
    [scheduleDecision]
  );

  const scheduleReject = useCallback(
    (ids, reason = null, employeeName = null, options = {}) => {
      scheduleDecision({
        ids,
        decision: "rejected",
        reason,
        employeeName,
        graceMs: options.graceMs,
      });
    },
    [scheduleDecision]
  );

  // All values this context shares. The useMemo list below is made from this
  // object, so a new value is never missed.
  const rawValues = {
    hierarchyData,
    setHierarchyData,
    refreshPendingApprovalsIfAffected,
    requests: activeRequests,
    actionableRequests,
    applyReviewed,
    subscribeReviewed,
    pendingCountByBatchNum,
    getPendingCountForBatch,
    getRequestsForBatch,
    getOldestWaitingDaysForBatch,
    totalPendingCount,
    batchesWithPendingCount,
    scheduleApprove,
    scheduleReject,
    undoBatch,
    isInGrace,
    getGraceDecision,
    getGraceBatchId,
    isFinalizing,
    alertBannerDismissed,
    dismissAlertBanner,
    isManager: Boolean(user?.isManager),
    canManageApprovals,
    orgWideView,
    setOrgWideView,
    setOrgWideApprovals,
    canViewOrgWide,
  };
  const value = useMemo(
    () => rawValues,
    // The list is Object.values(rawValues). The lint rule cannot check this,
    // so it is turned off for this one line.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    Object.values(rawValues)
  );

  return <ManagerApprovalsContext.Provider value={value}>{children}</ManagerApprovalsContext.Provider>;
}
