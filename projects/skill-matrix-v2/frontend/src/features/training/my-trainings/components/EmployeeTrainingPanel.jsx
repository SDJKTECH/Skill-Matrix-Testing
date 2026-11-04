import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiChevronLeft, FiChevronDown, FiSliders, FiInbox, FiAlertCircle, FiStar } from "react-icons/fi";
import YearFilter from "../../shared/components/YearFilter";
import EntityCard from "../../shared/components/EntityCard";
import EntityCardGrid from "../../shared/components/EntityCardGrid";
import CardListPagination from "../../shared/components/CardListPagination";
import FilterPopover from "../../shared/components/filters/FilterPopover";
import MultiSelectFilter from "../../shared/components/filters/MultiSelectFilter";
import FilterChip from "../../shared/components/filters/FilterChip";
import SearchToggle from "../../shared/components/filters/SearchToggle";
import SearchScopeLabel from "../../shared/components/filters/SearchScopeLabel";
import SearchMatchNav from "../../shared/components/filters/SearchMatchNav";
import useUrlSearchParam from "../../shared/hooks/useUrlSearchParam";
import { useDebouncedValue } from "../../shared/hooks/useDebouncedValue";
import { useScrollResetOnChange } from "../../shared/hooks/useScrollResetOnChange";
import useOpenEnrollmentView from "../../../../hooks/useOpenEnrollmentView";
import StatusTabs from "../../shared/components/StatusTabs";
import NotificationBellButton from "../../shared/components/NotificationBellButton";
import LoadingSpinner from "../../shared/components/LoadingSpinner";
import OpenEnrollmentGrid from "./OpenEnrollmentGrid";
import useOpenEnrollmentBatches from "../hooks/useOpenEnrollmentBatches";
import { countTrainingBuckets, STATUS_BUCKET_CONFIG } from "../../shared/config/trainingStatusBuckets";
import { getAvailableYears, filterTrainingsByYear, ALL_YEARS } from "../../shared/config/trainingYearFilter";
import { normalizeTrainingList, toEntityCardProps } from "../../shared/config/trainingRecordAdapter";
import { buildBatchByNumMap } from "../../shared/config/batchByNum";
import { useGoToTrainingBatches } from "../../../../hooks/useGoToTrainingBatches";
import { fetchTrainings } from "../../../../helper/addTrainingV2Api";
import { fetchBatches } from "../../../../helper/trainingBatchesApi";
import {
  buildMyTrainingsQuery,
  CARDS_PER_PAGE,
  needsClientPostFilter,
  processTrainingsResponse,
} from "../services/myTrainingsQuery";
import { countOpenEnrollmentBatches } from "../services/newOpenEnrollmentCount";
import { FOCUS_RING } from "../../shared/config/focusRing";

const CURRENT_YEAR = new Date().getFullYear();
const SEARCH_DEBOUNCE_MS = 300;

const SORT_OPTIONS = [
  { key: "recent", label: "Most Recent" },
  { key: "oldest", label: "Oldest" },
  { key: "az", label: "A – Z" },
];

const EMPTY_ADV_FILTERS = { status: [], mode: [], quarter: [] };
const MY_TRAININGS_TABS = [...STATUS_BUCKET_CONFIG, { key: "pendingApproval", label: "Pending Approval" }]; // My Trainings only; shared config stays as is

const SESSION_KEY_PREFIX = "skillMatrix.myTrainings.filters.v1.";
function loadPersistedFilters(employeeId) {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY_PREFIX + employeeId);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function savePersistedFilters(employeeId, filters) {
  try {
    sessionStorage.setItem(SESSION_KEY_PREFIX + employeeId, JSON.stringify(filters));
  } catch {
    // sessionStorage unavailable — filters won't survive a remount this session.
  }
}

