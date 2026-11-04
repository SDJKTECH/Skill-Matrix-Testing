import React, { useEffect, useMemo, useRef, useState } from "react";
import { FiUser, FiUsers, FiSliders, FiChevronDown, FiMaximize2, FiMinimize2 } from "react-icons/fi";
import StatusTabs from "../../shared/components/StatusTabs";
import SegmentedToggle from "../../shared/components/SegmentedToggle";
import ScrollFadeContainer from "../../shared/components/ScrollFadeContainer";
import Breadcrumb from "../../shared/components/Breadcrumb";
import { useScrollResetOnChange } from "../../shared/hooks/useScrollResetOnChange";
import SearchToggle from "../../shared/components/filters/SearchToggle";
import SearchScopeLabel from "../../shared/components/filters/SearchScopeLabel";
import SearchMatchNav from "../../shared/components/filters/SearchMatchNav";
import FilterPopover from "../../shared/components/filters/FilterPopover";
import MultiSelectFilter from "../../shared/components/filters/MultiSelectFilter";
import FilterChip from "../../shared/components/filters/FilterChip";
import EmployeeList from "./EmployeeList";
import TrainingBatchGroupList from "./TrainingBatchGroupList";
import KpiHero from "./KpiHero";
import { STATUS_BUCKET_CONFIG, countTrainingBuckets } from "../../shared/config/trainingStatusBuckets";
import { VIEW_MODE_CONFIG } from "../services/viewModeConfig";
import { normalizeTrainingRecord } from "../../shared/config/trainingRecordAdapter";
import { isTestOrPlaceholderRecord } from "../services/testDataFilters";
import { getScrollContainer } from "../../../../helper/utility";
import { groupByManager } from "../services/teamGrouping";
import { FOCUS_RING } from "../../shared/config/focusRing";

// The three real, selectable status buckets ("All" isn't a filterable value
// — it means "no filter", already what an empty selection does).
const TRAINING_STATUS_FILTER_OPTIONS = STATUS_BUCKET_CONFIG.filter((bucket) => bucket.key !== "assigned").map(
  (bucket) => bucket.label
);

const CHIP_EXIT_MS = 150;

const SCOPE_OPTIONS = [
  { key: "direct", label: "Direct Reports" },
  { key: "all", label: "Entire Team" },
];

/**
 * Team Training Status card — breadcrumb drill-down for Entire Team scope,
 * flat direct-only list for Direct Reports scope.
 *
 * `alertFilter` (set by one of the three "no certifications/trainings/
 * skills" Team Alerts) replaces the normal team list with a filtered-results
 * view showing ONLY the matching employees (grouped by manager for
 * organizational context), not the full team with a few rows dyed amber —
 * a manager who clicked "6 employees have no certifications" wants to see
 * those 6 people, not scan past the other 40 to find them. `alertFilter.items`
 * already carries each match's `managerGroup` (computeStatsFromTeam in
 * hierarchyUtils.js), so this needs no separate "whole team" fetch. Same
 * behavior for both scopes — Direct Reports previously reused the normal
 * `EmployeeList` with per-row highlighting instead, which was a second,
 * inconsistent rendering of the same concept; unified onto this one path.
 * Each manager-group collapses to a single summary row by default (same
 * collapsed-row convention as the normal By Employee list's drillable
 * manager rows), expandable in place — see `expandedAlertGroups` below.
 * Rows render in the app's normal neutral style, not amber/warning-colored:
 * since every row in this view is already a match by construction, a
 * constant color adds no information over the active-filter chip above it
 * (see activeFilterChips) — amber only earns its place where it
 * discriminates a match from a non-match, e.g. Team Alerts' own icon. Both
 * toggles stay enabled throughout; switching view mode or scope naturally
 * clears the filter (see ManagerDashboard.jsx). The view also gets the same
 * breadcrumb ("All Direct Reports > Missing Certifications") as hierarchy
 * drill-down, root crumb clearing the alert — one consistent drill-down
 * pattern app-wide instead of a bespoke back link, see alertBreadcrumbItems
 * below.
 *
 * Search + Filters live in this card's own header (not ManagerDashboard's
 * page-level toolbar) because `search`/`statusLabels` only ever affect this
 * card's rows/trainingGroups — nothing else on the dashboard reads
 * them. That whole toolbar row hides while an alert is active: the
 * matches-only view reads `alertFilter.items` directly, so neither Search
 * nor the training-status filter does anything there — see the row's own
 * comment below. The Filters popover's "Training Status" option is a
 * MULTI-select complement to StatusTabs' single-select tabs (StatusTabs can
 * only show one bucket at a time; this lets a manager combine several, e.g.
 * "In Progress OR Not Started") — it previously filtered by training-
 * completion-percentage tier instead, which turned out to be the wrong
 * dimension for this list; see employeeListFilters.js's
 * filterByTrainingStatus. `search`/`searchOpen`/`statusLabels` stay lifted
 * in ManagerDashboard since they also drive the data hooks
 * (useTeamHierarchyView, useTrainingBatchGroups) and
 * handleSearchResultSelect/handleScopeChange there; `filterOpen` and the
 * chip-removal animation state are pure presentation and live locally
 * instead.
 *
 * Full-screen toggle (`isExpanded`) is a pure CSS-position swap on this
 * same card instance — see the top of the component body for why that
 * means every child's state survives expand/collapse for free, with no
 * portal and no special-case preservation logic needed.
 */
