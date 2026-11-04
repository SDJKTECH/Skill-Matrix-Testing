import { useMemo } from "react";
import toast from "react-hot-toast";
import { getTrainingBucketsForScope } from "../services/trainingProgressAggregation";
import { normalizeTrainingRecord, normalizeTrainingList } from "../../shared/config/trainingRecordAdapter";
import { collectPendingTrainingRequests } from "../services/pendingRequests";
import { formatPartialFailureMessage } from "../services/approvalOutcomeMessages";
import { reviewTrainingNominations } from "../../../../helper/addTrainingV2Api";
import { filterGroupsBySearch, filterNomineesByStatusBucket } from "../services/trainingBatchGroupFilters";
import { useAuth } from "../../../../hooks/useAuth";
import { getCurrentEmployeeId } from "../../../../helper/accessRoles";

/**
 * The "By Training" view's data: batch-grouped nominees for the SCOPE-
 * resolved root team (unlike useTeamHierarchyView.js's per-level roster,
 * batch grouping is root/scope-driven — see TeamTrainingStatusCard.jsx's
 * doc comment on why scope and hierarchy drill-down are orthogonal axes).
 * Certifications are deliberately excluded — there is no batch/cohort
 * concept for them anywhere in the schema (verified against
 * backend/aggregations/getCombinedHierarchy_v2/main.py's cert_node
 * construction), so "grouping nominees under a certification" doesn't
 * correspond to anything real; certifications only ever appear in the
 * By-Employee view's per-person card grid.
 *
 * A nominee row exists for two different reasons, merged into one list per
 * batch:
 *   - a REAL enrollment record (reportee.trainings) — has a real
 *     `trainingStatus`, may or may not also have a pending nomination-
 *     approval request against the same batch.
 *   - a PENDING-ONLY live nomination request (employee_trainings row with
 *     training_status = 'Pending Approval') with no real enrollment yet.
 *     These rows are approved/rejected through add_training_v2 and are
 *     surfaced directly from the hierarchy response, not a client-side store.
 * Only nominees with a `pendingRequestId` get Approve/Reject controls —
 * everyone else already has a real, settled status with nothing to
 * approve.
 *
 * @param {object} hierarchyData
 * @param {"direct"|"all"} scope
 * @param {Map} batchByNum - from useBatchByNum.js
 * @param {{search,statusBucket}} filters
 * @param {number} nominationVersion - kept for backward-compatible call sites; live data now drives refreshes directly
 * @param {() => void} bumpNominationVersion
 * @returns {{ groups, approve, reject, approveAll }}
 */