/** My Trainings list, plus the Open for Enrollment catalog. */
export default function EmployeeTrainingPanel({
  employeeId,
  initialBucket,
  initialYear,
  initialCatalogOpen = false,
  initialSearch,
  onBack,
}) {
  const goToTrainingBatches = useGoToTrainingBatches();

  const [persisted] = useState(() => (employeeId != null ? loadPersistedFilters(employeeId) : null));

  const [selectedYear, setSelectedYear] = useState(initialYear ?? persisted?.selectedYear ?? CURRENT_YEAR);
  const [activeBucket, setActiveBucket] = useState(initialBucket ?? persisted?.activeBucket ?? "assigned");
  // A deep link wins, then the URL, then the last saved search.
  // Opening Open for Enrollment does not reuse a My Trainings search.
  const initialSearchValue = initialSearch ?? (initialCatalogOpen ? "" : persisted?.search ?? "");
  const [search, setSearch] = useUrlSearchParam("mt_q", initialSearchValue);
  const [debouncedSearch] = useDebouncedValue(search, SEARCH_DEBOUNCE_MS, { initialValue: initialSearchValue });
  const [searchOpen, setSearchOpen] = useState(() => Boolean(initialSearchValue.trim()));
  const [sortBy, setSortBy] = useState(persisted?.sortBy ?? "recent");
  // Merge saved filters over the defaults so a missing new key does not crash.
  const [advFilters, setAdvFilters] = useState({ ...EMPTY_ADV_FILTERS, ...persisted?.advFilters, status: [] }); // a saved status filter is never restored
  const [advOpen, setAdvOpen] = useState(false);
  const filtersBtnRef = useRef(null);
  const [currentPage, setCurrentPage] = useState(1);
  // Start in the catalog when asked, so the first render does not fetch twice.
  const viewScope = useOpenEnrollmentView(initialCatalogOpen);

  const [allTrainings, setAllTrainings] = useState([]);
  const [displayTrainings, setDisplayTrainings] = useState([]);
  const [displayTotal, setDisplayTotal] = useState(0);
  const [displayTotalPages, setDisplayTotalPages] = useState(1);
  const [hasMorePages, setHasMorePages] = useState(false);
  const [safePage, setSafePage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  // Full filtered id order, used by next/prev match cycling.
  const [filteredIds, setFilteredIds] = useState([]);
  const [matchIndex, setMatchIndex] = useState(0);
  // Card with the active-match ring. Set only by next/prev, not by typing.
  const [activeMatchId, setActiveMatchId] = useState(null);
  // Target id to scroll to once its page finishes loading.
  const pendingScrollIdRef = useRef(null);
  const [batches, setBatches] = useState([]);
  const [batchesLoading, setBatchesLoading] = useState(true);

  // Those fields are stored on the batch. Join them here or the cards show them as empty.
  const batchByNum = useMemo(() => buildBatchByNumMap(batches), [batches]);

  useEffect(() => {
    if (employeeId == null) return;
    savePersistedFilters(employeeId, { selectedYear, activeBucket, search, sortBy, advFilters });
  }, [employeeId, selectedYear, activeBucket, search, sortBy, advFilters]);

  // Scroll the list back to the top when the status tab changes.
  const listScrollRef = useRef(null);
  useScrollResetOnChange(() => listScrollRef.current, [activeBucket]);

  // Clear the full training list on logout. The fetch itself is below.
  useEffect(() => {
    if (employeeId == null) setAllTrainings([]);
  }, [employeeId]);

  const clientPostFilter = needsClientPostFilter(activeBucket, advFilters, selectedYear, debouncedSearch);
  const useServerPagination = !clientPostFilter;

  useEffect(() => {
    if (employeeId == null) {
      setDisplayTrainings([]);
      setDisplayTotal(0);
      setDisplayTotalPages(1);
      setSafePage(1);
      return;
    }

    // That view shows batches, not this paged training list, so skip the fetch.
    if (viewScope.active) return;

    let cancelled = false;
    setLoading(true);
    setFetchError(null);

    const params = buildMyTrainingsQuery({
      employeeId,
      search: debouncedSearch,
      selectedYear,
      activeBucket,
      advFilters,
      page: currentPage,
      pageSize: CARDS_PER_PAGE,
      useServerPagination,
    });

    fetchTrainings(params)
      .then(({ results }) => {
        if (cancelled) return;
        const processed = processTrainingsResponse(results, { clientPostFilter, activeBucket, advFilters, selectedYear, search: debouncedSearch, sortBy, currentPage, batchByNum });
        setDisplayTrainings(processed.trainings);
        setDisplayTotal(processed.total);
        setDisplayTotalPages(processed.totalPages);
        setSafePage(processed.page);
        setHasMorePages(processed.hasMore);
        setFilteredIds(processed.allIds);
      })
      .catch((err) => {
        if (cancelled) return;
        setFetchError(err?.response?.data?.error || err?.message || "Failed to load trainings");
        setDisplayTrainings([]);
        setDisplayTotal(0);
        setDisplayTotalPages(1);
        setSafePage(1);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [
    employeeId,
    debouncedSearch,
    selectedYear,
    activeBucket,
    advFilters,
    currentPage,
    sortBy,
    clientPostFilter,
    useServerPagination,
    viewScope.active,
  ]);

  // Loads every training and every batch. Not a poll.
  // An older response is ignored if a newer fetch is already running.
  const trainingsRequestIdRef = useRef(0);
  const refetchTrainingsAndBatches = useCallback(async () => {
    if (employeeId == null) return;
    const requestId = ++trainingsRequestIdRef.current;
    try {
      const [allRes, batchesRes] = await Promise.all([
        fetchTrainings({ employee_id: employeeId }),
        fetchBatches(),
      ]);
      if (trainingsRequestIdRef.current !== requestId) return;
      setAllTrainings(allRes.results || []);
      setBatches(batchesRes.results || []);
      setBatchesLoading(false);
    } catch {
      if (trainingsRequestIdRef.current === requestId) setBatchesLoading(false);
    }
  }, [employeeId]);

  // Refresh trainings and batches when the catalog opens or closes.
  useEffect(() => {
    refetchTrainingsAndBatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId, viewScope.active]);

  useEffect(() => {
    setCurrentPage(1);
    // New search/filter — reset match cycling.
    setMatchIndex(0);
    setActiveMatchId(null);
    pendingScrollIdRef.current = null;
  }, [activeBucket, debouncedSearch, advFilters, sortBy, selectedYear]);

  const scrollToTrainingCard = useCallback((id) => {
    document.getElementById(`training-card-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    setActiveMatchId(id);
  }, []);

  // Same-page match scrolls immediately; a different page waits for its
  // fetch to land (see the pendingScrollIdRef effect below).
  const stepTrainingMatch = useCallback(
    (delta) => {
      const count = filteredIds.length;
      if (count === 0) return;
      const nextIndex = (matchIndex + delta + count) % count;
      const targetId = filteredIds[nextIndex];
      const targetPage = Math.floor(nextIndex / CARDS_PER_PAGE) + 1;
      setMatchIndex(nextIndex);
      if (targetPage === currentPage) {
        scrollToTrainingCard(targetId);
      } else {
        pendingScrollIdRef.current = targetId;
        setCurrentPage(targetPage);
      }
    },
    [filteredIds, matchIndex, currentPage, scrollToTrainingCard]
  );

  useEffect(() => {
    const pendingId = pendingScrollIdRef.current;
    if (!pendingId) return;
    if (!displayTrainings.some((t) => t.id === pendingId)) return;
    pendingScrollIdRef.current = null;
    scrollToTrainingCard(pendingId);
  }, [displayTrainings, scrollToTrainingCard]);

  const openEnrollment = useOpenEnrollmentBatches({
    batches,
    myTrainings: allTrainings,
    searchQuery: viewScope.active ? debouncedSearch : "",
  });

  const yearOptions = useMemo(() => {
    const years = new Set([CURRENT_YEAR, ...getAvailableYears(allTrainings)]);
    return [...years].sort((a, b) => b - a);
  }, [allTrainings]);

  const yearFilteredForCounts = useMemo(
    () => filterTrainingsByYear(allTrainings, selectedYear),
    [allTrainings, selectedYear]
  );

  const counts = useMemo(() => countTrainingBuckets(yearFilteredForCounts), [yearFilteredForCounts]);

  // Mode comes from the batch, so both lists go through the same merge.
  const filterOptions = useMemo(() => {
    const normalized = normalizeTrainingList(yearFilteredForCounts, batchByNum);
    return {
      status: [...new Set(normalized.map((t) => t.trainingStatus).filter(Boolean))].sort(),
      mode: [...new Set(normalized.map((t) => t.trainingMode).filter(Boolean))].sort(),
      // Latest quarter first. "YYYY-Qn" sorts that way as plain text.
      quarter: [...new Set(normalized.map((t) => t.trainingQuarter).filter(Boolean))].sort((a, b) => b.localeCompare(a)),
    };
  }, [yearFilteredForCounts, batchByNum]);

  const clearAllFilters = () => {
    setSearch("");
    setSearchOpen(false);
    setAdvFilters(EMPTY_ADV_FILTERS);
    setSelectedYear(CURRENT_YEAR);
  };

  const setAdvField = (key, value) => setAdvFilters((prev) => ({ ...prev, [key]: value }));

  const activeFilterCount =
    (selectedYear !== CURRENT_YEAR ? 1 : 0) +
    advFilters.status.length +
    advFilters.mode.length +
    advFilters.quarter.length;
  const hasActiveFilters = Boolean(search.trim()) || activeFilterCount > 0;

  const activeFilterChips = useMemo(() => {
    const chips = [];
    if (selectedYear !== CURRENT_YEAR) {
      chips.push({
        key: "year",
        label: `Year: ${selectedYear === ALL_YEARS ? "All Years" : selectedYear}`,
        clear: () => setSelectedYear(CURRENT_YEAR),
      });
    }
    advFilters.status.forEach((val) =>
      chips.push({ key: `status:${val}`, label: `Status: ${val}`, clear: () => setAdvField("status", advFilters.status.filter((v) => v !== val)) })
    );
    advFilters.mode.forEach((val) =>
      chips.push({ key: `mode:${val}`, label: `Mode: ${val}`, clear: () => setAdvField("mode", advFilters.mode.filter((v) => v !== val)) })
    );
    advFilters.quarter.forEach((val) =>
      chips.push({ key: `quarter:${val}`, label: `Quarter: ${val}`, clear: () => setAdvField("quarter", advFilters.quarter.filter((v) => v !== val)) })
    );
    return chips;
  }, [selectedYear, advFilters]);

  const [removingChipKeys, setRemovingChipKeys] = useState(() => new Set());
  const CHIP_EXIT_MS = 150;
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

  const statusTabItems = useMemo(
    () => MY_TRAININGS_TABS.map((bucket) => ({ key: bucket.key, label: bucket.label, count: counts[bucket.key] ?? 0 })),
    [counts]
  );

  // Badge on the bell: new open batches only. The catalog list is a different count.
  const openBatchesCount = useMemo(() => countOpenEnrollmentBatches(batches), [batches]);
  const yearLabel = selectedYear === ALL_YEARS ? "All Years" : selectedYear;
  const activeBucketLabel = MY_TRAININGS_TABS.find((b) => b.key === activeBucket)?.label;
  const scopeCtx = { activeBucketLabel, count: openEnrollment.count, actionableCount: openEnrollment.actionableCount };
  const breadcrumbTail = viewScope.scope.getBreadcrumbTail(scopeCtx);

  return (
    <div className="flex flex-col h-full min-h-0 p-3 gap-2">
      <div className="shrink-0 flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
        <button type="button" onClick={onBack} className={`flex items-center gap-0.5 hover:text-blue-500 transition-colors cursor-pointer rounded ${FOCUS_RING}`}>
          <FiChevronLeft className="h-3.5 w-3.5" /> Home
        </button>
        <span>/</span>
        <span className={breadcrumbTail ? "hover:text-blue-500 cursor-pointer" : "text-gray-600 dark:text-gray-300 font-medium"}>
          {breadcrumbTail ? (
            <button type="button" onClick={viewScope.exit} className={`hover:text-blue-500 transition-colors cursor-pointer rounded ${FOCUS_RING}`}>
              My Trainings
            </button>
          ) : (
            "My Trainings"
          )}
        </span>
        {breadcrumbTail && (
          <>
            <span>/</span>
            <span className="text-gray-600 dark:text-gray-300 font-medium">{breadcrumbTail}</span>
          </>
        )}
      </div>

      {/* Title and search label are announced together when the catalog opens. */}
      <div aria-live="polite" className="contents">
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 min-w-0">
            <h1 className="shrink-0 text-lg font-bold text-gray-900 dark:text-white leading-tight">
              {viewScope.scope.getTitle(scopeCtx)}
            </h1>

            {viewScope.active && openEnrollment.actionableCount > 0 && openEnrollment.actionableCount < openEnrollment.count && (
              <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 ring-1 ring-blue-100 dark:ring-blue-800/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 text-xs font-semibold">
                <FiStar className="h-3 w-3 motion-safe:animate-pulse" aria-hidden="true" />
                {openEnrollment.actionableCount} still open to request
              </span>
            )}

            {viewScope.scope.showTabs && (
              <StatusTabs
                items={statusTabItems}
                activeKey={activeBucket}
                onChange={setActiveBucket}
                ariaLabel="Filter trainings by status"
              />
            )}
          </div>

        <div className="flex flex-wrap shrink-0 items-center justify-end gap-2 ml-auto">
          {openBatchesCount > 0 && (
            <NotificationBellButton
              count={openBatchesCount}
              open={viewScope.active}
              onClick={viewScope.toggle}
              label="Nominate for Training"
              panelId="my-trainings-content"
            />
          )}

          {/* Scoped wrapper so Enter only cycles matches, not Filters/Sort. */}
          <div
            className="flex items-center gap-2"
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.target.tagName !== "INPUT") return;
              event.preventDefault();
              if (event.shiftKey) stepTrainingMatch(-1);
              else stepTrainingMatch(1);
            }}
          >
            {searchOpen && (
              <SearchScopeLabel scope={viewScope.scope.getSearchScopeLabel(scopeCtx)} />
            )}
            <SearchToggle
              value={search}
              onChange={setSearch}
              open={searchOpen}
              onOpenChange={setSearchOpen}
              placeholder={viewScope.scope.searchPlaceholder}
              ariaLabel={viewScope.active ? "Search open batches" : "Search trainings"}
            />
            {!viewScope.active && searchOpen && debouncedSearch.trim() && (
              <SearchMatchNav
                count={displayTotal}
                activeIndex={matchIndex}
                onPrev={() => stepTrainingMatch(-1)}
                onNext={() => stepTrainingMatch(1)}
                itemLabel="trainings"
              />
            )}
          </div>

          {/* Year, status, and mode filter trainings, not open batches, so hide them here. */}
          {viewScope.scope.showTabs && (
            <button
              ref={filtersBtnRef}
              type="button"
              onClick={() => setAdvOpen((v) => !v)}
              aria-expanded={advOpen}
              aria-controls="advanced-filters-panel"
              className={`shrink-0 inline-flex items-center gap-1.5 h-9 pl-3 pr-2.5 rounded-full text-[11px] font-semibold transition-colors cursor-pointer ${FOCUS_RING} ${
                advOpen || activeFilterCount > 0
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
              <FiChevronDown className={`hidden sm:block h-3 w-3 transition-transform duration-150 ${advOpen ? "rotate-180" : ""}`} />
            </button>
          )}
        </div>
        </div>
      </div>

      <FilterPopover open={advOpen} onClose={() => setAdvOpen(false)} anchorRef={filtersBtnRef} panelId="advanced-filters-panel">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Filters</span>
            {hasActiveFilters && (
              <button type="button" onClick={clearAllFilters} className={`text-[11px] text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded ${FOCUS_RING}`}>
                Clear all
              </button>
            )}
          </div>

          <label className="flex flex-col gap-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">
            Sort
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              aria-label="Sort trainings"
              className={`w-full text-xs bg-gray-50 dark:bg-gray-900/40 text-gray-700 dark:text-gray-200 rounded-lg px-2.5 py-2 border-0 cursor-pointer ${FOCUS_RING}`}
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">
            Year
            <YearFilter
              years={yearOptions}
              value={selectedYear}
              onChange={setSelectedYear}
              className={`w-full text-xs bg-gray-50 dark:bg-gray-900/40 text-gray-700 dark:text-gray-200 rounded-lg px-2.5 py-2 border-0 cursor-pointer ${FOCUS_RING}`}
            />
          </label>

          <div className="flex flex-col gap-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">
            Status
            <MultiSelectFilter label="Status" allLabel="All Statuses" options={filterOptions.status} selected={advFilters.status} onChange={(v) => setAdvField("status", v)} />
          </div>

          <div className="flex flex-col gap-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">
            Training Mode
            <MultiSelectFilter label="Training Mode" allLabel="All Modes" options={filterOptions.mode} selected={advFilters.mode} onChange={(v) => setAdvField("mode", v)} />
          </div>

          <div className="flex flex-col gap-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">
            Training Quarter
            <MultiSelectFilter label="Training Quarter" allLabel="All Quarters" options={filterOptions.quarter} selected={advFilters.quarter} onChange={(v) => setAdvField("quarter", v)} />
          </div>
        </div>
      </FilterPopover>

      {viewScope.scope.showTabs && activeFilterChips.length > 0 && (
        <div className="shrink-0 flex flex-wrap items-center gap-1.5">
          {activeFilterChips.map((chip) => (
            <FilterChip
              key={chip.key}
              label={chip.label}
              exiting={removingChipKeys.has(chip.key)}
              onRemove={() => removeChip(chip)}
            />
          ))}
          <button type="button" onClick={clearAllFilters} className={`text-[11px] text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 ml-1 rounded ${FOCUS_RING}`}>
            Clear all
          </button>
        </div>
      )}

      {viewScope.active ? (
        <OpenEnrollmentGrid
          items={openEnrollment.items}
          loading={batchesLoading}
          searchQuery={debouncedSearch}
          employeeId={employeeId}
          trainings={allTrainings}
          onRefreshNeeded={() => refetchTrainingsAndBatches()}
          onViewBatch={(batchNum) =>
            goToTrainingBatches(batchNum, undefined, { label: "Open for Enrollment", homePanel: "trainings", catalogOpen: true })
          }
        />
      ) : loading ? (
        <div className="flex-1 min-h-0 flex items-center justify-center py-12 text-gray-500 dark:text-gray-400">
          <LoadingSpinner label="Loading trainings..." />
        </div>
      ) : fetchError ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center py-12">
          <FiAlertCircle className="h-8 w-8 text-red-400 mb-2" />
          <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Could not load trainings</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 max-w-sm">{fetchError}</p>
        </div>
      ) : displayTrainings.length === 0 ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center py-12">
          <FiInbox className="h-8 w-8 text-gray-300 dark:text-gray-600 mb-2" />
          <p className="text-sm font-medium text-gray-600 dark:text-gray-300">No trainings found</p>
          {hasActiveFilters ? (
            <>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Try changing your filters</p>
              <button
                type="button"
                onClick={clearAllFilters}
                className={`mt-3 px-3 py-1.5 rounded-[10px] bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors cursor-pointer ${FOCUS_RING}`}
              >
                Clear Filters
              </button>
            </>
          ) : (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">No trainings for {yearLabel}.</p>
          )}
        </div>
      ) : (
        <div ref={listScrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain hide-scrollbar">
          <EntityCardGrid>
            {displayTrainings.map((training) => (
              <EntityCard
                key={training.id}
                {...toEntityCardProps(training, {
                  onClick: () =>
                    goToTrainingBatches(training.batch, undefined, { label: "My Trainings", homePanel: "trainings", catalogOpen: false }),
                })}
                searchQuery={debouncedSearch}
                domId={`training-card-${training.id}`}
                isActiveMatch={activeMatchId === training.id}
              />
            ))}
          </EntityCardGrid>
        </div>
      )}

      {!viewScope.active && !loading && !fetchError && (
        <CardListPagination
          page={safePage}
          totalPages={displayTotalPages}
          total={displayTotal}
          pageSize={CARDS_PER_PAGE}
          itemLabel="trainings"
          hasMorePages={hasMorePages}
          onPrev={() => setCurrentPage((p) => Math.max(1, p - 1))}
          onNext={() => setCurrentPage((p) => p + 1)}
        />
      )}
    </div>
  );
}
