import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef, forwardRef, useImperativeHandle } from "react";
import toast from "react-hot-toast";
import { useDebouncedValue } from "../../shared/hooks/useDebouncedValue";
import {
  FiEdit2,
  FiTrash2,
  FiX,
  FiCheck,
  FiChevronRight,
  FiPlus,
  FiInfo,
  FiAlertTriangle,
  FiSearch,
  FiCheckCircle,
} from "react-icons/fi";
import {
  fetchBatches,
  deleteBatch,
} from "../../../../helper/trainingBatchesApi";
import { useAuth } from "../../../../hooks/useAuth";
import { useGoToTrainingBatches } from "../../../../hooks/useGoToTrainingBatches";
import { useTrainingBatchOrigin } from "../context/TrainingBatchOriginContext";
import { getCurrentEmployeeId, hasFullAccessRole } from "../../../../helper/accessRoles";
import { fetchBatchEnrollments } from "../../../../helper/addTrainingV2Api";
import BatchEnrollmentPanel from "./EnrollmentTable";
import InlineCreatePanel from "./InlineCreatePanel";
import BatchRow from "./BatchRow";
import BatchNotesPanel from "./BatchNotesPanel";
import Collapse from "../../shared/components/Collapse";
import LoadingSpinner from "../../shared/components/LoadingSpinner";
import SkillFilterDropdown from "../../../../component/FilterDropdown";
import ColumnFilterIcon from "../../shared/components/filters/ColumnFilterIcon";
import ErrorBoundary from "./ErrorBoundary";
import NotCompletedPill from "../../shared/components/NotCompletedPill";
import { ENROLLMENT_STATUS_COLORS, countEnrollmentStatuses, countReviewDecisions, groupEnrollmentStatusCounts, uniqueSorted, SCROLL_INTO_VIEW_DELAY } from "../services/trainingUtils";
import { filterBatchesBySearch, isNestedOnlySearchMatch, ENROLLMENT_SEARCH_FIELDS } from "../services/batchSearch";
import { mergeBatchesWithLocalOptimism } from "../services/batchOptimisticMerge";
import { BATCH_STATUS_COLORS } from "../../shared/config/batchStatusColors";
import { BATCH_SCOPE } from "../services/batchScopes";
import { useTrainingReferenceData } from "../../../../context/TrainingReferenceDataContext";
import { useBatchPermissions, BATCH_ACTIONS } from "../services/batchPermissions";
import { useManagerApprovals } from "../../../../context/ManagerApprovalsContext";
import BatchPendingApprovalsBanner, {
  BatchPendingApprovalsDetail,
} from "./BatchPendingApprovalsBanner";
import ApprovalCheckbox from "./ApprovalCheckbox";
import ApprovalsBulkActionBar from "./ApprovalsBulkActionBar";
import {
  countSelectedBatches,
  useApprovalsSelection,
} from "../hooks/useApprovalsSelection";
import { useSubmitGuard } from "../hooks/useSubmitGuard";
import { useScrollIntoViewOnOpen } from "../hooks/useScrollIntoViewOnOpen";
import { getScrollContainer } from "../../../../helper/utility";
import { APPROVAL_BULK_GRACE_MS } from "../../manager-dashboard/hooks/useApprovalGracePeriod";
import { StatusBadge, EnrollmentStatusChips, InfoPopover, TruncatableCell } from "./BatchTableCells";

// Rows per page are worked out from the screen height. These are the
// smallest and largest allowed values. FALLBACK is used only until the first
// row is on screen and can be measured.
const MIN_ROWS_PER_PAGE = 4;
const MAX_ROWS_PER_PAGE = 20;
const FALLBACK_ROWS_PER_PAGE = 10;

// Filter option for batches that have no training quarter set.
const NO_QUARTER_LABEL = "No Quarter";

