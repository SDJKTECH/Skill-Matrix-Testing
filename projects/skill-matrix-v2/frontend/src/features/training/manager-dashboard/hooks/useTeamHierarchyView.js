import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { findNodeById, getDirectReportsFromHierarchy } from "../../../../helper/hierarchyUtils";
import { countTrainingBuckets } from "../../shared/config/trainingStatusBuckets";
import { getTrainingBucketsForScope } from "../services/trainingProgressAggregation";
import {
  buildEmployeeSearchIndex,
  employeeMatchesListFilters,
  filterByTrainingStatus,
  filterEmployeeRowsBySearch,
  filterByStatusBucket,
  hasActiveListFilters,
} from "../services/employeeListFilters";
import { collectPendingTrainingRequests } from "../services/pendingRequests";
import { normalizeTrainingRecord } from "../../shared/config/trainingRecordAdapter";
import { normalizeCertRecord } from "../../shared/config/certRecordAdapter";
import { isTestOrPlaceholderRecord } from "../services/testDataFilters";

// Cap on rendered global-search result cards — globalSearchTotalCount
// below still reports the true count for "showing 50 of 128".
const GLOBAL_SEARCH_RESULT_CAP = 50;

function buildRowFromRaw(raw, pendingCountByEmployeeId, subtreePendingById) {
  const trainingArray = (raw.trainings?.trainingArray || []).filter(
    (t) => !isTestOrPlaceholderRecord(normalizeTrainingRecord(t))
  );
  const counts = countTrainingBuckets(trainingArray);
  const certifications = (raw.certifications?.certificationArray || []).filter(
    (c) => !isTestOrPlaceholderRecord(normalizeCertRecord(c))
  );
  const reportCount = raw.associates?.associateCount ?? getDirectReportsFromHierarchy(raw).length;
  const isManager = reportCount > 0;
  const id = raw.id;
  return {
    id,
    name: raw.name || "Unknown",
    role: raw.role || "Employee",
    empId: raw.empId,
    counts,
    // Only the count is surfaced here (EmployeeRow's badge row) — the full
    // skillArray stays on rawNode below; nothing in Manager Dashboard needs
    // per-skill detail today, only the number.
    skillCount: raw.skills?.activeSkillsCount ?? 0,
    // Breakdown for the Skills badge's hover tooltip (EmployeeRow.jsx) —
    // same 3 fields computeStatsFromTeam already sums across a whole team,
    // just kept per-employee here instead of aggregated away.
    skillLevelBreakdown: {
      l1: raw.skills?.l1Count ?? 0,
      l2: raw.skills?.l2Count ?? 0,
      l3: raw.skills?.l3Count ?? 0,
    },
    trainings: trainingArray,
    certifications,
    reportCount,
    isManager,
    pendingCount: pendingCountByEmployeeId.get(String(id)) || 0,
    subtreePendingCount: subtreePendingById.get(String(id)) || 0,
    rawNode: raw,
  };
}

function buildSubtreeMaps(hierarchyData, filters, pendingCountByEmployeeId) {
  const subtreePendingById = new Map();
  const visibleById = new Map();

  function analyze(raw) {
    const row = buildRowFromRaw(raw, pendingCountByEmployeeId, subtreePendingById);
    const children = getDirectReportsFromHierarchy(raw);
    let subtreePending = row.pendingCount;
    let anyVisible = employeeMatchesListFilters(row, filters);

    for (const child of children) {
      const childResult = analyze(child);
      subtreePending += childResult.subtreePending;
      if (childResult.visible) anyVisible = true;
    }

    subtreePendingById.set(String(raw.id), subtreePending);
    visibleById.set(String(raw.id), anyVisible);
    return { subtreePending, visible: anyVisible };
  }

  for (const direct of getDirectReportsFromHierarchy(hierarchyData)) {
    analyze(direct);
  }

  return { subtreePendingById, visibleById };
}

/**
 * Single source of truth for the Manager Dashboard "By Employee" roster:
 * breadcrumb drill-down (Entire Team), flat direct-only list (Direct
 * Reports), global hierarchy search, and descendant-aware status filters.
 */