export function useTrainingBatchGroups(hierarchyData, scope, batchByNum, filters, onReviewed) {
  // The manager actually clicking Approve/Reject here — see
  // reviewTrainingNominations's own doc comment for why this (not a
  // generic placeholder) is what's required.
  const { user } = useAuth();
  const reviewerAdminId = getCurrentEmployeeId(user);
  const reviewerName = user?.displayName;

  const { byReportee } = useMemo(() => getTrainingBucketsForScope(hierarchyData, scope), [hierarchyData, scope]);

  const pendingByEmployeeAndBatch = useMemo(() => {
    const map = new Map();
    for (const req of collectPendingTrainingRequests(hierarchyData, scope)) {
      map.set(`${req.employeeId}::${req.batchNum}`, req);
    }
    return map;
  }, [hierarchyData, scope]);

  const groups = useMemo(() => {
    const byBatch = new Map();
    const seenNomineeKeys = new Set();

    const ensureGroup = (batchNum, fallbackModuleName) => {
      const key = String(batchNum);
      if (!byBatch.has(key)) {
        const batchMeta = batchByNum.get(key) || null;
        const normalizedMeta = batchMeta ? normalizeTrainingRecord(batchMeta) : null;
        byBatch.set(key, {
          batchNum: key,
          moduleName: normalizedMeta?.moduleName || fallbackModuleName || "Training",
          areaName: normalizedMeta?.areaName || null,
          batch: batchMeta,
          nominees: [],
        });
      }
      return byBatch.get(key);
    };

    for (const reportee of byReportee) {
      for (const training of normalizeTrainingList(reportee.trainings, batchByNum)) {
        if (!training.batch) continue;
        const group = ensureGroup(training.batch, training.moduleName);
        const pendingReq = pendingByEmployeeAndBatch.get(`${reportee.id}::${training.batch}`);
        group.nominees.push({
          employeeId: reportee.id,
          employeeName: reportee.name,
          trainingStatus: training.trainingStatus,
          pendingRequestId: pendingReq?.id ?? null,
          // "<name>'s team" — same field computeAllReportsTrainingBuckets
          // already resolves via getScopedTeamFromHierarchy (see
          // trainingProgressAggregation.js), not re-derived here.
          managerGroup: reportee.managerGroup || null,
        });
        seenNomineeKeys.add(`${reportee.id}::${training.batch}`);
      }
    }

    // Pending-only nominations with no real enrollment record yet.
    for (const req of pendingByEmployeeAndBatch.values()) {
      const nomineeKey = `${req.employeeId}::${req.batchNum}`;
      if (seenNomineeKeys.has(nomineeKey)) continue;
      const reportee = byReportee.find((r) => String(r.id) === String(req.employeeId));
      if (!reportee) continue;
      const group = ensureGroup(req.batchNum, req.moduleName);
      group.nominees.push({
        employeeId: reportee.id,
        employeeName: reportee.name,
        trainingStatus: null,
        pendingRequestId: req.id,
        managerGroup: reportee.managerGroup || null,
      });
      seenNomineeKeys.add(nomineeKey);
    }

    return [...byBatch.values()];
  }, [byReportee, batchByNum, pendingByEmployeeAndBatch]);

  const filteredGroups = useMemo(() => {
    const bySearch = filterGroupsBySearch(groups, filters.search);
    return bySearch.map((g) => ({ ...g, nominees: filterNomineesByStatusBucket(g.nominees, filters.statusBucket) })).filter((g) => g.nominees.length > 0);
  }, [groups, filters.search, filters.statusBucket]);

  // Same Promise.allSettled-based partial-failure surfacing as
  // ManagerApprovalsContext.jsx's finalizeApprove/finalizeReject — this
  // view calls the same reviewTrainingNominations, so a single-id call can
  // still fail server-side (e.g. someone else already actioned it) and
  // approveAll's bulk call can have mixed outcomes the same way the bulk
  // bar's does.
  const reportOutcome = (response, count, action) => {
    const failureMsg = formatPartialFailureMessage(response.failures, count, action);
    if (failureMsg) toast.error(failureMsg);
    return response;
  };

  const approve = (id) => {
    return reviewTrainingNominations({ ids: id, action: "approve", adminId: reviewerAdminId, reviewerName })
      .then((response) => reportOutcome(response, 1, "approve"))
      .then((response) => onReviewed?.(response));
  };
  // Individual reject here stays a single quick action with no reason
  // capture — managers who need fuller review land on Training Batches
  // via the toolbar bell, where enrollment context is already visible.
  // NOTE: this means the mandatory-reason server-side check (handle_put)
  // is satisfied by reviewTrainingNominations' own generic fallback text
  // ("Rejected via Manager Dashboard"), not a reason this manager actually
  // typed — a known, pre-existing gap in this specific view, not something
  // to silently treat as "reason capture is fully enforced everywhere."
  const reject = (id) => {
    return reviewTrainingNominations({ ids: id, action: "reject", adminId: reviewerAdminId, reviewerName })
      .then((response) => reportOutcome(response, 1, "reject"))
      .then((response) => onReviewed?.(response));
  };
  const approveAll = (batchNum) => {
    const group = groups.find((g) => g.batchNum === String(batchNum));
    const ids = (group?.nominees || []).filter((n) => n.pendingRequestId).map((n) => n.pendingRequestId);
    if (ids.length === 0) return;
    return reviewTrainingNominations({ ids, action: "approve", adminId: reviewerAdminId, reviewerName })
      .then((response) => reportOutcome(response, ids.length, "approve"))
      .then((response) => onReviewed?.(response));
  };

  return { groups: filteredGroups, approve, reject, approveAll };
}
