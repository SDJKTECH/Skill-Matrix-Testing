import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiActivity, FiAward, FiBook, FiUsers, FiInbox, FiGlobe } from "react-icons/fi";
import DashboardHeader from "./DashboardHeader";
import FilterChip from "../../shared/components/filters/FilterChip";
import SelfManagerToggle from "../../shared/components/SelfManagerToggle";
import KpiHero from "./KpiHero";
import TeamTrainingStatusCard from "./TeamTrainingStatusCard";
import SkillDomainsCard from "./SkillDomainsCard";
import SkillLevelDistributionCard from "./SkillLevelDistributionCard";
import TeamAlertsCard from "./TeamAlertsCard";
import ManagerAlertBanner from "./ManagerAlertBanner";
import { useTeamScopeSummary } from "../hooks/useTeamScopeSummary";
import { useTeamHierarchyView } from "../hooks/useTeamHierarchyView";
import { useTrainingBatchGroups } from "../hooks/useTrainingBatchGroups";
import { useBatchByNum } from "../hooks/useBatchByNum";
import { useGoToTrainingBatches } from "../../../../hooks/useGoToTrainingBatches";
import { BATCH_SCOPE } from "../../training-batch/services/batchScopes";
import { BATCH_VIEW_ORIGIN } from "../../training-batch/services/batchViewOrigin";
import { getDirectReportStatsFromHierarchy, getManagerStatsFromHierarchy, getScopedTeamFromHierarchy, computeStatsFromTeam, findNodeById } from "../../../../helper/hierarchyUtils";
import { normalizeTrainingList, toEntityCardProps } from "../../shared/config/trainingRecordAdapter";
import useUrlSearchParam from "../../shared/hooks/useUrlSearchParam";
import { isTestOrPlaceholderRecord } from "../services/testDataFilters";
import { applyTrainingReviewResults } from "../services/hierarchyPatching";
import { useManagerApprovals } from "../../../../context/ManagerApprovalsContext";

// Pure DOM helper — no dependency on this component's props/state, so it's
// a module-level function rather than recreated every render (and
// exempted from every useCallback deps array below by construction,
// instead of needing its own memoization to stay stable).
function scrollToSection(ref) {
  ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * Manager Dashboard — thin composer: a title row (Self/Manager toggle
 * anchored at its end, since that toggle changes the whole page's
 * meaning), then a KPI row (5 tiles, config-driven — see KpiHero.jsx;
 * Pending Approvals is one of them, not a separate bell button, so it
 * shares the same labeled, consistently-sized tile format as the other 4
 * instead of being a small icon-only outlier). Search and
 * Filters live inside TeamTrainingStatusCard's own header instead of up
 * here — they only ever affect that card's rows (see
 * TeamTrainingStatusCard.jsx's doc comment), so anchoring them to it keeps
 * their effect visually obvious instead of floating disconnected from any
 * specific content. Below that: direct-reports training status in the left
 * column, and a STICKY right rail (Team Alerts, Top Skill
 * Domains, Skill Level Distribution) that stays visible while the left
 * column scrolls — a subtle left border + `lg:sticky` gives it a clear,
 * intentional anchor instead of just floating disconnected from the
 * scrolling content. Team Alerts leads the rail (most actionable/
 * time-sensitive for a manager scanning daily); Top Skill Domains sits
 * here (not below the team list) specifically so it's visible without
 * scrolling, grouped next to its natural pair, Skill Level Distribution.
 *
 * All data-fetching/aggregation/filtering lives in dedicated hooks, never
 * computed inline in render — useTeamScopeSummary.js (root-scoped status
 * badge counts), useTeamHierarchyView.js (the "By Employee" view's
 * breadcrumb-driven roster), useTrainingBatchGroups.js (the "By Training"
 * view's batch groups + approve/reject), and useBatchByNum.js (shared
 * batch metadata, consumed by both views). This component only composes.
 *
 * Direct/Entire Team scope (see the toggle inside TeamTrainingStatusCard):
 * previously the KPI/alerts/domains/distribution cards always reflected
 * the manager's ENTIRE recursive team (managerStats, computed upstream in
 * HomeScreen.jsx) while the team list below only ever showed DIRECT
 * reports — two different scopes shown side by side with no way to
 * reconcile them. `scope` now drives both consistently: "all" reuses the
 * already-computed `managerStats` prop as-is; "direct" computes an
 * equivalent via getDirectReportStatsFromHierarchy (hierarchyUtils.js) off
 * the same raw hierarchyDataForTrainingWidget already passed in for the
 * drill-down table.
 * `scope` is otherwise orthogonal to hierarchy drill-down (see
 * TeamTrainingStatusCard.jsx's doc comment) and to `viewMode` (By
 * Employee's breadcrumb browse vs. By Training's batch groups — both read
 * the same underlying hierarchy/nomination data, no duplicated model).
 * The toolbar bell is a single glanceable entry point into Training Batches
 * (where per-batch pending-approval banners live) — it does not open a
 * separate Approvals panel on this dashboard.
 *
 * Props:
 *   managerStats  — output of getManagerStatsFromHierarchy()
 *   homeViewMode  — "self" | "manager"
 *   setHomeViewMode — setter
 *   hierarchyDataForTrainingWidget — live hierarchy from get_combined_hierarchy_v2; feeds the team list and drill-down table
 *   isManager     — if true, show Self/Manager toggle (only managers see it)
 */