export default function TeamTrainingStatusCard({
  scope,
  onScopeChange,
  viewMode,
  onViewModeChange,
  counts,
  activeBucket,
  onSelectBucket,
  rows,
  batchByNum,
  onNavigateToBatch,
  breadcrumbs,
  onDrillInto,
  drillingEnabled = false,
  drillError = null,
  globalSearchResults = [],
  globalSearchTotalCount = 0,
  isGlobalSearchActive = false,
  searchQuery = "",
  onSearchResultSelect,
  activeResultIndex = 0,
  onActiveResultIndexChange,
  trainingGroups,
  alertFilter,
  onClearAlertFilter,
  search,
  onSearchChange,
  searchOpen,
  onSearchOpenChange,
  statusLabels,
  onStatusLabelsChange,
  kpiItems,
  canViewOrgWide = false,
}) {
  // Admin-only 3rd pill option — see ManagerDashboard.jsx's own
  // handleScopeChange/pillValue comment for why this doesn't correspond to
  // a real 3rd `scope` value (scope itself stays "direct"|"all";
  // orgWideView is a separate, orthogonal axis this card doesn't need to
  // know about directly). Computed here, not a second module-level
  // constant, so the SegmentedToggle and the scope-label lookup below can
  // never disagree about whether "org" is a valid option right now.
  const scopeOptions = canViewOrgWide ? [...SCOPE_OPTIONS, { key: "org", label: "Entire Organization" }] : SCOPE_OPTIONS;
  const items = STATUS_BUCKET_CONFIG.map((bucket) => ({ key: bucket.key, label: bucket.label, count: counts[bucket.key] ?? 0 }));
  const isEmployeeView = viewMode === "employee";
  const showBreadcrumb = isEmployeeView && drillingEnabled && !alertFilter && !isGlobalSearchActive;
  const showAlertMatches = Boolean(alertFilter);

  // Wraps through the rendered result set — shared by the keydown handler
  // and SearchMatchNav's chevrons.
  const stepActiveResult = (delta) => {
    const count = globalSearchResults.length;
    if (!count) return;
    onActiveResultIndexChange?.((i) => (i + delta + count) % count);
  };

  // ArrowUp/ArrowDown/Enter cycles results while the search input stays
  // focused (typeahead-listbox pattern). Gated to the input and to
  // global-search mode.
  const handleSearchKeyDown = (event) => {
    if (event.target.tagName !== "INPUT" || !isGlobalSearchActive) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      stepActiveResult(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      stepActiveResult(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      onSearchResultSelect?.(globalSearchResults[activeResultIndex] ?? globalSearchResults[0]);
    }
  };

  // Read-only training-status breakdown for the matches-only alert view —
  // same 4 buckets as StatusTabs above, but not a filter control: matches
  // here are fixed by the alert itself (e.g. "no certifications"), not
  // further narrowable by training status, so this is display-only (see
  // the plain pill row below instead of reusing the interactive
  // StatusTabs). alertFilter.items' `trainings` field is raw/unfiltered
  // (see hierarchyUtils.js's computeStatsFromTeam) — filtered here, the one
  // place this file touches training records directly.
  const alertStatusItems = useMemo(() => {
    if (!alertFilter) return [];
    const trainings = alertFilter.items
      .flatMap((emp) => emp.trainings || [])
      .filter((t) => !isTestOrPlaceholderRecord(normalizeTrainingRecord(t)));
    const alertCounts = countTrainingBuckets(trainings);
    return STATUS_BUCKET_CONFIG.map((bucket) => ({ key: bucket.key, label: bucket.label, count: alertCounts[bucket.key] ?? 0 }));
  }, [alertFilter]);

  // Same memoization discipline as alertStatusItems above — this was
  // previously recomputed via an IIFE inline in the JSX below on every
  // render while an alert was active, the one place in this file that
  // didn't already follow that pattern.
  const alertGroups = useMemo(
    () => (alertFilter ? groupByManager(alertFilter.items) : []),
    [alertFilter]
  );
  // A group header only earns its place when it distinguishes one group
  // from another — with a single group (every match reports to the same
  // manager, e.g. Direct Reports scope always resolves to exactly one
  // group) it's a redundant extra click hiding the very people this view
  // exists to surface, so skip the header/collapse entirely and just list
  // them.
  const showGroupHeaders = alertGroups.length > 1;

  // Alert drill-downs get the same breadcrumb pattern as hierarchy
  // drill-downs (see showBreadcrumb above) instead of a bespoke back
  // affordance — root crumb clears the alert, leaf crumb names it. The
  // FilterChip in activeFilterChips below stays alongside this: the chip is
  // "active filter, click to remove" (same affordance Training Status
  // filters use), the breadcrumb is "where am I" — different jobs.
  const alertBreadcrumbItems = alertFilter
    ? [
        { key: "root", label: "All Direct Reports", onClick: onClearAlertFilter },
        { key: "alert", label: alertFilter.chipLabel || alertFilter.label },
      ]
    : null;

  // Full-screen takeover — pure CSS-position toggle on this same card
  // instance (never unmounted/remounted, no portal), so every child's own
  // state (search text, active filter, selected toggle, list scroll
  // position) survives expand/collapse automatically instead of needing
  // explicit preservation. `isExpandedVisible` is deferred one frame behind
  // `isExpanded` so the scale/opacity transition actually has two painted
  // frames to interpolate between — flipping both in the same render would
  // just snap straight to the end state (same technique FilterPopover.jsx
  // uses for its own open animation). No portal needed: unlike
  // FilterPopover (a small anchored popover that must escape an ancestor's
  // overflow clipping), a `fixed inset-0` element already covers the full
  // viewport regardless of where it sits in the DOM.
  const [isExpanded, setIsExpanded] = useState(false);
  const [isExpandedVisible, setIsExpandedVisible] = useState(false);
  const toggleExpanded = () => setIsExpanded((v) => !v);

  useEffect(() => {
    if (!isExpanded) {
      setIsExpandedVisible(false);
      return;
    }
    const raf = requestAnimationFrame(() => setIsExpandedVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [isExpanded]);

  useEffect(() => {
    if (!isExpanded) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") setIsExpanded(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isExpanded]);

  // Background page shouldn't scroll along with a fullscreen card sitting
  // on top of it. Restores whatever the previous value was (not always "")
  // in case something else already set it.
  useEffect(() => {
    if (!isExpanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isExpanded]);

  // Drilling into a team, jumping the breadcrumb back to root, clicking a
  // Team Alert, switching directly between two alerts, or toggling
  // viewMode/scope all swap out this card's whole roster for a different
  // one — without this, the roster list stayed scrolled to wherever it was
  // for the PREVIOUS roster, leaving the new one rendering off-screen below
  // the fold. One effect covers all of those cases since they all flow
  // through these same props.
  //
  // Unlike BatchTable.jsx's page-level list (the real scroller is an
  // ANCESTOR — the whole page), this card's roster renders inside its own
  // internal, bounded-height scroll region — a DESCENDANT of cardRootRef,
  // not an ancestor (confirmed via a live repro: walking up from
  // cardRootRef never found a genuinely overflowing ancestor here at all,
  // it fell straight through to <html>, a silent no-op). getScrollContainer
  // (ancestor walk) is only right for the fullscreen case, where this card
  // becomes its own page-level scroller (`overflow-y-auto` on the root div
  // itself, see its className below) — everywhere else, the actual
  // scrolled element is the inner `.overflow-y-auto` wrapping the row list.
  // Delayed (not synchronous), same reasoning as BatchTable.jsx's
  // expandedId-watching effect: resetting immediately fires before the new
  // roster has actually grown the container's scrollHeight, so either the
  // lookup finds nothing yet or the browser's own scroll-anchoring
  // compensates for the still-incoming height change and quietly drags
  // scrollTop back afterward.
  const cardRootRef = useRef(null);
  // CROSS-6: now the shared useScrollResetOnChange — the self/inner/
  // ancestor-walk resolution stays exactly as it was, just moved into the
  // resolver function the hook re-invokes at scroll time.
  useScrollResetOnChange(
    () => {
      const el = cardRootRef.current;
      const self = el && getComputedStyle(el).overflowY === "auto" ? el : null;
      const inner = el?.querySelector(".overflow-y-auto");
      return self || inner || getScrollContainer(el);
    },
    [breadcrumbs, alertFilter, viewMode, scope],
    { delay: 240 }
  );

  // Each manager-group in the matches-only alert view collapses to a
  // single summary row (name + match count + chevron) by default, same
  // collapsed-row convention as the normal By Employee list's drillable
  // manager rows — clicking expands it in place to reveal the matching
  // employees. Resets to all-collapsed whenever the active alert changes
  // (a new `alertFilter.key`), so switching from "no certifications" to
  // "no skills" doesn't carry over an unrelated group's expanded state.
  const [expandedAlertGroups, setExpandedAlertGroups] = useState(() => new Set());
  useEffect(() => {
    setExpandedAlertGroups(new Set());
    // Defensive: if Filters happened to be open when an alert was clicked,
    // its popover's anchor button is about to unmount (the whole toolbar
    // row hides while an alert is active — see below), which would
    // otherwise leave FilterPopover pointed at a dead ref.
    setFilterOpen(false);
  }, [alertFilter?.key]);
  const toggleAlertGroup = (groupLabel) => {
    setExpandedAlertGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupLabel)) next.delete(groupLabel);
      else next.add(groupLabel);
      return next;
    });
  };

  const [filterOpen, setFilterOpen] = useState(false);
  const filtersBtnRef = useRef(null);
  // Training view has no filter dimension of its own yet (per-employee
  // training status, the only thing the Filters popover offers, has no
  // batch-group analog — see the popover's own comment below) — the
  // button is hidden rather than left visible opening onto an empty panel.
  // Closes proactively on the way out (not just hidden) so its anchor
  // button isn't left with a dangling ref if it was open at the moment
  // viewMode changed, same defensive precedent as the alertFilter effect
  // below.
  useEffect(() => {
    if (!isEmployeeView) setFilterOpen(false);
  }, [isEmployeeView]);
  const activeFilterCount = statusLabels.length;
  const hasActiveFilters = Boolean(search.trim()) || activeFilterCount > 0 || Boolean(alertFilter);
  const clearAllFilters = () => {
    onSearchChange("");
    onSearchOpenChange(false);
    onStatusLabelsChange([]);
    if (alertFilter) onClearAlertFilter();
  };
  // A Team Alert (alertFilter) is, from the user's point of view, just
  // another active filter narrowing this list — same as a training-status
  // selection — so it shows in the SAME chip row with the same clear
  // affordance, instead of a separate bespoke "Showing N... Clear filter"
  // bar that looked/behaved differently from every other active-filter
  // indicator.
  const activeFilterChips = useMemo(() => {
    const chips = [];
    if (alertFilter) {
      chips.push({ key: "alert", label: alertFilter.chipLabel || alertFilter.label, clear: onClearAlertFilter });
    }
    // Training-status chips are an Employee-view-only concept (see
    // isEmployeeView guard around the Filters button below) — skipped here
    // too so a stale selection from before a view-mode switch can't render
    // a chip that claims to be filtering a list it no longer affects.
    if (isEmployeeView) {
      for (const label of statusLabels) {
        chips.push({
          key: `status:${label}`,
          label: `Status: ${label}`,
          clear: () => onStatusLabelsChange(statusLabels.filter((l) => l !== label)),
        });
      }
    }
    return chips;
  }, [alertFilter, onClearAlertFilter, statusLabels, onStatusLabelsChange, isEmployeeView]);
  // Same removable-chip exit-animation pattern as My Trainings' own
  // FilterChip usage — deferring the real state removal until the exit
  // transition has had time to play.
  const [removingChipKeys, setRemovingChipKeys] = useState(() => new Set());
  const removeChip = (chip) => {
    setRemovingChipKeys((prev) => new Set(prev).add(chip.key));
    setTimeout(() => {
      chip.clear();
      setRemovingChipKeys((prev) => {
        const next = new Set(prev);
        next.delete(chip.key);
        return next;
      });
    }, CHIP_EXIT_MS);
  };

  return (
    <div
      ref={cardRootRef}
      className={`bg-white dark:bg-gray-800 cursor-default transition-[transform,opacity] duration-[180ms] ease-out motion-reduce:transition-none ${
        isExpanded
          ? `fixed inset-0 z-[60] overflow-y-auto ${isExpandedVisible ? "opacity-100 scale-100" : "opacity-0 scale-95"}`
          : "rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm"
      }`}
    >
      <div className="p-2.5">
      {/* KPI row (Team Members/Total Skills/Certifications/Trainings) is the
          one right-rail-adjacent widget that survives into the expanded
          view — page-wide reference numbers stay useful even while focused
          on the training list, unlike Team Alerts/Top Skill Domains/Skill
          Level Distribution (still hidden, since those are its own
          separate cards, not part of this one). Reuses ManagerDashboard's
          own `kpiItems` config as-is: KpiHero's grid breakpoint (xl:) is a
          viewport media query, not a container query, so at the expanded
          card's full-viewport width it naturally goes 4-up at 1280px+
          without any extra breakpoint overrides needed here. */}
      {isExpanded && kpiItems && (
        <div className="mb-2">
          <KpiHero items={kpiItems} />
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
        <h2 className="text-xs font-semibold text-gray-900 dark:text-white">Team Training Status</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <SegmentedToggle options={VIEW_MODE_CONFIG} value={viewMode} onChange={onViewModeChange} ariaLabel="View mode" />
          <SegmentedToggle options={scopeOptions} value={scope} onChange={onScopeChange} ariaLabel="Team scope" />
          {/* Always visible regardless of alertFilter (unlike Search/Filters
              below, which hide while an alert is active) — expand/collapse
              is a view-level control, not a content filter, so it stays
              reachable no matter what the card is currently showing. */}
          <button
            type="button"
            onClick={toggleExpanded}
            aria-label={isExpanded ? "Collapse" : "Expand to full screen"}
            title={isExpanded ? "Collapse" : "Expand to full screen"}
            className={`shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 transition-colors cursor-pointer ${FOCUS_RING}`}
          >
            {isExpanded ? <FiMinimize2 className="h-3.5 w-3.5" /> : <FiMaximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      <FilterPopover open={filterOpen} onClose={() => setFilterOpen(false)} anchorRef={filtersBtnRef} panelId="manager-dashboard-filters-panel">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Filters</span>
            {hasActiveFilters && (
              <button type="button" onClick={clearAllFilters} className={`text-[11px] text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded ${FOCUS_RING}`}>
                Clear all
              </button>
            )}
          </div>
          {/* Per-employee training status is a per-PERSON concept with no
              batch-group analog — hidden in Training view rather than
              silently doing nothing when applied there. */}
          {viewMode === "employee" && (
            <div className="flex flex-col gap-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">
              Training Status
              <MultiSelectFilter
                label="Training Status"
                allLabel="All Statuses"
                options={TRAINING_STATUS_FILTER_OPTIONS}
                selected={statusLabels}
                onChange={onStatusLabelsChange}
              />
            </div>
          )}
        </div>
      </FilterPopover>

      {activeFilterChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
          {activeFilterChips.map((chip) => (
            <FilterChip key={chip.key} label={chip.label} exiting={removingChipKeys.has(chip.key)} onRemove={() => removeChip(chip)} />
          ))}
          <button type="button" onClick={clearAllFilters} className={`text-[11px] text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 ml-1 rounded ${FOCUS_RING}`}>
            Clear all
          </button>
        </div>
      )}

      {(showBreadcrumb || showAlertMatches) && (
        <div className="mb-1.5 min-w-0 max-w-full overflow-hidden">
          <Breadcrumb items={showAlertMatches ? alertBreadcrumbItems : breadcrumbs} />
        </div>
      )}

      {/* Read-only training-status breakdown for the matches-only alert
          view — see alertStatusItems above for why this isn't the
          interactive StatusTabs (plain pills, no active/click state). */}
      {showAlertMatches && (
        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
          {alertStatusItems.map((item) => (
            <span
              key={item.key}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-semibold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
            >
              {item.label}
              <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 text-[10px] font-bold tabular-nums">
                {item.count}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Status chips ("what I'm filtering by") + Search/Filters ("how I'm
          searching/filtering") share one row at sm+ so they read as a
          single toolbar line instead of two disconnected ones — merged at
          the same `sm:` breakpoint StatusTabs itself already switches on
          (mobile → sm:flex-wrap/overflow-visible), not an arbitrary new
          one. Kept stacked below sm: StatusTabs sets `overflow-x-auto` on
          itself there, which per the flexbox spec makes its automatic
          minimum width 0 — sharing a row at that width would let it get
          silently squeezed to a sliver instead of wrapping.

          The whole row is skipped (not just StatusTabs) while an alert is
          active: the matches-only view below reads `alertFilter.items`
          directly, bypassing `rows`/`search`/`statusLabels` entirely, so
          Search and the training-status filter are just as functionally
          inert there as StatusTabs is — none of the three do anything to
          what's on screen. Rendering an empty StatusTabs slot with
          Search/Filters stranded alone on the right (the previous
          behavior) read as a wide, accidental blank strip rather than a
          deliberately tight layout; the alert itself already shows as a
          chip above with its own clear affordance, so nothing is lost by
          hiding this row outright. `search`/`statusLabels` are also
          cleared the moment an alert activates (see
          ManagerDashboard.jsx's toggleAlertFilter), so no stale,
          non-functional chip/value can resurface once the
          alert is cleared and this row reappears. (The read-only pill row
          just above, when an alert IS active, is a display-only breakdown
          of the matches — not a revival of this interactive toolbar.) */}
      {!alertFilter && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          {/* Hidden while search is open, not just squeezed smaller: these
              badges count the whole drilled team by status bucket, which
              has no relationship to what a global search's results actually
              show (a flat name-match list, unfiltered by status) — plus
              they were previously the one thing losing the width fight
              against SearchScopeLabel + the open search input, collapsing
              into an illegible one-pill-per-line stack. Reappears the
              instant search closes. */}
          {!searchOpen && (
            <StatusTabs
              items={items}
              activeKey={activeBucket}
              onChange={onSelectBucket}
              ariaLabel={`Filter ${isEmployeeView ? "employees" : "nominees"} by status`}
            />
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 shrink-0 sm:ml-auto">
            {/* Scoped wrapper so arrow keys don't also hit Filters. */}
            <div className="flex flex-wrap items-center gap-2" onKeyDown={handleSearchKeyDown}>
              {searchOpen && (
                <SearchScopeLabel
                  scope={`${VIEW_MODE_CONFIG.find((v) => v.key === viewMode)?.label} · ${scopeOptions.find((s) => s.key === scope)?.label}`}
                />
              )}
              <SearchToggle
                value={search}
                onChange={onSearchChange}
                open={searchOpen}
                onOpenChange={onSearchOpenChange}
                placeholder={VIEW_MODE_CONFIG.find((v) => v.key === viewMode)?.searchPlaceholder}
                ariaLabel="Search"
              />
              {searchOpen && search.trim() && (
                isGlobalSearchActive ? (
                  // Count is the rendered (capped) set, not the true total
                  // — only those are in the DOM to cycle to. "Showing 50 of
                  // X" lives separately in EmployeeList.
                  <SearchMatchNav
                    count={globalSearchResults.length}
                    activeIndex={activeResultIndex}
                    onPrev={() => stepActiveResult(-1)}
                    onNext={() => stepActiveResult(1)}
                    itemLabel="employees"
                  />
                ) : (
                  // Local search already shows every match — count only.
                  <SearchMatchNav count={rows.length} itemLabel="employees" />
                )
              )}
            </div>
            {/* Training view has no filter dimension of its own (see the
                FilterPopover's own comment above) — the trigger is hidden
                rather than opening onto an empty panel there. */}
            {isEmployeeView && (
              <button
                ref={filtersBtnRef}
                type="button"
                onClick={() => setFilterOpen((v) => !v)}
                aria-expanded={filterOpen}
                aria-controls="manager-dashboard-filters-panel"
                className={`shrink-0 inline-flex items-center gap-1.5 h-9 pl-3 pr-2.5 rounded-full text-[11px] font-semibold transition-colors cursor-pointer ${FOCUS_RING} ${
                  filterOpen || activeFilterCount > 0
                    ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                <FiSliders className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Filters</span>
                {activeFilterCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold">
                    {activeFilterCount}
                  </span>
                )}
                <FiChevronDown className={`hidden sm:block h-3 w-3 transition-transform duration-150 ${filterOpen ? "rotate-180" : ""}`} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Default cap (min(60vh,440px)) would leave most of a fullscreen
          card empty — expanded gets a generous viewport-relative cap
          instead so the list actually fills the extra space. Rough
          estimate, not pixel-exact: worst case is a little unused space at
          the bottom, and the outer card's own overflow-y-auto covers the
          rare case where header+chips are tall enough to still overflow. */}
      <ScrollFadeContainer
        className="mt-2"
        maxHeight={isExpanded ? "calc(100vh - 160px)" : undefined}
        watch={[rows, trainingGroups, alertFilter, viewMode, scope, isGlobalSearchActive, breadcrumbs, isExpanded]}
      >
        {showAlertMatches ? (
          alertFilter.items.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">No employees to show.</p>
          ) : (
            <div className="space-y-1.5">
              {alertGroups.map(([groupLabel, groupItems]) => {
                const isOpen = !showGroupHeaders || expandedAlertGroups.has(groupLabel);
                return (
                  <div key={groupLabel}>
                    {showGroupHeaders && (
                      <button
                        type="button"
                        onClick={() => toggleAlertGroup(groupLabel)}
                        aria-expanded={isOpen}
                        aria-controls={`alert-group-${groupLabel}`}
                        className={`w-full flex items-center gap-2.5 py-2 px-2.5 rounded-lg border shadow-sm transition-all cursor-pointer ${FOCUS_RING} ${
                          isOpen
                            ? "border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-900/10"
                            : "border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 hover:shadow-md hover:border-blue-200 dark:hover:border-blue-800"
                        }`}
                      >
                        <p className="min-w-0 flex-1 text-left text-sm font-medium text-gray-900 dark:text-white truncate">{groupLabel}</p>
                        <span className="shrink-0 inline-flex items-center gap-1 h-6 px-2 rounded-full bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 text-[10px] font-semibold">
                          <FiUsers className="h-3 w-3" aria-hidden="true" />
                          {groupItems.length}
                        </span>
                        <FiChevronDown
                          className={`h-3.5 w-3.5 shrink-0 transition-transform duration-150 ${isOpen ? "rotate-180 text-blue-500 dark:text-blue-400" : "text-gray-400 dark:text-gray-500"}`}
                        />
                      </button>
                    )}
                    {isOpen && (
                      <div id={`alert-group-${groupLabel}`} className={`space-y-1.5 ${showGroupHeaders ? "mt-1.5" : ""}`}>
                        {groupItems.map((emp) => (
                          <div
                            key={emp.id}
                            className="w-full flex items-center gap-2.5 py-2 px-2.5 rounded-lg border shadow-sm border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800"
                          >
                            <FiUser className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500" />
                            <p className="min-w-0 flex-1 text-sm font-medium text-gray-900 dark:text-white truncate">{emp.name}</p>
                            {emp.role && <span className="shrink-0 max-w-[40%] truncate text-xs text-gray-400 dark:text-gray-500">{emp.role}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        ) : isEmployeeView ? (
          drillError ? (
            <p className="text-sm text-red-500 dark:text-red-400 text-center py-6">{drillError}</p>
          ) : (
            <EmployeeList
              rows={rows}
              batchByNum={batchByNum}
              onNavigateToBatch={onNavigateToBatch}
              onDrillInto={onDrillInto}
              drillingEnabled={drillingEnabled}
              globalSearchResults={globalSearchResults}
              globalSearchTotalCount={globalSearchTotalCount}
              isGlobalSearchActive={isGlobalSearchActive}
              searchQuery={searchQuery}
              onSearchResultSelect={onSearchResultSelect}
              activeResultIndex={activeResultIndex}
              onActiveResultIndexChange={onActiveResultIndexChange}
            />
          )
        ) : (
          <TrainingBatchGroupList key={scope} groups={trainingGroups} />
        )}
      </ScrollFadeContainer>
      </div>
    </div>
  );
}