/* ══════════════════════════════════════════════════════════════════════════
   BatchTable — main export
══════════════════════════════════════════════════════════════════════════ */
const BatchTable = forwardRef(function BatchTable({
  createOpen,
  onCreateClose,
  createBatchPrefillData = null,
  scopeTarget,
  searchQuery = "",
  onSearchQueryChange,
  onSearchOpenChange,
  onSearchMatchInfoChange,
  hideApprovals = false,
  defaultStatusFilter = true,
  onPendingScopeClose,
}, ref) {
  const { user } = useAuth();
  const adminId = getCurrentEmployeeId(user);
  const { can, isFullAccess } = useBatchPermissions();
  const canEditBatch = can(BATCH_ACTIONS.EDIT_BATCH);
  const canDeleteBatch = can(BATCH_ACTIONS.DELETE_BATCH);
  // Check the role only (not the page origin), so admin/dept/hr always see every batch.
  const roleFullAccess = hasFullAccessRole(user?.role);
  const {
    getPendingCountForBatch,
    getOldestWaitingDaysForBatch,
    getRequestsForBatch,
    pendingCountByBatchNum,
    requests,
    getGraceDecision,
    totalPendingCount,
    batchesWithPendingCount,
    actionableRequests,
    scheduleApprove,
    scheduleReject,
    // True for managers, and for admin/dept/hr users even if nobody reports to
    // them (the backend lets them approve any request).
    canManageApprovals,
    subscribeReviewed,
  } = useManagerApprovals();

  const {
    selectedIds,
    selectedIdList,
    selectedCount,
    isSelected,
    toggleOne,
    toggleMany,
    clear: clearApprovalSelection,
    pruneTo,
    getScopeState,
  } = useApprovalsSelection();

  const APPROVALS_EXPAND_KEY = "trainingBatchApprovalsExpandedIds";
  // Which batches have their pending-request list open. All start closed;
  // only the "pending approvals" link opens them (old saved state is not used).
  const [approvalsExpandedBatchIds, setApprovalsExpandedBatchIds] = useState(() => new Set());

  // Many request lists can be open at the same time, so a manager can review
  // requests from several batches together.
  const toggleApprovalsExpanded = useCallback((batchId) => {
    setApprovalsExpandedBatchIds((prev) => {
      const next = new Set(prev);
      if (next.has(batchId)) next.delete(batchId);
      else next.add(batchId);
      try {
        if (next.size) sessionStorage.setItem(APPROVALS_EXPAND_KEY, JSON.stringify([...next]));
        else sessionStorage.removeItem(APPROVALS_EXPAND_KEY);
      } catch {
        // ignore storage failures
      }
      return next;
    });
  }, []);

  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false); // true only when loading failed (not when there are no batches)
  const [currentPage, setCurrentPage] = useState(1);

  // Batches this tab just added/changed/deleted, with a time limit. A data load
  // that started before the change must not undo it on screen. A ref is used
  // because nothing needs to re-render when it changes.
  const recentlyTouchedRef = useRef(new Map());
  const TOUCH_GRACE_MS = 6000; // 6 seconds, because the database can be slow
  const markRecentlyTouched = useCallback((batchId) => {
    recentlyTouchedRef.current.set(batchId, Date.now() + TOUCH_GRACE_MS);
  }, []);

  // Rows per page = how many full rows fit above the page buttons at the
  // bottom, measured from the first row. It starts at FALLBACK so there is a
  // row on screen to measure.
  const [rowsPerPage, setRowsPerPage] = useState(FALLBACK_ROWS_PER_PAGE);
  const firstRowRef = useRef(null);
  const paginationFooterRef = useRef(null);

  const recalcRowsPerPage = useCallback(() => {
    const rowEl = firstRowRef.current;
    if (!rowEl) return;
    const rowRect = rowEl.getBoundingClientRect();
    const rowHeight = rowRect.height;
    if (!rowHeight) return;
    const footerHeight = paginationFooterRef.current?.getBoundingClientRect().height ?? 0;
    const safetyMargin = 8; // small gap so the last row does not touch the page buttons
    const available = window.innerHeight - rowRect.top - footerHeight - safetyMargin;
    const rows = Math.floor(available / rowHeight); // only full rows, never half a row
    setRowsPerPage(Math.min(MAX_ROWS_PER_PAGE, Math.max(MIN_ROWS_PER_PAGE, rows)));
  }, []);

  // Measure before the screen is painted (useLayoutEffect), so the user never
  // sees the wrong number of rows for a moment.
  useLayoutEffect(() => {
    recalcRowsPerPage();
  }, [recalcRowsPerPage, loading, batches.length]);

  const [filters, setFilters] = useState({ batch: [], module: [], quarter: [], status: [] });
  // Becomes true once the user changes the Batch Status filter (or clears all
  // filters). Until then, the default status filter is used.
  const [statusManuallySet, setStatusManuallySet] = useState(false);
  const statusFilterManual = statusManuallySet || !defaultStatusFilter; // the Open/In Progress default is used only when defaultStatusFilter is on
  const isSearchControlled = typeof onSearchQueryChange === "function";
  const [, setInternalSearchOpen] = useState(false);
  const [internalSearchQuery, setInternalSearchQuery] = useState("");
  const searchQueryValue = isSearchControlled ? searchQuery : internalSearchQuery;
  const setSearchQueryValue = isSearchControlled ? onSearchQueryChange : setInternalSearchQuery;
  const setSearchOpenValue = typeof onSearchOpenChange === "function" ? onSearchOpenChange : setInternalSearchOpen;
  const [debouncedSearch, setDebouncedSearch] = useDebouncedValue(String(searchQueryValue || "").trim(), 200, { initialValue: "" });

  // Enrollments of each batch, loaded once and shared by the info popup, the
  // Enrollments header and the enrollment table, so nothing loads twice.
  // The refs hold the latest values for fetchEnrollmentsFor.
  const [enrollmentsCache, setEnrollmentsCache] = useState({}); // batchId -> list of enrollment rows
  const [enrollmentsLoadingIds, setEnrollmentsLoadingIds] = useState(() => new Set());
  // Batches whose last load failed, so the screen can show "Retry" instead of
  // "no enrollments".
  const [enrollmentsErrorIds, setEnrollmentsErrorIds] = useState(() => new Set());
  const enrollmentsCacheRef = useRef(enrollmentsCache);
  const enrollmentsLoadingIdsRef = useRef(enrollmentsLoadingIds);
  const batchesRef = useRef(batches); // latest batches, read in fetchEnrollmentsFor without re-creating it
  useEffect(() => { enrollmentsCacheRef.current = enrollmentsCache; }, [enrollmentsCache]);
  useEffect(() => { enrollmentsLoadingIdsRef.current = enrollmentsLoadingIds; }, [enrollmentsLoadingIds]);
  useEffect(() => { batchesRef.current = batches; }, [batches]);

  // Loads enrollments for batches not loaded yet (and not loading now). The refs
  // are updated at once, so fast repeated calls never send the same request twice.
  const fetchEnrollmentsFor = useCallback((batchIds, { force = false } = {}) => {
    // Skips new batches that are not saved yet (their id starts with "temp-").
    // `force: true` loads again even if data is already there; the old data stays
    // on screen until the new data arrives, so nothing blinks.
    const missing = batchIds.filter((id) => (
      typeof id === "number"
      && (force || !(id in enrollmentsCacheRef.current))
      && !enrollmentsLoadingIdsRef.current.has(id)
    ));
    if (missing.length === 0) return;

    missing.forEach((id) => enrollmentsLoadingIdsRef.current.add(id));
    setEnrollmentsLoadingIds((prev) => new Set([...prev, ...missing]));

    // Show each batch's result as soon as it arrives, so one slow batch does not
    // keep the others on "Loading…".
    missing.forEach((id) => {
      fetchBatchEnrollments(id)
        .then((enrollments) => {
          // Check: the number of rows loaded should match batch.employee_count. If not,
          // the backend's batch_id filter may be broken.
          const expected = Number(batchesRef.current.find((x) => x.batch_id === id)?.employee_count ?? 0);
          if (enrollments.length !== expected) {
            console.warn(`[BatchTable] Fetched ${enrollments.length} enrollments for batch ${id}, but employee_count is ${expected} — the enrollments fetch and the aggregate count have drifted.`);
          }
          enrollmentsCacheRef.current[id] = enrollments;
          setEnrollmentsCache((prev) => ({ ...prev, [id]: enrollments }));
          setEnrollmentsErrorIds((prev) => {
            if (!prev.has(id)) return prev; // nothing changed, so skip the update
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        })
        .catch((err) => {
          console.error(`[BatchTable] Failed to fetch enrollments for batch ${id}:`, err);
          // Not cached as "empty" — a later retry/revisit will try again.
          setEnrollmentsErrorIds((prev) => new Set(prev).add(id));
        })
        .finally(() => {
          enrollmentsLoadingIdsRef.current.delete(id);
          setEnrollmentsLoadingIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        });
    });
  }, []);

  // Lets the enrollment table save its changes into this shared data. Takes a
  // new list or a function (old list) => new list, and returns the old list so
  // the caller can undo if saving fails.
  const updateEnrollmentsCache = useCallback((batchId, enrollmentsOrUpdater) => {
    const prev = enrollmentsCacheRef.current[batchId] || [];
    const next = typeof enrollmentsOrUpdater === "function" ? enrollmentsOrUpdater(prev) : enrollmentsOrUpdater;
    enrollmentsCacheRef.current[batchId] = next;
    setEnrollmentsCache((prevCache) => ({ ...prevCache, [batchId]: next }));
    return prev;
  }, []);

  // Removes a batch's saved enrollments, so the next load really gets fresh data.
  const invalidateEnrollments = useCallback((batchId) => {
    delete enrollmentsCacheRef.current[batchId];
    enrollmentsLoadingIdsRef.current.delete(batchId);
    setEnrollmentsCache((prev) => {
      if (!(batchId in prev)) return prev;
      const next = { ...prev };
      delete next[batchId];
      return next;
    });
  }, []);

  // After an approve/reject (here or on the Manager Dashboard), reload the
  // enrollments of batches already loaded, so their status labels update.
  useEffect(() => {
    return subscribeReviewed((payload) => {
      const results = Array.isArray(payload) ? payload : payload?.results || [payload];
      const reviewedBatchNums = new Set(
        results.map((r) => r?.batch_num ?? r?.batchNum).filter(Boolean).map(String)
      );
      if (reviewedBatchNums.size === 0) return;
      setReviewedByBatch((prev) => {
        const next = new Map(prev);
        results.forEach((r) => {
          const batchNum = String(r?.batch_num ?? r?.batchNum ?? "");
          if (!batchNum || r?.employee_training_id == null) return;
          const decisions = new Map(next.get(batchNum));
          decisions.set(String(r.employee_training_id), r.training_status === "Not Started" ? "approved" : "rejected");
          next.set(batchNum, decisions);
        });
        return next;
      });
      const reviewedBatch = batchesRef.current.find((b) => reviewedBatchNums.has(String(b.batch_num)));
      if (reviewedBatch) setExpandedId(reviewedBatch.batch_id); // show the result in its Enrollments
      const affectedIds = batchesRef.current
        .filter((b) => reviewedBatchNums.has(String(b.batch_num)) && b.batch_id in enrollmentsCacheRef.current)
        .map((b) => b.batch_id);
      if (affectedIds.length === 0) return;
      // Use force (not remove + load), so the old data stays on screen and
      // nothing blinks while reloading.
      fetchEnrollmentsFor(affectedIds, { force: true });
    });
  }, [subscribeReviewed, fetchEnrollmentsFor]);

  // Dropdown lists come from TrainingReferenceDataContext (loaded at app start).
  // retryHierarchies reloads the area/sub-area/module list after a save that
  // may have added a new one.
  const { batchStatusOptions, trainingStatusOptions, retryHierarchies } = useTrainingReferenceData();

  // For developers only: warn in the console if the server sends a status that
  // has no color set, so it is not missed in testing.
  useEffect(() => {
    batchStatusOptions.forEach((s) => {
      if (!(s.toLowerCase() in BATCH_STATUS_COLORS)) {
        console.warn(`[BatchTable] batch_status value "${s}" has no entry in BATCH_STATUS_COLORS — badge falls back to the default gray.`);
      }
    });
  }, [batchStatusOptions]);
  useEffect(() => {
    trainingStatusOptions.forEach((s) => {
      if (!(s.toLowerCase() in ENROLLMENT_STATUS_COLORS)) {
        console.warn(`[BatchTable] training_status value "${s}" has no entry in ENROLLMENT_STATUS_COLORS — badge falls back to the default gray.`);
      }
    });
  }, [trainingStatusOptions]);

  const [expandedId, setExpandedId] = useState(null);
  // Approve/reject done on this page in this visit:
  // batch_num -> Map(employee_training_id -> "approved" | "rejected").
  const [reviewedByBatch, setReviewedByBatch] = useState(() => new Map());
  // Saved decisions plus ones that can still be undone, so the result shows at once.
  const decisionsByBatch = useMemo(() => {
    const next = new Map([...reviewedByBatch].map(([batchNum, decisions]) => [batchNum, new Map(decisions)]));
    (requests || []).forEach((r) => {
      const decision = getGraceDecision(r.id);
      if (decision) next.set(String(r.batchNum), new Map(next.get(String(r.batchNum))).set(String(r.id), decision));
    });
    return next;
  }, [reviewedByBatch, requests, getGraceDecision]);
  const reviewedTotals = useMemo(
    () => countReviewDecisions(new Map([...decisionsByBatch.values()].flatMap((decisions) => [...decisions]))),
    [decisionsByBatch]
  );
  // Index into `filteredBatches` for next/prev match navigation.
  const [matchIndex, setMatchIndex] = useState(0);
  // True when the user clicked the row, false when the code opened it (link or
  // search). The two cases scroll differently.
  const manualToggleRef = useRef(false);
  // The batch a link points to, kept only until its page is shown. Normal row
  // clicks do not change it.
  const [targetLandingId, setTargetLandingId] = useState(null);
  const targetAppliedRef = useRef(false); // stops the link from being applied twice
  // { scope, label } for the "Scope: X" tag. Set only when a link opens many
  // batches (one batch just opens its row, no tag).
  const [activeScope, setActiveScope] = useState(null);
  const [editingBatch, setEditingBatch] = useState(null); // the batch open in the Edit form, or null
  const [deletingId, setDeletingId] = useState(null);
  const [hoverBatchId, setHoverBatchId] = useState(null); // row whose info popup is open
  // Which full-text popup is open (Description or Status Remark), as
  // "<field>:<batchId>"; field is "desc" or "remark".
  const [openTextPopoverKey, setOpenTextPopoverKey] = useState(null);
  const deleteGuard = useSubmitGuard(); // stops a double click on "Yes, delete"

  // The info button of each row (batch_id -> button), so the popup knows where
  // to show. Kept in one Map because hooks cannot be called inside a loop.
  const infoButtonRefs = useRef(new Map());
  // The text cells (to check if text is cut off) and their popup buttons, keyed
  // as "<field>:<batchId>".
  const textCellRefs = useRef(new Map());
  const textTriggerRefs = useRef(new Map());
  const [truncatedCells, setTruncatedCells] = useState(() => new Set());

  const recalcTruncation = useCallback(() => {
    const next = new Set();
    textCellRefs.current.forEach((el, key) => {
      if (el && el.scrollWidth > el.clientWidth) next.add(key);
    });
    // Update only if something changed. A new Set every time would re-render the
    // page again and again.
    setTruncatedCells((prev) => {
      if (prev.size === next.size && [...prev].every((k) => next.has(k))) return prev;
      return next;
    });
  }, []);
  // The effect that runs this check is further below, after `paginated`.

  // Close the text popup when the user clicks outside it.
  useEffect(() => {
    if (openTextPopoverKey == null) return;
    const onDocMouseDown = (e) => {
      if (e.target.closest("[data-textpopover-trigger]") || e.target.closest("[data-textpopover-panel]")) return;
      setOpenTextPopoverKey(null);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [openTextPopoverKey]);

  // When the window size or zoom changes (after a short wait), work out the rows
  // per page and the cut-off text again.
  useEffect(() => {
    let timer;
    const handleResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        recalcRowsPerPage();
        recalcTruncation();
      }, 150);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(timer);
    };
  }, [recalcRowsPerPage, recalcTruncation]);

  // When a row opens: if the user clicked it, scroll the list back to the top;
  // if a link or search opened it, scroll that row into view. One effect does
  // both so they never fight.
  const detailRowRefs = useRef(new Map());
  useEffect(() => {
    // Read the flag and reset it at once, so it never stays true by mistake.
    const wasManualToggle = manualToggleRef.current;
    manualToggleRef.current = false;
    if (expandedId == null) return;
    const t = setTimeout(() => {
      if (wasManualToggle) {
        getScrollContainer(firstRowRef.current)?.scrollTo({ top: 0, behavior: "auto" });
        return;
      }
      detailRowRefs.current.get(expandedId)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, SCROLL_INTO_VIEW_DELAY);
    return () => clearTimeout(t);
  }, [expandedId]);

  // Opening the Create form closes the Edit form, so both are never open at once.
  useEffect(() => {
    if (createOpen) setEditingBatch(null);
  }, [createOpen]);

  // The Edit form shows at the top of the list, so scroll it into view (the row
  // that opened it may be far down).
  const editPanelRef = useScrollIntoViewOnOpen(editingBatch, { block: "nearest" });

  // Change a batch's enrollment count on screen at once, without reloading.
  const applyEnrollmentCountDelta = useCallback((batchId, delta) => {
    markRecentlyTouched(batchId);
    setBatches((prev) => prev.map((b) => (
      b.batch_id === batchId ? { ...b, employee_count: Math.max(0, Number(b.employee_count || 0) + delta) } : b
    )));
  }, [markRecentlyTouched]);

  // Changes the batch list on screen at once (before the server answers) and
  // returns the old list so the caller can undo. Changed batches are marked, so
  // a data load cannot undo the change.
  const applyOptimisticBatchUpdate = useCallback((updater) => {
    const prev = batchesRef.current;
    const next = updater(prev);
    const prevById = new Map(prev.map((b) => [b.batch_id, b]));
    const nextIds = new Set(next.map((b) => b.batch_id));
    for (const b of next) {
      if (prevById.get(b.batch_id) !== b) markRecentlyTouched(b.batch_id);
    }
    for (const id of prevById.keys()) {
      if (!nextIds.has(id)) markRecentlyTouched(id);
    }
    batchesRef.current = next;
    setBatches(next);
    return prev;
  }, [markRecentlyTouched]);

  // Batches load when the page opens, on Retry and after saves (no auto-refresh).
  // Local changes are kept when new data arrives. Only a failed first load shows
  // the error screen; later failures keep the old list.
  const batchesRequestIdRef = useRef(0);
  const batchesLoadedOnceRef = useRef(false);
  const loadBatches = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    const requestId = ++batchesRequestIdRef.current;
    try {
      const freshBatches = (await fetchBatches()).results || [];
      if (batchesRequestIdRef.current !== requestId) return;
      batchesLoadedOnceRef.current = true;
      setBatches((prev) => {
        const merged = mergeBatchesWithLocalOptimism(freshBatches, prev, recentlyTouchedRef.current);
        batchesRef.current = merged;
        return merged;
      });
      setLoadError(false);
      setLoading(false);
    } catch {
      if (batchesRequestIdRef.current !== requestId) return;
      if (!batchesLoadedOnceRef.current) setLoadError(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filterOptions = useMemo(() => {
    // Quarters look like "2026-Q1", so normal text sorting puts the newest first.
    const quarterValues = [...new Set(batches.map((b) => b.training_quarter).filter(Boolean))]
      .sort((a, b) => b.localeCompare(a));
    if (batches.some((b) => !b.training_quarter)) quarterValues.push(NO_QUARTER_LABEL);
    return {
      batches: uniqueSorted(batches.map((b) => b.batch_num).filter(Boolean)),
      modules: uniqueSorted(batches.map((b) => b.module_name).filter(Boolean)),
      quarters: quarterValues,
    };
  }, [batches]);

  // Batch numbers for the pending view: batches with a pending request (also
  // ones still in the Undo time) or reviewed in this visit.
  const pendingScopeBatchNums = useMemo(
    () => new Set([...(requests || []).map((r) => String(r.batchNum)), ...reviewedByBatch.keys()]),
    [requests, reviewedByBatch]
  );
  // Users without full access see only the batches of their scope. This is
  // kept apart from the filters, so "Clear all" cannot show them more batches.
  const mandatoryScopeBatchNums = useMemo(() => {
    if (roleFullAccess) return null;
    if (scopeTarget?.scope === BATCH_SCOPE.PENDING_APPROVALS || activeScope?.scope === BATCH_SCOPE.PENDING_APPROVALS) return [...pendingScopeBatchNums]; // also when picked via the banner checkbox
    return scopeTarget?.batchNums ?? [];
  }, [roleFullAccess, scopeTarget, activeScope, pendingScopeBatchNums]);

  // Batches after the scope and the batch/module/quarter filters, before search.
  const nonSearchFilteredBatches = useMemo(() => {
    let list = [...batches];
    if (mandatoryScopeBatchNums) list = list.filter((b) => mandatoryScopeBatchNums.includes(b.batch_num));
    if (filters.batch.length)   list = list.filter((b) => filters.batch.includes(b.batch_num || ""));
    if (filters.module.length)  list = list.filter((b) => filters.module.some((m) => m.toLowerCase() === (b.module_name || "").toLowerCase()));
    if (filters.quarter.length) {
      list = list.filter((b) =>
        filters.quarter.includes(b.training_quarter) ||
        (filters.quarter.includes(NO_QUARTER_LABEL) && !b.training_quarter)
      );
    }
    return list;
  }, [batches, mandatoryScopeBatchNums, filters.batch, filters.module, filters.quarter]);

  // Filters and search applied. Status is applied later, because it has its
  // own default rules.
  const baseFilteredBatches = useMemo(() => {
    let list = nonSearchFilteredBatches;

    if (debouncedSearch.trim()) {
      // Search also looks at enrolled employees (name, status, remark). Their data
      // is loaded for all batches in the list while searching. Pending nominees
      // are searched only for managers.
      const dynamicFieldGetters = [
        ...ENROLLMENT_SEARCH_FIELDS.map((getEnrollmentField) => (batch) => {
          const cached = enrollmentsCache[batch.batch_id];
          return cached ? cached.map((e) => getEnrollmentField(e)) : null;
        }),
        (batch) => {
          const cached = enrollmentsCache[batch.batch_id];
          if (!cached) return null;
          return groupEnrollmentStatusCounts(countEnrollmentStatuses(cached)).notCompletedCount;
        },
        ...(canManageApprovals
          ? [
              (batch) => (getRequestsForBatch(batch.batch_num) || []).map((r) => r.employeeName),
              (batch) => (getRequestsForBatch(batch.batch_num) || []).map((r) => r.moduleName),
              (batch) => (getRequestsForBatch(batch.batch_num) || []).map((r) => r.areaName),
              (batch) => (getRequestsForBatch(batch.batch_num) || []).map((r) => r.requestType),
              (batch) => (getRequestsForBatch(batch.batch_num) || []).map((r) => r.managerGroup),
            ]
          : []),
      ];
      list = filterBatchesBySearch(list, debouncedSearch, dynamicFieldGetters);
    }
    return list;
  }, [
    nonSearchFilteredBatches,
    debouncedSearch,
    canManageApprovals,
    getRequestsForBatch,
    enrollmentsCache,
  ]);

  // If the user has not picked a status: show Open + In Progress, or Completed
  // if there are none. Once the user picks, an empty status filter means "all".
  const { filteredBatches: statusFilteredBatches, statusFallbackApplied } = useMemo(() => {
    if (statusFilterManual) {
      return {
        filteredBatches: filters.status.length
          ? baseFilteredBatches.filter((b) => filters.status.some((s) => s.toLowerCase() === (b.batch_status || "").toLowerCase()))
          : baseFilteredBatches,
        statusFallbackApplied: false,
      };
    }
    const openInProgress = baseFilteredBatches.filter((b) => ["open", "in progress"].includes((b.batch_status || "").toLowerCase()));
    if (openInProgress.length > 0) return { filteredBatches: openInProgress, statusFallbackApplied: false };
    const completed = baseFilteredBatches.filter((b) => (b.batch_status || "").toLowerCase() === "completed");
    return { filteredBatches: completed, statusFallbackApplied: completed.length > 0 };
  }, [baseFilteredBatches, filters.status, statusFilterManual]);

  // Show batches with pending requests first, but only when the user came from
  // the "pending approvals" link.
  const isPendingApprovalsScope = activeScope?.scope === BATCH_SCOPE.PENDING_APPROVALS;

  // When leaving the pending-approvals view, close any open approve/reject
  // panels, so the page looks like a normal batch list again.
  useEffect(() => {
    if (isPendingApprovalsScope) return;
    setApprovalsExpandedBatchIds(new Set());
    try {
      sessionStorage.removeItem(APPROVALS_EXPAND_KEY);
    } catch {
      // ignore
    }
  }, [isPendingApprovalsScope]);

  const filteredBatches = useMemo(() => {
    if (!canManageApprovals || !isPendingApprovalsScope) return statusFilteredBatches;
    // Hide a batch from the pending view once all its requests are approved or
    // rejected, so the list updates right away.
    return statusFilteredBatches
      .filter((b) => pendingScopeBatchNums.has(String(b.batch_num)))
      .sort((a, b) => {
        const daysA = getOldestWaitingDaysForBatch(a.batch_num) || 0;
        const daysB = getOldestWaitingDaysForBatch(b.batch_num) || 0;
        if (daysA !== daysB) return daysB - daysA;
        return getPendingCountForBatch(b.batch_num) - getPendingCountForBatch(a.batch_num);
      });
  }, [
    statusFilteredBatches,
    canManageApprovals,
    isPendingApprovalsScope,
    getPendingCountForBatch,
    getOldestWaitingDaysForBatch,
    pendingScopeBatchNums,
  ]);

  // Pending requests of the batches shown now. Used by the "select all"
  // checkbox at the top.
  const visiblePendingRequests = useMemo(() => {
    if (!canManageApprovals) return [];
    const batchNums = new Set(filteredBatches.map((batch) => String(batch.batch_num)));
    return (actionableRequests || []).filter((request) =>
      batchNums.has(String(request.batchNum))
    );
  }, [canManageApprovals, filteredBatches, actionableRequests]);

  const visiblePendingIds = useMemo(
    () => visiblePendingRequests.map((request) => String(request.id)),
    [visiblePendingRequests]
  );
  const bannerPendingCount = isPendingApprovalsScope ? visiblePendingRequests.length : totalPendingCount; // banner counts follow the pending scope
  const bannerBatchCount = isPendingApprovalsScope ? new Set(visiblePendingRequests.map((r) => String(r.batchNum))).size : batchesWithPendingCount;

  const masterSelectState = useMemo(
    () => getScopeState(visiblePendingIds),
    [getScopeState, visiblePendingIds]
  );

  const selectedBatchSpan = useMemo(
    () => countSelectedBatches(selectedIds, visiblePendingRequests),
    [selectedIds, visiblePendingRequests]
  );

  useEffect(() => {
    pruneTo(visiblePendingIds);
  }, [visiblePendingIds, pruneTo]);

  const handleBulkApprove = useCallback((note = null) => {
    if (selectedIdList.length === 0) return;
    scheduleApprove(selectedIdList, null, { note, graceMs: APPROVAL_BULK_GRACE_MS });
    clearApprovalSelection();
  }, [selectedIdList, scheduleApprove, clearApprovalSelection]);

  const handleBulkReject = useCallback((reason = null) => {
    if (selectedIdList.length === 0) return;
    scheduleReject(selectedIdList, reason, null, { graceMs: APPROVAL_BULK_GRACE_MS });
    clearApprovalSelection();
  }, [selectedIdList, scheduleReject, clearApprovalSelection]);

  // Until the user picks a status, copy the default choice into the status
  // filter so the dropdown shows it.
  useEffect(() => {
    if (statusFilterManual) return;
    const desired = statusFallbackApplied ? ["Completed"] : ["Open", "In Progress"];
    setFilters((prev) => {
      const same = prev.status.length === desired.length && desired.every((v) => prev.status.includes(v));
      return same ? prev : { ...prev, status: desired };
    });
  }, [statusFallbackApplied, statusFilterManual]);

  // Shows only the batches with pending requests, adds the "Scope" tag and
  // opens each batch. Used by the pending-approvals link and the banner
  // checkbox. No status filter is added.
  const applyPendingApprovalsScope = useCallback((matched, label = "Pending approvals") => {
    setStatusManuallySet(true);
    if (matched.length === 0 && !isFullAccess) {
      // A manager with nothing pending: an empty filter would show all batches,
      // so use a value that matches none. Admin/dept/hr users see all batches.
      setFilters({ batch: ["__no_pending_approvals__"], module: [], quarter: [], status: [] });
    } else {
      setFilters({ batch: matched.map((b) => String(b.batch_num)), module: [], quarter: [], status: [] });
    }
    setActiveScope({ scope: BATCH_SCOPE.PENDING_APPROVALS, label });

    if (matched.length > 0) {
      // Open every matched batch, because the user came here to review them.
      const sorted = [...matched].sort((a, b) => {
        const daysA = getOldestWaitingDaysForBatch(a.batch_num) || 0;
        const daysB = getOldestWaitingDaysForBatch(b.batch_num) || 0;
        if (daysA !== daysB) return daysB - daysA;
        return getPendingCountForBatch(b.batch_num) - getPendingCountForBatch(a.batch_num);
      });
      const allIds = sorted.map((b) => String(b.batch_id));
      setApprovalsExpandedBatchIds(new Set(allIds));
      try {
        sessionStorage.setItem(APPROVALS_EXPAND_KEY, JSON.stringify(allIds));
      } catch {
        // ignore storage failures
      }
    }
  }, [isFullAccess, getOldestWaitingDaysForBatch, getPendingCountForBatch]);

  // Batches that have pending requests right now. Shared by the link and the
  // banner checkbox, so both pick the same batches.
  const livePendingApprovalBatches = useMemo(() => {
    const liveNums = [...pendingCountByBatchNum.keys()].filter((num) =>
      batches.some((b) => String(b.batch_num) === String(num))
    );
    const hasOrphans = [...pendingCountByBatchNum.keys()].some(
      (num) => !batches.some((b) => String(b.batch_num) === String(num))
    );
    return { liveNums, hasOrphans, matched: batches.filter((b) => liveNums.includes(String(b.batch_num))) };
  }, [pendingCountByBatchNum, batches]);

  // A new link while this page is open must work too. The old view is kept,
  // so "Clear all" can go back to it.
  const goToTrainingBatches = useGoToTrainingBatches();
  const batchOrigin = useTrainingBatchOrigin();
  const lastScopeTargetRef = useRef(scopeTarget);
  const returnTargetRef = useRef(null);
  const restoringRef = useRef(false);
  useEffect(() => {
    targetAppliedRef.current = false;
    if (lastScopeTargetRef.current && scopeTarget && lastScopeTargetRef.current !== scopeTarget) {
      returnTargetRef.current = restoringRef.current ? null : returnTargetRef.current ?? lastScopeTargetRef.current; // remember the first view, even after many jumps
    }
    restoringRef.current = false;
    lastScopeTargetRef.current = scopeTarget;
  }, [scopeTarget]);

  useEffect(() => {
    if (!scopeTarget || targetAppliedRef.current || loading) return;
    const { batchNums = [], scope, label } = scopeTarget;

    if (scope === BATCH_SCOPE.PENDING_APPROVALS) {
      const { liveNums, hasOrphans, matched } = livePendingApprovalBatches;
      if (hasOrphans) return;
      if (totalPendingCount > 0 && liveNums.length === 0) return;

      targetAppliedRef.current = true;
      const forBatch = matched.filter((b) => batchNums.map(String).includes(String(b.batch_num))); // the named batch, or all pending ones
      applyPendingApprovalsScope(forBatch.length ? forBatch : matched, ((forBatch.length || !batchNums.length) && label) || "Pending approvals"); // all pending ones get the normal label
      return;
    }

    const matched = batches.filter((b) => batchNums.includes(b.batch_num));

    if (!scope) {
      if (matched.length === 0) return;
      targetAppliedRef.current = true;
      setActiveScope(null); // leave any earlier scope (e.g. Pending approvals)
      setStatusManuallySet(true);
      setFilters({ batch: batchNums, module: [], quarter: [], status: matched[0].batch_status ? [matched[0].batch_status] : [] });
      setExpandedId(matched[0].batch_id);
      setTargetLandingId(matched[0].batch_id);
      return;
    }

    targetAppliedRef.current = true;
    const statuses = [...new Set(matched.map((b) => b.batch_status).filter(Boolean))];
    setStatusManuallySet(true);
    setFilters({ batch: batchNums, module: [], quarter: [], status: statuses });
    setActiveScope({ scope, label });
  }, [
    scopeTarget,
    batches,
    loading,
    livePendingApprovalBatches,
    totalPendingCount,
    getOldestWaitingDaysForBatch,
    getPendingCountForBatch,
    isFullAccess,
    applyPendingApprovalsScope,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredBatches.length / rowsPerPage));
  // This also keeps the page number valid when rows per page gets smaller.
  const safePage = Math.min(currentPage, totalPages);
  // useMemo is needed here: a new array on every render made the text check
  // below run again and again (an endless loop).
  const paginated = useMemo(
    () => filteredBatches.slice((safePage - 1) * rowsPerPage, safePage * rowsPerPage),
    [filteredBatches, safePage, rowsPerPage]
  );

  // Load enrollment counts for every batch on the current page, so the chips
  // show without a click. Batches already loaded are skipped.
  useEffect(() => {
    const idsWithEnrollments = paginated
      .filter((b) => Number(b.employee_count ?? 0) > 0)
      .map((b) => b.batch_id);
    fetchEnrollmentsFor(idsWithEnrollments);
  }, [paginated, fetchEnrollmentsFor]);

  // While searching (2 or more letters), load enrollments for all batches in
  // the list, so employees are found on every page, not only on open rows.
  useEffect(() => {
    if (debouncedSearch.trim().length < 2) return;
    const idsWithEnrollments = nonSearchFilteredBatches
      .filter((b) => Number(b.employee_count ?? 0) > 0)
      .map((b) => b.batch_id);
    fetchEnrollmentsFor(idsWithEnrollments);
  }, [debouncedSearch, nonSearchFilteredBatches, fetchEnrollmentsFor]);

  // Open the first batch that matched only because of an employee, so the user
  // can see why it is in the list. Skipped if a row matches on its own fields.
  useEffect(() => {
    if (!debouncedSearch.trim()) return;
    if (paginated.some((b) => !isNestedOnlySearchMatch(b, debouncedSearch))) return;
    const nestedMatch = paginated.find((b) => isNestedOnlySearchMatch(b, debouncedSearch));
    if (nestedMatch) setExpandedId(nestedMatch.batch_id);
  }, [debouncedSearch, paginated]);

  // Check again which texts are cut off when the page changes (before paint).
  useLayoutEffect(() => {
    recalcTruncation();
  }, [recalcTruncation, paginated]);

  useEffect(() => { setCurrentPage(1); }, [filters, debouncedSearch]);

  // Go to the page where the linked batch is. This runs after the "filters
  // changed -> go to page 1" effect, so it wins. Then it clears itself.
  useEffect(() => {
    if (targetLandingId == null) return;
    const idx = filteredBatches.findIndex((b) => b.batch_id === targetLandingId);
    if (idx === -1) return;
    const page = Math.floor(idx / rowsPerPage) + 1;
    setCurrentPage((prev) => (prev === page ? prev : page));
    setTargetLandingId(null);
  }, [filteredBatches, rowsPerPage, targetLandingId]);

  // On any filter change, go back to match 1 and tell the header the count.
  useEffect(() => {
    setMatchIndex(0);
    onSearchMatchInfoChange?.({ count: filteredBatches.length, index: 0 });
  }, [filteredBatches, onSearchMatchInfoChange]);

  // Jump to the next or previous match (wraps around) and open it.
  const stepMatch = useCallback(
    (delta) => {
      const count = filteredBatches.length;
      if (count === 0) return;
      const nextIndex = (matchIndex + delta + count) % count;
      const target = filteredBatches[nextIndex];
      const page = Math.floor(nextIndex / rowsPerPage) + 1;
      setMatchIndex(nextIndex);
      setCurrentPage(page);
      setExpandedId(target.batch_id);
      onSearchMatchInfoChange?.({ count, index: nextIndex });
    },
    [filteredBatches, matchIndex, rowsPerPage, onSearchMatchInfoChange]
  );

  useImperativeHandle(
    ref,
    () => ({
      goToNextMatch: () => stepMatch(1),
      goToPrevMatch: () => stepMatch(-1),
    }),
    [stepMatch]
  );

  const toggleFilterValue = (key, value) => {
    // Removing one status chip also counts as the user choosing the status.
    if (key === "status") setStatusManuallySet(true);
    setFilters((prev) => {
      const current = prev[key];
      return {
        ...prev,
        [key]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
      };
    });
  };

  const setFilterValues = (key, values) => {
    if (key === "status") setStatusManuallySet(true);
    setFilters((prev) => ({ ...prev, [key]: values }));
  };

  const clearAllFilters = () => {
    // Count this as the user choosing, otherwise the default status would come
    // back right after "Clear all".
    setStatusManuallySet(true);
    setFilters({ batch: [], module: [], quarter: [], status: [] });
    setActiveScope(null);
    setSearchQueryValue("");
    setDebouncedSearch("");
    setSearchOpenValue(false);
    const returnTarget = returnTargetRef.current;
    if (returnTarget) {
      restoringRef.current = true;
      goToTrainingBatches(returnTarget.scope ? returnTarget : returnTarget.batchNums?.[0], batchOrigin); // go back to the view before the jump
    }
  };

  // Removes only the "Scope" tag and its batch filter; other filters stay.
  const clearScope = () => {
    setActiveScope(null);
    setStatusManuallySet(false);
    setFilters((prev) => ({ ...prev, batch: [] }));
    setApprovalsExpandedBatchIds(new Set());
    try {
      sessionStorage.removeItem(APPROVALS_EXPAND_KEY);
    } catch {
      // ignore
    }
  };

  const activeFilterChips = useMemo(() => {
    const chips = [];
    const pushChips = (key, prefix) => {
      filters[key].forEach((val) => chips.push({
        key: `${key}:${val}`,
        label: `${prefix}: ${val}`,
        clear: () => toggleFilterValue(key, val),
      }));
    };
    // While the "Scope" tag shows, hide the many Batch Number chips it would add.
    if (!activeScope) pushChips("batch", "Batch Number");
    pushChips("module", "Module");
    pushChips("quarter", "Quarter");
    pushChips("status", "Batch Status");
    return chips;
  }, [filters, activeScope]);

  const toggleRow = (batchId) => {
    manualToggleRef.current = true;
    setExpandedId((prev) => (prev !== batchId ? batchId : null));
  };

  // Opens the Edit form (the same form as Create) for this batch, and closes
  // Create if it is open.
  const openEdit = (batch) => {
    // A new batch has a temporary id until it is saved; editing it now would
    // send that fake id to the server.
    if (typeof batch.batch_id !== "number") {
      toast.error("Still saving this batch — try again in a moment.");
      return;
    }
    setEditingBatch(batch);
    onCreateClose?.();
  };

  // Remove the row from the screen at once and delete it in the background.
  // If deleting fails, put the row back in the same place and show a message.
  const handleDeleteConfirm = async (batch) => {
    if (deleteGuard.isLocked()) return;
    if (!adminId) { toast.error("User not identified."); return; }
    // Same check as in openEdit: do not delete a batch that is not saved yet.
    if (typeof batch.batch_id !== "number") {
      toast.error("Still saving this batch — try again in a moment.");
      return;
    }
    deleteGuard.lock();

    const originalIndex = batches.findIndex((b) => b.batch_id === batch.batch_id);
    // Mark the batch before removing it, so an older data load cannot bring it back.
    markRecentlyTouched(batch.batch_id);
    setBatches((prev) => {
      const next = prev.filter((b) => b.batch_id !== batch.batch_id);
      batchesRef.current = next;
      return next;
    });
    // Close the "Yes, delete" bar at once, so the detail panel shows again.
    setDeletingId(null);

    const toastId = toast.loading(`Deleting ${batch.batch_num}...`, { duration: Infinity });
    try {
      await deleteBatch(batch.batch_id, adminId);
      toast.success(`Batch ${batch.batch_num} deleted.`, { id: toastId, duration: 5000 });
    } catch (err) {
      markRecentlyTouched(batch.batch_id); // mark it again, so an older data load cannot remove it again
      setBatches((prev) => {
        if (prev.some((b) => b.batch_id === batch.batch_id)) { batchesRef.current = prev; return prev; } // already back, never add it twice
        const next = [...prev];
        next.splice(Math.min(originalIndex, next.length), 0, batch);
        batchesRef.current = next;
        return next;
      });
      const data = err.response?.data;
      if (err.response?.status === 409 && data?.employee_training_count) {
        toast.error(`Could not delete "${batch.batch_num}": ${data.employee_training_count} enrollment(s) still reference this batch.`, { id: toastId, duration: 5000 });
      } else {
        toast.error(`Failed to delete "${batch.batch_num}"${data?.error ? `: ${data.error}` : " — please try again."}`, { id: toastId, duration: 5000 });
      }
    } finally {
      deleteGuard.unlock();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center text-gray-500 dark:text-gray-400 py-16">
        <LoadingSpinner label="Loading batches…" />
      </div>
    );
  }

  // Loading failed: show a Retry message, not the "no batches yet" message.
  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-gray-500 dark:text-gray-400">
        <p className="text-sm font-medium">Couldn't load training batches.</p>
        <button
          type="button"
          onClick={() => loadBatches()}
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Create form. It is opened by the button in the page header. */}
      <div id="createBatchPanel">
        <InlineCreatePanel
          open={createOpen}
          onClose={onCreateClose}
          initialData={createBatchPrefillData}
          // The list is already updated on screen, so only reload the area/sub-area/
          // module list (a new one may have been added).
          onSaved={() => { retryHierarchies(); }}
          onOptimisticBatchUpdate={applyOptimisticBatchUpdate}
        />
      </div>

      {/* "Select all pending" bar for pending requests in all visible batches. */}
      {canManageApprovals && totalPendingCount > 0 && !hideApprovals ? (
        <div
          role="status"
          className="shrink-0 flex items-start gap-2.5 rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-950 dark:text-amber-100 transition-colors duration-200"
        >
          <ApprovalCheckbox
            className="mt-0.5"
            checked={masterSelectState.checked}
            indeterminate={masterSelectState.indeterminate}
            disabled={
              isPendingApprovalsScope
                ? visiblePendingIds.length === 0
                : livePendingApprovalBatches.hasOrphans
            }
            onChange={() => {
              if (!isPendingApprovalsScope) {
                // A pending batch can match the filters but still be on another page. So,
                // unless the pending view is on, switch to it (page 1, batches open).
                setSearchQueryValue("");
                setDebouncedSearch("");
                setSearchOpenValue(false);
                applyPendingApprovalsScope(livePendingApprovalBatches.matched);
                toggleMany((actionableRequests || []).map((request) => String(request.id)));
              } else {
                toggleMany(visiblePendingIds);
              }
            }}
            aria-label={
              isPendingApprovalsScope
                ? "Select all pending approvals on this page"
                : "Show and select all pending approvals"
            }
          />
          <FiAlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <p className="min-w-0 flex-1 text-sm leading-snug">
            <span className="font-semibold">
              {bannerPendingCount} pending approval{bannerPendingCount === 1 ? "" : "s"}
            </span>
            {" across "}
            {bannerBatchCount} batch{bannerBatchCount === 1 ? "" : "es"}
            {isPendingApprovalsScope ? (
              ". Select requests below or use this checkbox to select all visible pending items, then approve or reject in bulk."
            ) : (
              // Use the pending-view flag: matching the filters does not mean the batch is
              // on screen.
              ` — not yet shown below. Check the box to show and select ${
                totalPendingCount === 1 ? "it" : "them"
              }, then approve or reject in bulk.`
            )}
          </p>
        </div>
      ) : canManageApprovals && isPendingApprovalsScope && decisionsByBatch.size > 0 ? (
        <div
          role="status"
          className="shrink-0 flex items-start gap-2.5 rounded-lg border border-green-200 dark:border-green-800/60 bg-green-50 dark:bg-green-950/40 px-3 py-2 text-sm text-green-950 dark:text-green-100 transition-colors duration-200"
        >
          <FiCheckCircle className="h-4 w-4 mt-0.5 shrink-0 text-green-600 dark:text-green-400" aria-hidden />
          <p className="min-w-0 flex-1 text-sm leading-snug">
            <span className="font-semibold">All caught up</span>
            {` — you approved ${reviewedTotals.approved} and rejected ${reviewedTotals.rejected} this visit. Your decisions are shown below.`}
          </p>
        </div>
      ) : null}

      {/* Edit form (the same form as Create), shown at the top of the list. */}
      <div ref={editPanelRef} id="editBatchPanel">
        <InlineCreatePanel
          open={editingBatch != null}
          onClose={() => setEditingBatch(null)}
          onSaved={() => { retryHierarchies(); }}
          mode="edit"
          initialData={editingBatch}
          onEnrollmentCountDelta={applyEnrollmentCountDelta}
          onOptimisticBatchUpdate={applyOptimisticBatchUpdate}
          cachedEnrollments={editingBatch ? enrollmentsCache[editingBatch.batch_id] : undefined}
          hasEnrollmentsError={editingBatch ? enrollmentsErrorIds.has(editingBatch.batch_id) : false}
          onFetchEnrollments={fetchEnrollmentsFor}
          onEnrollmentsCacheUpdate={updateEnrollmentsCache}
          onInvalidateEnrollments={invalidateEnrollments}
        />
      </div>

      {/* "Scope" tag when a link opened many batches. Darker than filter chips
          because it is the main reason the list is filtered. */}
      {activeScope && (
        <div className="shrink-0 flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 font-semibold pl-2.5 pr-1 py-0.5 text-xs">
            Scope: {activeScope.label}
            <button type="button" onClick={isPendingApprovalsScope && onPendingScopeClose ? onPendingScopeClose : clearScope} aria-label="Clear scope" className="p-0.5 rounded-full hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors">
              <FiX className="h-3 w-3" />
            </button>
          </span>
        </div>
      )}

      {/* Active filter chips */}
      {activeFilterChips.length > 0 && (
        <div className="shrink-0 flex flex-wrap items-center gap-1.5">
          {activeFilterChips.map((chip) => (
            <span key={chip.key} className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 pl-2.5 pr-1 py-0.5 text-xs">
              {chip.label}
              <button type="button" onClick={chip.clear} className="p-0.5 rounded-full hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors">
                <FiX className="h-3 w-3" />
              </button>
            </span>
          ))}
          <button type="button" onClick={clearAllFilters} className="text-xs text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 ml-1">
            Clear all
          </button>
        </div>
      )}

      {/* Shown when no Open/In Progress batches exist and Completed ones are
          shown instead. */}
      {statusFallbackApplied && (
        <div className="shrink-0 flex items-center gap-1.5 rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs px-3 py-1.5">
          <FiInfo className="h-3.5 w-3.5 shrink-0" />
          No Open / In Progress batches found for this selection — showing Completed batches instead.
        </div>
      )}

      {/* Table or empty state */}
      {filteredBatches.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
          {debouncedSearch ? (
            <FiSearch className="w-10 h-10 mb-3 opacity-40" aria-hidden="true" />
          ) : (
            <svg className="w-12 h-12 mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          )}
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            {debouncedSearch
              ? `No batches match “${debouncedSearch}”`
              : isPendingApprovalsScope
                ? "No pending approvals — you're all caught up!"
                : activeFilterChips.length > 0 || activeScope
                  ? "No batches match your filters"
                  : mandatoryScopeBatchNums ? "No batches to show" : "No batches created yet"}
          </p>
          {/* Show a "clear search" link only when there is a search. */}
          {debouncedSearch ? (
            <button type="button" onClick={clearAllFilters} className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline">
              Clear search and filters
            </button>
          ) : isPendingApprovalsScope ? null : activeFilterChips.length > 0 || activeScope ? (
            <button type="button" onClick={clearAllFilters} className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline">
              Clear all filters
            </button>
          ) : mandatoryScopeBatchNums ? null : (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Click "+ Create Batch" above to get started</p>
          )}
        </div>
      ) : (
        <>
          {/* shrink-0 stops a second scrollbar inside the page. */}
          <div className="shrink-0 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            {/* table-fixed with % widths keeps each column the same share of the
                width at any zoom level. */}
            <table className="w-full table-fixed text-sm text-left" aria-label="Training batches list">
              <caption className="sr-only">List of training batches with description, module, training mode, status, dates and enrollment progress</caption>
              <thead className="bg-gray-50 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700">
                <tr className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <th scope="col" className="px-3 py-2 w-[3%]" title="Click any row to view details"><span className="sr-only">Expand</span></th>
                  <th scope="col" className="px-3 py-2 w-[13%] whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 normal-case tracking-normal">
                      <span className="uppercase tracking-wider">Batch Number</span>
                      <ColumnFilterIcon
                        mode="multiple"
                        label="batch number"
                        options={filterOptions.batches}
                        value={filters.batch}
                        // The "Scope" tag sets this filter itself, so do not show a count badge.
                        count={activeScope ? 0 : filters.batch.length}
                        onChange={(values) => setFilterValues("batch", values)}
                      />
                    </span>
                  </th>
                  <th scope="col" className="px-3 py-2 w-[14%]">Description</th>
                  <th scope="col" className="px-3 py-2 w-[17%]">
                    <span className="inline-flex items-center gap-1 normal-case tracking-normal">
                      <span className="uppercase tracking-wider">Module</span>
                      <ColumnFilterIcon
                        mode="multiple"
                        label="module"
                        options={filterOptions.modules}
                        value={filters.module}
                        count={filters.module.length}
                        onChange={(values) => setFilterValues("module", values)}
                      />
                    </span>
                  </th>
                  <th scope="col" className="px-3 py-2 w-[8%] whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 normal-case tracking-normal">
                      <span className="uppercase tracking-wider">Quarter</span>
                      <ColumnFilterIcon
                        mode="multiple"
                        label="quarter"
                        options={filterOptions.quarters}
                        value={filters.quarter}
                        count={filters.quarter.length}
                        onChange={(values) => setFilterValues("quarter", values)}
                      />
                    </span>
                  </th>
                  <th scope="col" className="px-3 py-2 w-[11%] whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 normal-case tracking-normal">
                      <span className="uppercase tracking-wider">Batch Status</span>
                      <ColumnFilterIcon
                        mode="multiple"
                        label="batch status"
                        options={batchStatusOptions}
                        value={filters.status}
                        count={filters.status.length}
                        onChange={(values) => setFilterValues("status", values)}
                      />
                    </span>
                  </th>
                  <th scope="col" className="px-3 py-2 w-[13%] overflow-hidden">
                    <div className="leading-tight space-y-0.5">
                      <div className="whitespace-nowrap">Enrollments</div>
                      <div className="whitespace-nowrap">/ Not Completed</div>
                    </div>
                  </th>
                  <th scope="col" className="px-3 py-2 w-[11%]">Status Remark</th>
                  <th scope="col" className="px-3 py-2 w-[10%] text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((b, idx) => (
                  <BatchRow
                    key={b.batch_id}
                    hideApprovals={hideApprovals}
                    reviewedDecisions={decisionsByBatch.get(String(b.batch_num))}
                    batch={b}
                    idx={idx}
                    firstRowRef={firstRowRef}
                    expandedId={expandedId}
                    deletingId={deletingId}
                    setDeletingId={setDeletingId}
                    toggleRow={toggleRow}
                    openEdit={openEdit}
                    handleDeleteConfirm={handleDeleteConfirm}
                    loadBatches={loadBatches}
                    canEditBatch={canEditBatch}
                    canDeleteBatch={canDeleteBatch}
                    detailRowRefs={detailRowRefs}
                    debouncedSearch={debouncedSearch}
                    truncatedCells={truncatedCells}
                    openTextPopoverKey={openTextPopoverKey}
                    setOpenTextPopoverKey={setOpenTextPopoverKey}
                    textCellRefs={textCellRefs}
                    textTriggerRefs={textTriggerRefs}
                    infoButtonRefs={infoButtonRefs}
                    hoverBatchId={hoverBatchId}
                    setHoverBatchId={setHoverBatchId}
                    enrollmentsCache={enrollmentsCache}
                    enrollmentsErrorIds={enrollmentsErrorIds}
                    fetchEnrollmentsFor={fetchEnrollmentsFor}
                    updateEnrollmentsCache={updateEnrollmentsCache}
                    invalidateEnrollments={invalidateEnrollments}
                    applyEnrollmentCountDelta={applyEnrollmentCountDelta}
                    approvalsExpandedBatchIds={approvalsExpandedBatchIds}
                    toggleApprovalsExpanded={toggleApprovalsExpanded}
                    getScopeState={getScopeState}
                    toggleMany={toggleMany}
                    isSelected={isSelected}
                    toggleOne={toggleOne}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Page buttons. Not sticky: an open row can be taller than the screen,
              and a sticky bar would then cover other rows. */}
          <div ref={paginationFooterRef} className="flex items-center justify-between mt-1.5 px-1 py-1.5 text-xs text-gray-500 dark:text-gray-400">
            <span>
              {(safePage - 1) * rowsPerPage + 1}–{Math.min(safePage * rowsPerPage, filteredBatches.length)} of {filteredBatches.length} batches
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="px-2.5 py-1 rounded border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Previous page"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <span className="px-2 tabular-nums" aria-live="polite">{safePage} / {totalPages}</span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="px-2.5 py-1 rounded border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Next page"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Spacer so the floating bulk bar does not cover pagination on narrow viewports */}
      {selectedCount > 0 ? <div className="h-20 sm:h-16 shrink-0" aria-hidden="true" /> : null}

      <ApprovalsBulkActionBar
        selectedCount={selectedCount}
        batchSpan={selectedBatchSpan}
        onApprove={handleBulkApprove}
        onReject={handleBulkReject}
        onClear={clearApprovalSelection}
      />
    </>
  );
});

export default BatchTable;