export function useTeamHierarchyView(hierarchyData, filters, scope = "all") {
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [viewRoot, setViewRoot] = useState(hierarchyData);
  const [drillError, setDrillError] = useState(null);

  const drillingEnabled = scope === "all";
  const searchQuery = (filters.search || "").trim();

  // hierarchyData gets a brand-new object reference on every
  // ManagerApprovalsContext refetch (on mount, and again right after this
  // manager's own approve/reject — see its own doc comment; this used to
  // also happen on a recurring background poll, since removed) even when
  // nothing in the tree actually changed. Reading it through a ref here
  // (rather than closing over it directly) keeps loadDrillRoot/drillUpTo's
  // own identities stable across those refetches — always the LATEST data
  // at call time, just not a new function every time it resolves. Without
  // this, loadDrillRoot depending on hierarchyData directly meant a fresh
  // identity every refetch → drillUpTo (depends on loadDrillRoot) →
  // breadcrumbItems (depends on drillUpTo) all got new references → that
  // flowed into TeamTrainingStatusCard.jsx as a "changed" breadcrumbs
  // prop, and THAT component's own scroll-reset effect (keyed on
  // breadcrumbs) fired too — the actual mechanism behind the reported
  // "scrolls back up on its own" bug (worse when this ran on a 3s poll;
  // still a real risk on any refetch, which is why this ref stays).
  const hierarchyDataRef = useRef(hierarchyData);
  useEffect(() => { hierarchyDataRef.current = hierarchyData; }, [hierarchyData]);

  // Keeps viewRoot pointed at whatever's CURRENTLY drilled into, re-resolved
  // against the latest hierarchyData every time it refreshes — a manager
  // drilled into a sub-team still sees live data, not a snapshot frozen the
  // moment they drilled in. Deliberately does NOT touch breadcrumbs (see
  // the scope-only effect below) — this used to be one combined effect
  // keyed on [hierarchyData, scope] that reset breadcrumbs to root on
  // every single refetch, silently discarding a manager's drill-down
  // position.
  useEffect(() => {
    if (breadcrumbs.length === 0) {
      setViewRoot(hierarchyData);
      return;
    }
    const targetId = breadcrumbs[breadcrumbs.length - 1].id;
    const node = findNodeById(hierarchyData, targetId);
    if (node) {
      setDrillError(null);
      setViewRoot(node);
    } else {
      // The drilled-into employee no longer resolves in the latest tree
      // (removed from this manager's team, etc.) — fall back to root
      // rather than silently keep showing a stale, now-orphaned subtree.
      setDrillError(`Could not find employee ${targetId} in the loaded hierarchy`);
      setViewRoot(hierarchyData);
    }
  }, [hierarchyData, breadcrumbs]);

  // Scope changing (Direct Reports <-> Entire Team) is a genuine navigation
  // reset, unlike a background data refresh — always jump back to root.
  useEffect(() => {
    setBreadcrumbs([]);
    setDrillError(null);
  }, [scope]);

  // Drilling into a sub-manager's team needs no network round-trip: the
  // whole tree this manager can see is already resident client-side from
  // the one get_combined_hierarchy_v2 fetch (see findNodeById's own doc
  // comment in hierarchyUtils.js) — the backend has no rootEmployeeId
  // re-rooting support to call into anyway (confirmed directly against
  // backend/aggregations/getCombinedHierarchy_v2/main.py, which only ever
  // reads `employeeId` from the request body).
  const loadDrillRoot = useCallback((rootEmployeeId) => {
    const node = findNodeById(hierarchyDataRef.current, rootEmployeeId);
    if (!node) {
      setDrillError(`Could not find employee ${rootEmployeeId} in the loaded hierarchy`);
      return;
    }
    setDrillError(null);
    setViewRoot(node);
  }, []);

  const drillInto = useCallback((id, name) => {
    if (!drillingEnabled) return;
    setBreadcrumbs((prev) => [...prev, { id, name }]);
    loadDrillRoot(id);
  }, [drillingEnabled, loadDrillRoot]);

  // Reads breadcrumbsRef rather than closing over breadcrumbs directly, so
  // drillUpTo's own identity doesn't need breadcrumbs as a dependency
  // either — same reasoning as hierarchyDataRef above, and keeps the
  // side-effecting loadDrillRoot() call in the function body instead of
  // inside a setBreadcrumbs updater (updater functions are expected to
  // stay pure).
  const breadcrumbsRef = useRef(breadcrumbs);
  useEffect(() => { breadcrumbsRef.current = breadcrumbs; }, [breadcrumbs]);

  const drillUpTo = useCallback((index) => {
    if (!drillingEnabled) return;
    if (index < 0) {
      setBreadcrumbs([]);
      setViewRoot(hierarchyDataRef.current);
      setDrillError(null);
      return;
    }
    const nextCrumbs = breadcrumbsRef.current.slice(0, index + 1);
    setBreadcrumbs(nextCrumbs);
    loadDrillRoot(nextCrumbs[nextCrumbs.length - 1].id);
  }, [drillingEnabled, loadDrillRoot]);

  const navigateToAncestors = useCallback((ancestors) => {
    if (!drillingEnabled) return;
    if (!ancestors?.length) {
      drillUpTo(-1);
      return;
    }
    setBreadcrumbs(ancestors);
    loadDrillRoot(ancestors[ancestors.length - 1].id);
  }, [drillingEnabled, drillUpTo, loadDrillRoot]);

  const pendingCountByEmployeeId = useMemo(() => {
    const map = new Map();
    const pendingScope = scope === "all" ? "all" : "direct";
    for (const req of collectPendingTrainingRequests(hierarchyData, pendingScope)) {
      const key = String(req.employeeId);
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [hierarchyData, scope]);

  const { subtreePendingById, visibleById } = useMemo(
    () => buildSubtreeMaps(hierarchyData, filters, pendingCountByEmployeeId),
    [hierarchyData, filters.statusBucket, filters.statusLabels, pendingCountByEmployeeId]
  );

  // StatusTabs badge counts scoped to the CURRENT drill position — "all"
  // recurses the whole drilled subtree (same semantics as the root-level
  // "Entire Team" total in useTeamScopeSummary.js, just re-rooted at
  // viewRoot instead of the manager's own top), "direct" never drills (see
  // drillingEnabled above) so hierarchyData IS the current position already.
  // Root is picked per-branch BEFORE calling the shared
  // getTrainingBucketsForScope (unlike useTeamScopeSummary.js/
  // useTrainingBatchGroups.js, which always pass hierarchyData) — those two
  // hooks have no drill position to re-root against.
  const scopedRoot = scope === "all" ? viewRoot : hierarchyData;
  const { counts } = useMemo(() => getTrainingBucketsForScope(scopedRoot, scope), [scopedRoot, scope]);

  const byReporteeUnfiltered = useMemo(() => {
    const root = drillingEnabled ? viewRoot : hierarchyData;
    return getDirectReportsFromHierarchy(root).map((raw) =>
      buildRowFromRaw(raw, pendingCountByEmployeeId, subtreePendingById)
    );
  }, [viewRoot, hierarchyData, drillingEnabled, pendingCountByEmployeeId, subtreePendingById]);

  const listFiltersActive = hasActiveListFilters(filters);

  const rows = useMemo(() => {
    let list = byReporteeUnfiltered;

    if (listFiltersActive && drillingEnabled) {
      list = list.filter((row) => visibleById.get(String(row.id)));
    } else {
      list = filterByStatusBucket(list, filters.statusBucket);
      list = filterByTrainingStatus(list, filters.statusLabels);
    }

    if (searchQuery) {
      list = filterEmployeeRowsBySearch(list, searchQuery);
    }

    return [...list].sort((a, b) => {
      const pct = (r) => (r.counts.assigned > 0 ? r.counts.completed / r.counts.assigned : 0);
      return pct(b) - pct(a);
    });
  }, [
    byReporteeUnfiltered,
    filters.statusBucket,
    filters.statusLabels,
    filters.search,
    listFiltersActive,
    drillingEnabled,
    visibleById,
    searchQuery,
  ]);

  const searchIndex = useMemo(() => buildEmployeeSearchIndex(hierarchyData), [hierarchyData]);

  // Unsliced — globalSearchTotalCount below needs the true match count.
  const globalSearchMatches = useMemo(() => {
    if (!searchQuery || !drillingEnabled) return [];
    const q = searchQuery.toLowerCase();
    return searchIndex.filter((entry) => (entry.name || "").toLowerCase().includes(q));
  }, [searchIndex, searchQuery, drillingEnabled]);

  const globalSearchResults = useMemo(
    () => globalSearchMatches.slice(0, GLOBAL_SEARCH_RESULT_CAP),
    [globalSearchMatches]
  );
  const globalSearchTotalCount = globalSearchMatches.length;

  const isGlobalSearchActive = Boolean(searchQuery && drillingEnabled);

  const breadcrumbItems = useMemo(
    () => [
      { key: "root", label: "All Direct Reports", onClick: () => drillUpTo(-1) },
      ...breadcrumbs.map((c, idx) => ({
        key: String(c.id),
        label: `${c.name}'s Team`,
        onClick: () => drillUpTo(idx),
      })),
    ],
    [breadcrumbs, drillUpTo]
  );

  return {
    breadcrumbs: breadcrumbItems,
    isRoot: breadcrumbs.length === 0,
    // The currently drilled-into subtree root node itself (not just its id
    // via breadcrumbs) — callers that need to re-aggregate stats scoped to
    // "wherever the manager is currently browsing" (KPI row, Team Alerts,
    // Top Skill Domains, Skill Level Distribution — see ManagerDashboard.jsx)
    // pass this straight into getScopedTeamFromHierarchy/computeStatsFromTeam
    // rather than re-deriving it from breadcrumb ids.
    viewRoot,
    drillingEnabled,
    drillInto,
    drillUpTo,
    navigateToAncestors,
    rows,
    counts,
    drillError,
    globalSearchResults,
    globalSearchTotalCount,
    isGlobalSearchActive,
    searchQuery,
    pendingCountByEmployeeId,
  };
}