export default function ManagerDashboard({
  managerStats,
  homeViewMode,
  setHomeViewMode,
  hierarchyDataForTrainingWidget,
  isManager = true,
}) {
  // Pulled up here (not left where useManagerApprovals() is called for its
  // other fields, further below) specifically because orgWideView/
  // canViewOrgWide are read synchronously during render just below (the
  // alertFilter-reset effect's own dependency array, and pillValue) — a
  // real bug this used to have: declaring this later meant referencing
  // orgWideView here hit the temporal dead zone on EVERY render (a
  // ReferenceError, not just a stale-closure risk), crashing the whole
  // component to a blank page the instant Manager Dashboard mounted.
  const { orgWideView, setOrgWideView, canViewOrgWide } = useManagerApprovals();

  // "direct" (default) | "all" — direct reports only vs the manager's
  // entire recursive team. Drives the team list AND the KPI/alerts/
  // domains/distribution cards uniformly, so they never show numbers for
  // one scope while the list shows another.
  const [scope, setScope] = useState("all");
  // "employee" (default) | "training" — see TeamTrainingStatusCard.jsx's
  // own doc comment for the full breakdown of what each view shows and how
  // it relates to `scope`/breadcrumb drill-down.
  const [viewMode, setViewMode] = useState("employee");
  const [statusBucket, setStatusBucket] = useState("assigned");
  // Which of the three "absence" Team Alerts (no certifications/trainings/
  // skills) is currently active, if any — null | { key, label, noun,
  // items }. See TeamTrainingStatusCard.jsx's own doc comment for why these
  // replace the team list with a filtered matches-only view rather than a
  // separate destination. The 4th alert (associates undergoing training)
  // doesn't use this at all — it reuses the existing By Training / "In
  // Progress" status tab instead (see handleUndergoingTrainingAlert below),
  // since that's a real, already-navigable filter with no nesting-depth
  // problem to solve. Cleared on scope change since the captured `items`
  // snapshot is scope-specific (direct vs. entire team) and would
  // otherwise silently go stale.
  const [alertFilter, setAlertFilter] = useState(null);
  useEffect(() => {
    setAlertFilter(null);
  }, [scope, orgWideView]);

  // The scope pill (SegmentedToggle in TeamTrainingStatusCard.jsx) shows 3
  // options to an Admin — Direct Reports / Entire Team / Entire
  // Organization — but `scope` itself stays the original 2-value enum
  // ("direct"|"all") on purpose: useTeamScopeSummary/useTeamHierarchyView/
  // useTrainingBatchGroups all have hardcoded `scope === "all"` checks
  // (drilling, pending-count scoping, root selection), not `!== "direct"`
  // ones — a real 3rd scope value would silently break those. "Entire
  // Organization" is really "Entire Team" (scope="all", so those hooks
  // behave exactly as they already do) PLUS orgWideView=true, a fully
  // orthogonal axis (which employee the fetched TREE is rooted at,
  // owned by ManagerApprovalsContext — see its own doc comment) layered on
  // top. `pillValue` below reconstructs the 3rd option for display; this
  // function is the one place that decomposes it back into the two real,
  // independent pieces of state.
  const handleScopeChange = (pillKey) => {
    if (pillKey === "org") {
      setScope("all");
      setOrgWideView(true);
    } else {
      setScope(pillKey);
      setOrgWideView(false);
    }
    setSearch("");
    setSearchOpen(false);
  };
  // What the pill should show as selected — "org" wins over the real
  // `scope` value whenever org-wide is active, since that's the
  // user-facing choice even though scope itself is just "all" underneath.
  const pillValue = orgWideView ? "org" : scope;

  // An Admin with no direct reports reaches this page via SelfManagerToggle
  // alone (isManager||canViewOrgWide, see SelfDashboard.jsx) — Direct
  // Reports/Entire Team would just be empty for them, so default straight
  // to Entire Organization once, on mount, rather than landing them on a
  // page that looks broken until they find the pill themselves. A real
  // manager who also happens to be an Admin is unaffected (isManager is
  // true, this only fires for the non-manager case) and can still freely
  // switch away from org-wide afterward via the same pill.
  useEffect(() => {
    if (!isManager && canViewOrgWide) handleScopeChange("org");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // md_ prefix, not bare "q" — see useUrlSearchParam's doc comment (this is
  // a tabbed SPA with no route change between pages, so each page needs
  // its own param name to avoid leaking search state into another tab).
  const [search, setSearch] = useUrlSearchParam("md_q");
  const [searchOpen, setSearchOpen] = useState(false);
  // Active global-search result index for keyboard cycling
  // (EmployeeList.jsx's listbox) — resets whenever search changes.
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  useEffect(() => {
    setActiveResultIndex(0);
  }, [search]);
  // Opening search hides the status-bucket tabs (TeamTrainingStatusCard —
  // they lose the width fight against the search UI, and a global name
  // search ignores status anyway) — reset the bucket alongside them so a
  // previously-selected one (e.g. "Completed") can't keep silently
  // narrowing `rows` with no visible control left to show or clear it.
  const handleSearchOpenChange = (open) => {
    setSearchOpen(open);
    if (open) setStatusBucket("assigned");
  };
  const [statusLabels, setStatusLabels] = useState([]);
  const goToTrainingBatches = useGoToTrainingBatches();
  const {
    hierarchyData: sharedHierarchyData,
    setHierarchyData: setSharedHierarchyData,
    totalPendingCount,
    subscribeReviewed,
    alertBannerDismissed,
    dismissAlertBanner,
  } = useManagerApprovals();
  const [liveHierarchyData, setLiveHierarchyData] = useState(hierarchyDataForTrainingWidget);

  useEffect(() => {
    setLiveHierarchyData(hierarchyDataForTrainingWidget);
    if (hierarchyDataForTrainingWidget) setSharedHierarchyData(hierarchyDataForTrainingWidget);
  }, [hierarchyDataForTrainingWidget, setSharedHierarchyData]);

  // ManagerApprovalsContext fetches the same combined-hierarchy endpoint
  // once on mount and again immediately after this manager's own
  // approve/reject. Additive alongside the prop-sync effect above (which
  // stays as the initial/HomeScreen-driven source): whichever of the two
  // last resolved with fresher data wins, since both ultimately just call
  // setLiveHierarchyData with a full hierarchy snapshot.
  useEffect(() => {
    if (sharedHierarchyData) setLiveHierarchyData(sharedHierarchyData);
  }, [sharedHierarchyData]);

  useEffect(() => {
    return subscribeReviewed((payload) => {
      setLiveHierarchyData((current) => applyTrainingReviewResults(current, payload));
    });
  }, [subscribeReviewed]);

  const applyReviewedHierarchy = (reviewedPayload) => {
    setLiveHierarchyData((current) => applyTrainingReviewResults(current, reviewedPayload));
  };

  // managerStats (the "all" scope) is already computed upstream in
  // HomeScreen.jsx and passed down — reused as-is rather than recomputed.
  // The "direct" scope has no upstream equivalent, so it's computed here,
  // directly off the same raw hierarchyData this component already
  // receives for the drill-down table.
  const directStats = useMemo(
    () => (liveHierarchyData ? getDirectReportStatsFromHierarchy(liveHierarchyData) : null),
    [liveHierarchyData]
  );
  const scopedManagerStats = useMemo(
    () => (liveHierarchyData ? getManagerStatsFromHierarchy(liveHierarchyData) : managerStats),
    [liveHierarchyData, managerStats]
  );
  const m = scope === "direct" ? directStats : scopedManagerStats;

  const { counts } = useTeamScopeSummary(liveHierarchyData, scope);
  const batchByNum = useBatchByNum();

  // "By Employee" uses useTeamHierarchyView for both scopes: Entire Team
  // enables breadcrumb drill-down; Direct Reports is a flat list only.
  const {
    breadcrumbs: employeeBreadcrumbs,
    drillInto: drillIntoEmployeeTeam,
    navigateToAncestors,
    rows,
    // Drill-scoped StatusTabs badge counts (re-aggregated at the current
    // breadcrumb position) — distinct from `counts` above, which is always
    // root-scoped and stays that way for the "By Training" view. Only used
    // for viewMode "employee" below (see the counts prop passed to
    // TeamTrainingStatusCard).
    counts: employeeCounts,
    drillError: employeeDrillError,
    drillingEnabled,
    globalSearchResults,
    globalSearchTotalCount,
    isGlobalSearchActive,
    searchQuery: hierarchySearchQuery,
    // Current breadcrumb position — feeds drillScopedStats below (KPI row/
    // Team Alerts/Top Skill Domains/Skill Level Distribution all re-root to
    // whatever team the manager is currently browsing into).
    viewRoot,
    isRoot: isAtHierarchyRoot,
  } = useTeamHierarchyView(liveHierarchyData, { search, statusBucket, statusLabels }, scope);

  // Team Alerts / Top Skill Domains / Skill Level Distribution, and the KPI
  // row's own no-filter fallback (see kpiStats below), all re-root to the
  // CURRENT breadcrumb position instead of staying pinned to the full scope
  // — drilling into "Prateek Bhatnagar's Team" should mean every one of
  // those numbers describes that team, not the manager's whole org. Reuses
  // getScopedTeamFromHierarchy the same way getManagerStatsFromHierarchy
  // does, just rooted at viewRoot instead of the top of the tree.
  // Deliberately independent of search/status/alert filters (those stay a
  // KPI-row-ONLY override — see kpiStats) — filtering by "Completed"
  // shouldn't also narrow "employees have no certifications". Training view
  // has no breadcrumb concept of its own (batch grouping is scope-wide, not
  // hierarchy-positional — see useTrainingBatchGroups.js's own comment
  // below), so it always falls back to the full scope root `m`.
  // The scope banner and KPI-row chip need this same condition directly,
  // not just the stats object it produces below — computed once here so
  // drillScopedStats and the two hint UIs can never disagree about whether
  // a drill is actually active right now.
  const isDrilledIntoTeam = viewMode === "employee" && drillingEnabled && !isAtHierarchyRoot && Boolean(viewRoot);
  const currentTeamLabel = isDrilledIntoTeam ? `${viewRoot.name}'s Team` : null;
  const drillScopedStats = useMemo(() => {
    if (!isDrilledIntoTeam) return m;
    return computeStatsFromTeam(getScopedTeamFromHierarchy(viewRoot, "all"), liveHierarchyData);
  }, [isDrilledIntoTeam, viewRoot, liveHierarchyData, m]);

  // Card-ready data behind the "associates currently undergoing training"
  // alert's inline reveal (see alertItems below) — the one alert backed by
  // real records, so it shows actual training cards (EntityCard, same
  // component My Trainings/Employee-view expanded cards use) instead of a
  // plain employee-name list. Batch-merged for full trainer/duration/mode
  // metadata parity, and run through the same seed/QA-fixture filter as
  // every other manager-facing training list (testDataFilters.js).
  // extraMetaFields carries the employee name onto the card itself — unlike
  // every other EntityCard usage on this dashboard, this one grid spans
  // MULTIPLE different people's records, so the card can't rely on a
  // surrounding row/section to say whose training it is. Sourced from
  // drillScopedStats (not `m`) so this alert's own cards stay in sync with
  // the rest of the drill-scoped right rail.
  const undergoingTrainingCards = useMemo(() => {
    const rawRecords = drillScopedStats.alerts.associatesUndergoingTrainingRecords || [];
    return normalizeTrainingList(rawRecords, batchByNum)
      .map((training, i) => ({
        ...training,
        employeeName: rawRecords[i].employeeName,
        employeeId: rawRecords[i].employeeId,
        managerGroup: rawRecords[i].managerGroup,
      }))
      .filter((training) => !isTestOrPlaceholderRecord(training))
      .map((training) => ({
        id: training.id ?? `${training.employeeId}-${training.batch}`,
        employeeId: training.employeeId,
        managerGroup: training.managerGroup,
        cardProps: toEntityCardProps(training, {
          onClick: () => goToTrainingBatches(training.batch, BATCH_VIEW_ORIGIN.MANAGER_DASHBOARD),
          employeeName: training.employeeName,
        }),
      }));
  }, [drillScopedStats, batchByNum, goToTrainingBatches]);

  const handleSearchResultSelect = (result) => {
    navigateToAncestors(result.ancestors);
    setSearch("");
    setSearchOpen(false);
  };

  // "By Training" IS scope-driven (unlike the Direct-scope employee list
  // above) — batch grouping is inherently scope-wide, not
  // hierarchy-positional, so it reads the same root-scoped team
  // useTeamScopeSummary does rather than whatever breadcrumb level
  // Employee view happens to be drilled to. Flat, no domain-category
  // (Cloud/DevOps/Data/...) grouping layer — see TrainingBatchGroupList.jsx.
  const {
    groups: trainingGroups,
  } = useTrainingBatchGroups(liveHierarchyData, scope, batchByNum, { search, statusBucket }, applyReviewedHierarchy);

  // KPI row reflects whatever employee set is actually on screen below it —
  // reusing each view's own already-filtered data (rows/globalSearchResults/
  // trainingGroups/alertFilter.items) rather than re-deriving a filtered
  // team here, so the count can never disagree with what's visibly listed.
  // An actual search/status/alert filter always wins outright over drill
  // position (e.g. isGlobalSearchActive intentionally searches/jumps across
  // the WHOLE hierarchy, not just the current subtree); absent one of
  // those, falls back to drillScopedStats — the current breadcrumb
  // position's own rollup — rather than the full scope root.
  const hasEmployeeFilters = Boolean(search.trim()) || statusBucket !== "assigned" || statusLabels.length > 0;
  const hasTrainingFilters = Boolean(search.trim()) || statusBucket !== "assigned";
  const kpiStats = useMemo(() => {
    if (!liveHierarchyData) return m;

    if (alertFilter) {
      const team = alertFilter.items.map((item) => findNodeById(liveHierarchyData, item.id)).filter(Boolean);
      return computeStatsFromTeam(team, liveHierarchyData);
    }

    if (viewMode === "employee") {
      if (isGlobalSearchActive) {
        const team = globalSearchResults.map((r) => findNodeById(liveHierarchyData, r.id)).filter(Boolean);
        return computeStatsFromTeam(team, liveHierarchyData);
      }
      if (hasEmployeeFilters) {
        const team = rows.map((r) => r.rawNode).filter(Boolean);
        return computeStatsFromTeam(team, liveHierarchyData);
      }
      return drillScopedStats;
    }

    if (viewMode === "training" && hasTrainingFilters) {
      const employeeIds = new Set();
      for (const group of trainingGroups) {
        for (const nominee of group.nominees) employeeIds.add(String(nominee.employeeId));
      }
      const team = [...employeeIds].map((id) => findNodeById(liveHierarchyData, id)).filter(Boolean);
      return computeStatsFromTeam(team, liveHierarchyData);
    }

    return drillScopedStats;
  }, [
    liveHierarchyData,
    alertFilter,
    viewMode,
    isGlobalSearchActive,
    globalSearchResults,
    hasEmployeeFilters,
    rows,
    hasTrainingFilters,
    trainingGroups,
    drillScopedStats,
    m,
  ]);

  // Switching view mode manually clears any active alert filter — showing
  // "22 employees with no certifications" while the Training view's batch
  // groups are also selected would be a confusing combination with no
  // clear surface to render both at once. Also clears statusLabels (the
  // Filters popover's multi-select) since that control is Employee-view-
  // only (TeamTrainingStatusCard.jsx hides it in Training view, having no
  // batch-group analog) — without this, a selection made before switching
  // away would sit inert (not applied to trainingGroups) yet still count
  // toward activeFilterCount/chips if left unguarded there.
  const onViewModeChange = useCallback((mode) => {
    setViewMode(mode);
    setAlertFilter(null);
    setStatusLabels([]);
  }, []);

  // KPI drill-down targets: no new drawers (see OPTIMIZATION_PROGRESS.md's
  // design-proposal writeup) — every KPI reuses a view that's already on
  // this page, either by switching to it (same clearing behavior as
  // manually clicking By Employee/By Training — reuses onViewModeChange
  // itself so a KPI click and a manual toggle click can never leave the
  // page in two different "how did I get here" states) or, for Skills
  // (nothing more detailed than the sidebar's aggregate cards exists
  // anywhere on this page today), just scrolling to where that already is.
  const mainContentRef = useRef(null);
  const sidebarRef = useRef(null);
  // One parameterized helper, not a goToEmployeeView/goToTrainingView pair
  // — Members/Certifications and Trainings only ever differ by which mode
  // they switch to, everything else (scroll target, clearing behavior via
  // onViewModeChange) is identical. A future KPI landing on this same
  // content area is another call site, not another near-duplicate
  // function. useCallback so kpiItems below stays memoized on [kpiStats]
  // alone (see its own comment) — needs stable identity across renders for
  // that to hold.
  const goToMainContent = useCallback((mode) => {
    onViewModeChange(mode);
    scrollToSection(mainContentRef);
  }, [onViewModeChange]);
  const goToSkillsSection = useCallback(() => scrollToSection(sidebarRef), []);

  // KPI config — a new metric is a new entry here, not a new JSX block (see
  // KpiHero.jsx). Memoized since kpiItems feeds both KpiHero and
  // (unrelatedly) gets passed through to TeamTrainingStatusCard's own
  // full-screen-toggle header below — a fresh array identity on every
  // render was two consumers' worth of avoidable re-renders for a value
  // that only actually changes with kpiStats.
  const kpiItems = useMemo(
    () => [
      {
        key: "members",
        icon: FiUsers,
        label: "Team Members",
        value: kpiStats.teamMembers,
        iconBg: "bg-blue-50 dark:bg-blue-900/20",
        iconColor: "text-blue-500 dark:text-blue-400",
        onClick: () => goToMainContent("employee"),
      },
      {
        key: "skills",
        icon: FiActivity,
        label: "Total Skills",
        value: kpiStats.totalSkills.toLocaleString(),
        iconBg: "bg-teal-50 dark:bg-teal-900/20",
        iconColor: "text-teal-500 dark:text-teal-400",
        onClick: goToSkillsSection,
      },
      {
        key: "certs",
        icon: FiAward,
        label: "Total Certifications",
        value: kpiStats.totalCertifications.toLocaleString(),
        iconBg: "bg-amber-50 dark:bg-amber-900/20",
        iconColor: "text-amber-500 dark:text-amber-400",
        onClick: () => goToMainContent("employee"),
      },
      {
        key: "trainings",
        icon: FiBook,
        label: "Total Trainings",
        value: kpiStats.totalTrainings.toLocaleString(),
        iconBg: "bg-rose-50 dark:bg-rose-900/20",
        iconColor: "text-rose-500 dark:text-rose-400",
        onClick: () => goToMainContent("training"),
      },
      // Was a standalone icon-only NotificationBellButton floating past the
      // end of this row — research + user feedback both landed on the same
      // conclusion: an inbox icon alone doesn't read as "pending approvals"
      // (icons aren't a universal language; a bare bell/inbox glyph is
      // ambiguous without a label), and it was also visually the odd one
      // out — a small circle next to 4 much larger, differently-shaped
      // cards. Folding it into this same config-driven grid fixes both at
      // once: same size/shape as its siblings (no separate button to
      // eyeball-match), plus 3 layered cues instead of one lone icon — a
      // permanent visible label (not hover-only), the same chevron
      // affordance the other clickable tiles already use, and the hover
      // tooltip's action-specific detail.
      {
        key: "pendingApprovals",
        icon: FiInbox,
        label: "Pending Approvals",
        value: totalPendingCount.toLocaleString(),
        // Neutral violet at zero (nothing to do); once there's a real
        // count, this switches to the same amber "needs attention" tone
        // BatchPendingApprovalsDisclosure already uses for a pending list
        // elsewhere on this page — one color vocabulary for "review this,"
        // not two. `highlighted` (see KpiHero.jsx) layers on the dot/ring/
        // bold-value treatment on top of this color swap.
        iconBg: totalPendingCount > 0 ? "bg-amber-100 dark:bg-amber-900/30" : "bg-violet-50 dark:bg-violet-900/20",
        iconColor: totalPendingCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-violet-500 dark:text-violet-400",
        highlighted: totalPendingCount > 0,
        onClick: () =>
          goToTrainingBatches(
            { scope: BATCH_SCOPE.PENDING_APPROVALS, batchNums: [], label: "Pending approvals" },
            BATCH_VIEW_ORIGIN.MANAGER_DASHBOARD
          ),
        tooltip:
          totalPendingCount > 0
            ? `${totalPendingCount} pending approval${totalPendingCount === 1 ? "" : "s"} — click to review`
            : "No pending approvals",
      },
    ],
    [kpiStats, goToMainContent, goToSkillsSection, totalPendingCount, goToTrainingBatches]
  );

  // The three ABSENCE alerts (no certifications/trainings/skills) replace
  // Team Training Status's employee list with a matches-only view (see
  // TeamTrainingStatusCard.jsx) rather than a separate restricted screen —
  // there's no dead-end to back out of, just "Clear filter" on the chip.
  // There's no concrete per-person record to show for something someone
  // doesn't have, so listing the affected people directly (instead of e.g.
  // deep-linking to one of them) is the honest option here. Switches to By
  // Employee (the only view a match list can render in) the same way
  // handleUndergoingTrainingAlert switches to By Training — landing on the
  // view that makes the alert visible is just normal navigation, not a
  // restriction. Search/training-status are cleared on activation (not
  // just hidden by TeamTrainingStatusCard) since neither applies to the
  // matches-only view — clearing here, not there, because both live as
  // lifted state in this component.
  const toggleAlertFilter = (key, config) => {
    setAlertFilter((prev) => {
      const next = prev?.key === key ? null : { key, ...config };
      if (next) {
        setSearch("");
        setSearchOpen(false);
        setStatusLabels([]);
      }
      return next;
    });
    setViewMode("employee");
  };

  // associatesUndergoingTraining is the one alert backed by real records
  // (actual in-progress trainings) that already have a home in an existing,
  // fully-native filter: the By Training view's own "In Progress" status
  // tab. Routing through that instead of a bespoke highlight means this
  // alert never restricts anything either — it's just two pieces of
  // already-interactive state (viewMode/statusBucket) set together.
  // Clicking again while already on that exact combination turns it back
  // off (mirrors toggleAlertFilter's own toggle behavior above).
  const handleUndergoingTrainingAlert = () => {
    if (viewMode === "training" && statusBucket === "inProgress") {
      setStatusBucket("assigned");
      return;
    }
    setViewMode("training");
    setStatusBucket("inProgress");
    setAlertFilter(null);
  };
  const isUndergoingTrainingAlertActive = viewMode === "training" && statusBucket === "inProgress";

  const alertItems = [
    {
      key: "noCerts",
      count: drillScopedStats.alerts.noCertifications,
      text: "employees have no certifications.",
      items: drillScopedStats.alerts.noCertificationsEmployees,
      onClick: () =>
        toggleAlertFilter("noCerts", { label: "with no certifications", chipLabel: "No certifications", noun: "employees", items: drillScopedStats.alerts.noCertificationsEmployees }),
    },
    {
      key: "noTrainings",
      count: drillScopedStats.alerts.noTrainings,
      text: "employees missing trainings.",
      items: drillScopedStats.alerts.noTrainingsEmployees,
      onClick: () =>
        toggleAlertFilter("noTrainings", { label: "missing trainings", chipLabel: "Missing trainings", noun: "employees", items: drillScopedStats.alerts.noTrainingsEmployees }),
    },
    {
      key: "noSkills",
      count: drillScopedStats.alerts.noSkills,
      text: "employees missing skills.",
      items: drillScopedStats.alerts.noSkillsEmployees,
      onClick: () =>
        toggleAlertFilter("noSkills", { label: "with no skills", chipLabel: "Missing skills", noun: "employees", items: drillScopedStats.alerts.noSkillsEmployees }),
    },
    {
      key: "undergoingTraining",
      count: drillScopedStats.alerts.associatesUndergoingTraining ?? 0,
      text: "associates currently undergoing training.",
      tone: "info",
      items: undergoingTrainingCards,
      onClick: handleUndergoingTrainingAlert,
    },
  ];

  return (
    <div className="h-full flex flex-col gap-2 p-2.5 text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-900">
      {/* Title on the left, Self/Manager toggle anchored top-right of this
          same row — same position/pattern as SelfDashboard.jsx's header
          (the "other page" this now matches), instead of being grouped
          into the KPI row below. */}
      <div className="shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <DashboardHeader />
        {(isManager || canViewOrgWide) && <SelfManagerToggle value={homeViewMode} onChange={setHomeViewMode} />}
      </div>

      {/* Persistent, unmissable scope indicator while org-wide is active —
          deliberately NOT dismissible (unlike ManagerAlertBanner below):
          the whole point of this banner is that an admin can never forget
          they're looking at the entire org, not their own team, so it has
          to stay up the entire time that's true, not just until the first
          click. Org-wide ONLY, deliberately — this is a rare, high-stakes
          state worth a heavy, unmissable callout; drilling into a
          sub-team is routine, frequent navigation for any manager, which
          gets the much lighter chip below instead (a full-width banner
          firing on every drill would read as naggy, and previously
          duplicated the chip's own text one row below it — see
          OPTIMIZATION_PROGRESS.md). The two stay independent by design,
          same as `orgWideView` and drill position are already orthogonal
          everywhere else in this file — an admin drilled into a sub-team
          within the org-wide view sees both indicators at once, each
          telling a different true fact (permission scope vs. current
          navigation position), not a conflict. */}
      {canViewOrgWide && orgWideView && (
        <div className="shrink-0 flex items-center gap-2 rounded-xl border border-purple-200 dark:border-purple-800/50 bg-purple-50 dark:bg-purple-900/20 px-3 py-2">
          <FiGlobe className="h-4 w-4 shrink-0 text-purple-600 dark:text-purple-400" aria-hidden="true" />
          <p className="text-xs text-purple-900 dark:text-purple-100">
            <span className="font-semibold">Viewing: Entire Organization</span> — every KPI, alert, and team list
            below covers every employee, not just your own team.
          </p>
        </div>
      )}

      {/* Sole scope hint for the drilled-team case (see the banner's own
          comment above for why a second banner isn't also used here) —
          compact and inline, sitting right next to the numbers it labels.
          "Showing:" rather than "KPIs for:" since this is now the only
          indicator covering Team Alerts/Top Skill Domains/Skill Level
          Distribution too, not just the KPI row. Doubles as a one-click way
          back to the full team, no scrolling down to the card's own
          breadcrumb needed. */}
      {isDrilledIntoTeam && (
        <div className="shrink-0 flex items-center gap-1.5">
          <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Showing:</span>
          <FilterChip label={currentTeamLabel} onRemove={() => navigateToAncestors([])} />
        </div>
      )}

      {/* Pending Approvals is now the 5th kpiItems entry (see its own
          comment above) instead of a separate bell button anchored past
          the end of this row — KpiHero alone fills the row, so the
          flex-col/lg:flex-row split this used to need (to arbitrate
          between KpiHero and a second, differently-sized sibling) is gone
          too; the outer page's own flex-col gap-2 already spaces this
          against its neighbors. Search/Filters live inside
          TeamTrainingStatusCard's own header instead — they only ever
          affect that card's rows, never the KPI cards. */}
      <KpiHero items={kpiItems} />

      {!alertBannerDismissed && (
        <ManagerAlertBanner
          pendingCount={totalPendingCount}
          onDismiss={dismissAlertBanner}
          onClick={() =>
            goToTrainingBatches(
              { scope: BATCH_SCOPE.PENDING_APPROVALS, batchNums: [], label: "Pending approvals" },
              BATCH_VIEW_ORIGIN.MANAGER_DASHBOARD
            )
          }
        />
      )}

      {/* Main layout: left summary (scrolls with the page), right rail
          (Team Alerts / Top Skill Domains / Skill Level Distribution)
          STICKY so it stays visible while scanning a long team list —
          lg:self-start is required alongside lg:sticky, otherwise CSS
          Grid's default align-items:stretch makes the sticky column exactly
          as tall as the left column, defeating sticky entirely. The
          lg:border-l gives it a clear, intentional visual anchor (it reads
          as its own persistent rail, not a disconnected/broken column) —
          both the sticky positioning and the border only apply at lg+;
          below that the columns stack in normal flow, where a sticky rail
          wouldn't make sense anyway. min-w-0 on both columns stops the
          expanded card grid (or anything else) from ever forcing this
          grid wider than its parent. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">
        <div ref={mainContentRef} className="space-y-2.5 lg:col-span-2 min-w-0">
          <TeamTrainingStatusCard
            scope={pillValue}
            onScopeChange={handleScopeChange}
            canViewOrgWide={canViewOrgWide}
            viewMode={viewMode}
            onViewModeChange={onViewModeChange}
            counts={viewMode === "employee" ? employeeCounts : counts}
            activeBucket={statusBucket}
            onSelectBucket={setStatusBucket}
            rows={rows}
            batchByNum={batchByNum}
            onNavigateToBatch={(target) => goToTrainingBatches(target, BATCH_VIEW_ORIGIN.MANAGER_DASHBOARD)}
            breadcrumbs={employeeBreadcrumbs}
            onDrillInto={drillIntoEmployeeTeam}
            drillingEnabled={drillingEnabled}
            drillError={employeeDrillError}
            globalSearchResults={globalSearchResults}
            globalSearchTotalCount={globalSearchTotalCount}
            isGlobalSearchActive={isGlobalSearchActive}
            searchQuery={hierarchySearchQuery}
            onSearchResultSelect={handleSearchResultSelect}
            activeResultIndex={activeResultIndex}
            onActiveResultIndexChange={setActiveResultIndex}
            trainingGroups={trainingGroups}
            alertFilter={alertFilter}
            onClearAlertFilter={() => setAlertFilter(null)}
            search={search}
            onSearchChange={setSearch}
            searchOpen={searchOpen}
            onSearchOpenChange={handleSearchOpenChange}
            statusLabels={statusLabels}
            onStatusLabelsChange={setStatusLabels}
            kpiItems={kpiItems}
          />
        </div>

        <div ref={sidebarRef} className="space-y-2.5 min-w-0 lg:sticky lg:top-2.5 lg:self-start lg:border-l lg:border-gray-200/70 dark:lg:border-gray-700/70 lg:pl-3">
          <TeamAlertsCard alerts={alertItems} activeKey={alertFilter?.key ?? (isUndergoingTrainingAlertActive ? "undergoingTraining" : null)} />
          <SkillDomainsCard domains={drillScopedStats.topDomains} />
          <SkillLevelDistributionCard distribution={drillScopedStats.skillLevelDistribution} />
        </div>
      </div>
    </div>
  );
}
