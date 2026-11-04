import React, { useState, useRef, useCallback, useEffect } from "react";
import { FiPlus } from "react-icons/fi";
import BatchTable from "./BatchTable";
import ErrorBoundary from "./ErrorBoundary";
import Breadcrumb from "../../shared/components/Breadcrumb";
import SearchToggle from "../../shared/components/filters/SearchToggle";
import SearchScopeLabel from "../../shared/components/filters/SearchScopeLabel";
import SearchMatchNav from "../../shared/components/filters/SearchMatchNav";
import { useBatchPermissions, BATCH_ACTIONS } from "../services/batchPermissions";
import { TrainingBatchOriginProvider } from "../context/TrainingBatchOriginContext";
import { BATCH_VIEW_ORIGIN } from "../services/batchViewOrigin";
import useUrlSearchParam from "../../shared/hooks/useUrlSearchParam";
import { useManagerApprovals } from "../../../../context/ManagerApprovalsContext";

// The dropdown lists for this page are loaded when the app starts
// (TrainingReferenceDataProvider in main.jsx), not when this page opens.
export default function AdminTrainingDashboard({ onBack, onGoHome, scopeTarget, origin, deepLinkSource = null, onBackToDeepLinkSource, createBatchPrefillData = null }) {
  // Open the Create form at once if prefill data was passed (see AdminDashboard.jsx).
  const [createOpen, setCreateOpen] = useState(() => createBatchPrefillData != null);
  // Cleared on close so a later Create Batch opens empty.
  const [prefill, setPrefill] = useState(createBatchPrefillData);
  useEffect(() => {
    if (createBatchPrefillData != null) { setPrefill(createBatchPrefillData); setCreateOpen(true); }
  }, [createBatchPrefillData]);
  const closeCreate = () => { setCreateOpen(false); setPrefill(null); };
  const [searchOpen, setSearchOpen] = useState(false);
  // Use "batch_q", not "q": all tabs share one URL, so each page needs its own
  // name or the search would carry over to another tab.
  const [searchQuery, setSearchQuery] = useUrlSearchParam("batch_q");
  const [matchInfo, setMatchInfo] = useState({ count: 0, index: 0 });
  const batchTableRef = useRef(null);
  // Enter / Shift+Enter jumps to the next / previous match, like Ctrl+F in a
  // browser. Only for the search box, so the arrow buttons do not run it twice.
  const handleSearchNavKeyDown = useCallback((event) => {
    if (event.key !== "Enter" || event.target.tagName !== "INPUT") return;
    event.preventDefault();
    if (event.shiftKey) batchTableRef.current?.goToPrevMatch();
    else batchTableRef.current?.goToNextMatch();
  }, []);
  const { can, isFullAccess } = useBatchPermissions(origin);
  const canCreate = can(BATCH_ACTIONS.CREATE_BATCH);
  const fromManagerDashboard = origin === BATCH_VIEW_ORIGIN.MANAGER_DASHBOARD;
  const fromOpenEnrollment = Boolean(deepLinkSource?.catalogOpen);
  // Opened from the Admin Dashboard (not from Manager Dashboard or Open for
  // Enrollment): an Admin sees every pending approval in the company.
  const { setOrgWideApprovals, canViewOrgWide } = useManagerApprovals();
  useEffect(() => {
    if (!canViewOrgWide || fromManagerDashboard || fromOpenEnrollment) return undefined;
    setOrgWideApprovals(true);
    return () => setOrgWideApprovals(false);
  }, [canViewOrgWide, fromManagerDashboard, fromOpenEnrollment, setOrgWideApprovals]);
  // Page path at the top: Home / <previous page> / Training Batches. The middle
  // part is the page the user really came from (e.g. My Trainings), so
  // clicking it takes them back there.
  const breadcrumbItems = fromManagerDashboard
    ? [
        { key: "home", label: "Home", onClick: onGoHome },
        { key: "parent", label: "Manager Dashboard", onClick: onBack },
        { key: "training-batches", label: "Training Batches" },
      ]
    : deepLinkSource
    ? [
        { key: "home", label: "Home", onClick: onGoHome },
        { key: "parent", label: deepLinkSource.label, onClick: onBackToDeepLinkSource },
        { key: "training-batches", label: "Training Batches" },
      ]
    : [
        { key: "home", label: "Home", onClick: onGoHome },
        { key: "parent", label: "Admin Dashboard", onClick: onBack },
        { key: "training-batches", label: "Training Batches" },
      ];

  return (
    // Gives `origin` to all components inside, so their permission checks
    // (useBatchPermissions) can use it without passing it through each one.
    <TrainingBatchOriginProvider origin={origin}>
      <div className="shrink-0">
        <Breadcrumb items={breadcrumbItems} />
      </div>

      {/* Header: title on the left, search and Create Batch on the right.
          Hidden while the Create form is open (it has its own ✕). */}
      <div className="shrink-0 flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">Training Batches</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {isFullAccess ? "Manage training batches" : "Browse training batches"}
          </p>
        </div>
        {!createOpen && (
          <div className="shrink-0 flex items-center gap-2">
            {/* Separate wrapper so Enter here does not also press Create Batch. */}
            <div className="shrink-0 flex items-center gap-2" onKeyDown={handleSearchNavKeyDown}>
              {searchOpen && <SearchScopeLabel scope="Training Batches" />}
              <SearchToggle
                value={searchQuery}
                onChange={setSearchQuery}
                open={searchOpen}
                onOpenChange={setSearchOpen}
                placeholder="Search batches, modules, people…"
                ariaLabel="Search training batches"
              />
              {searchOpen && searchQuery.trim() && (
                <SearchMatchNav
                  count={matchInfo.count}
                  activeIndex={matchInfo.index}
                  onPrev={() => batchTableRef.current?.goToPrevMatch()}
                  onNext={() => batchTableRef.current?.goToNextMatch()}
                  itemLabel="batches"
                />
              )}
            </div>
            {canCreate && (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                aria-expanded={createOpen}
                aria-controls="createBatchPanel"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors shadow-sm"
              >
                <FiPlus className="h-4 w-4" />
                Create Batch
              </button>
            )}
          </div>
        )}
      </div>

      {/* If the table crashes while showing on screen, show "Try again"
          instead of a blank page. */}
      <ErrorBoundary label="the Training Batches page">
        <BatchTable
          ref={batchTableRef}
          createOpen={createOpen}
          onCreateClose={closeCreate}
          createBatchPrefillData={prefill}
          scopeTarget={scopeTarget}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          searchOpen={searchOpen}
          onSearchOpenChange={setSearchOpen}
          onSearchMatchInfoChange={setMatchInfo}
          hideApprovals={fromOpenEnrollment}
          defaultStatusFilter={!scopeTarget && !deepLinkSource && !fromManagerDashboard}
          onPendingScopeClose={fromManagerDashboard ? onBack : undefined}
        />
      </ErrorBoundary>
    </TrainingBatchOriginProvider>
  );
}
