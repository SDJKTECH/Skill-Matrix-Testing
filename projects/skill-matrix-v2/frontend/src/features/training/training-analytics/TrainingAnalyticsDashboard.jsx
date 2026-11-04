import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiChevronLeft, FiList, FiLayers, FiUsers, FiCheckCircle, FiAlertTriangle, FiClipboard } from "react-icons/fi";
import { useTrainingAnalytics } from "./hooks/useTrainingAnalytics";
import { useCertificateAnalytics } from "./hooks/useCertificateAnalytics";
import {
  buildBatchRows,
  buildEmployeeBatchRows,
  buildEmployeeStatusRows,
  buildEnrollmentStatusAreaGroupedData,
  buildModuleAreaMap,
  countByField,
  countDistinctBatchesByQuarter,
  countEmployeesByTrainingStatus,
  countEnrollmentsByTrainingStatus,
  filterRecords,
  getAreaOrderById,
  getUniqueQuarters,
  getUniqueValues,
  parseQuarterSortKey,
} from "./services/trainingAnalyticsAggregation";
import { countCertificatesByStatus, filterCertRecords } from "./services/certificateAnalyticsAggregation";
import { HOME_PROGRESS_BUCKET_CONFIG } from "../shared/config/trainingStatusBuckets";
import PieChartCard from "./components/PieChartCard";
import ModuleBarChart from "./components/ModuleBarChart";
import BatchesByQuarterTable from "./components/BatchesByQuarterTable";
import EmployeesByStatusChart from "./components/EmployeesByStatusChart";
import EmployeeTable from "./components/EmployeeTable";
import BatchTable from "./components/BatchTable";
import CertificationsByStatusChart from "./components/CertificationsByStatusChart";
import TrainingFilterBar from "./components/TrainingFilterBar";
import StatTile from "./components/StatTile";
import SegmentedToggle from "../shared/components/SegmentedToggle";
import MultiSelectFilter from "../shared/components/filters/MultiSelectFilter";

// Module-level so SegmentedToggle's options array identity stays stable across renders.
const VIEW_OPTIONS = [
  { key: "training", label: "Training" },
  { key: "certifications", label: "Certifications" },
];

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
      {[0, 1].map((i) => (
        <div key={i} className="h-72 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
      ))}
      <div className="lg:col-span-2 h-72 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
    </div>
  );
}

// Toggle membership: click again to deselect, same as unchecking it in the dropdown.
const toggle = (list, value) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

// Training view and Certifications view, switched via the header's SegmentedToggle.
// Each view's record set is fetched once and filtered/exported in memory. Props: { onBack }
export default function TrainingAnalyticsDashboard({ onBack }) {
  const [view, setView] = useState("training"); // "training" | "certifications"

  const { records, loading, error, refetch } = useTrainingAnalytics();
  // Certifications have no batch/hierarchy link, so they're fetched independently
  // and get their own Provider-only filter instead of joining the cascade below.
  const { records: certRecords, loading: certLoading, error: certError, refetch: certRefetch } = useCertificateAnalytics();

  const [selectedQuarters, setSelectedQuarters] = useState([]);
  const [selectedAreas, setSelectedAreas] = useState([]);
  const [selectedSubAreas, setSelectedSubAreas] = useState([]);
  const [selectedModules, setSelectedModules] = useState([]);

  // Active {status, area} pairs from chart-segment clicks — re-clicking one removes exactly
  // that pair (unlike two independent toggle lists, which can cross-contaminate each other).
  const [activeSegments, setActiveSegments] = useState([]);
  const selectedStatuses = useMemo(() => Array.from(new Set(activeSegments.map((s) => s.status))), [activeSegments]);
  const chartActiveAreas = useMemo(
    () => Array.from(new Set(activeSegments.map((s) => s.area).filter(Boolean))),
    [activeSegments]
  );
  // Pie-picked areas unioned with chart-implied ones — the cascade filter reads this, not raw selectedAreas.
  const effectiveSelectedAreas = useMemo(
    () => Array.from(new Set([...selectedAreas, ...chartActiveAreas])),
    [selectedAreas, chartActiveAreas]
  );

  // Cascade: quarter -> area -> sub area -> module. Each dropdown's options come from
  // the stage upstream of its own selection, so an excluded value stays choosable to re-add.
  const quarterFiltered = useMemo(() => filterRecords(records, { quarters: selectedQuarters }), [records, selectedQuarters]);
  const areaFiltered = useMemo(
    () => filterRecords(quarterFiltered, { areas: effectiveSelectedAreas }),
    [quarterFiltered, effectiveSelectedAreas]
  );
  const subAreaFiltered = useMemo(() => filterRecords(areaFiltered, { subAreas: selectedSubAreas }), [areaFiltered, selectedSubAreas]);
  const moduleFiltered = useMemo(() => filterRecords(subAreaFiltered, { modules: selectedModules }), [subAreaFiltered, selectedModules]);

  const quarterOptions = useMemo(() => getUniqueQuarters(records, true), [records]);
  const areaOptions = useMemo(() => getUniqueValues(quarterFiltered, "area_name"), [quarterFiltered]);
  const subAreaOptions = useMemo(() => getUniqueValues(areaFiltered, "sub_area_name"), [areaFiltered]);
  const moduleOptions = useMemo(() => getUniqueValues(subAreaFiltered, "module_name"), [subAreaFiltered]);

  // Defaults Batch Quarter to the current year once per mount, so the dashboard
  // opens scoped to "this year" without fighting a user who clears it afterward.
  const defaultAppliedRef = useRef(false);
  useEffect(() => {
    if (defaultAppliedRef.current || quarterOptions.length === 0) return;
    defaultAppliedRef.current = true;
    const currentYear = new Date().getFullYear();
    const currentYearQuarters = quarterOptions.filter((q) => Math.floor(parseQuarterSortKey(q) ?? -1) === currentYear);
    if (currentYearQuarters.length > 0) setSelectedQuarters(currentYearQuarters);
  }, [quarterOptions]);

  const areaData = useMemo(() => countByField(areaFiltered, "area_name", { foldOthers: true }), [areaFiltered]);
  const subAreaData = useMemo(() => countByField(subAreaFiltered, "sub_area_name", { foldOthers: true }), [subAreaFiltered]);
  const moduleData = useMemo(() => countByField(moduleFiltered, "module_name"), [moduleFiltered]);
  const moduleAreaMap = useMemo(() => buildModuleAreaMap(moduleFiltered), [moduleFiltered]);
  const { rows: batchesByQuarter, areas: batchQuarterAreas } = useMemo(
    () => countDistinctBatchesByQuarter(moduleFiltered),
    [moduleFiltered]
  );
  const employeeStatusRows = useMemo(() => buildEmployeeStatusRows(moduleFiltered), [moduleFiltered]);
  const employeesByStatus = useMemo(() => countEmployeesByTrainingStatus(employeeStatusRows), [employeeStatusRows]);
  // Fixed Area color order for the status-by-area chart, by area_id rather than volume so
  // it stays stable as data accumulates too (see getAreaOrderById).
  const statusAreaOrder = useMemo(() => getAreaOrderById(records), [records]);
  // One row per (employee, batch) — the Employees table's grain, so its per-batch fields reflect the actual batch.
  const employeeBatchRows = useMemo(() => buildEmployeeBatchRows(moduleFiltered), [moduleFiltered]);
  // Enrollment-grain (not employeeStatusRows above), so this agrees with the Employees grid.
  const enrollmentsByStatus = useMemo(() => countEnrollmentsByTrainingStatus(employeeBatchRows), [employeeBatchRows]);
  const enrollmentStatusAreaGroupedData = useMemo(
    () => buildEnrollmentStatusAreaGroupedData(employeeBatchRows, statusAreaOrder),
    [employeeBatchRows, statusAreaOrder]
  );

  // Toggles this exact {status, area} pair in activeSegments — see its own comment above.
  const handleStatusBarClick = (status, area) => {
    setActiveSegments((prev) =>
      prev.some((s) => s.status === status && s.area === area)
        ? prev.filter((s) => !(s.status === status && s.area === area))
        : [...prev, { status, area }]
    );
  };
  // Clicking a Batches row drills the Employees table down to just that batch;
  // clicking the same row again clears it, same toggle shape as a status bar.
  const [selectedBatchId, setSelectedBatchId] = useState(null);
  const handleBatchRowClick = (batchId) => setSelectedBatchId((prev) => (prev === batchId ? null : batchId));
  const filteredEmployeeRows = useMemo(() => {
    let result = employeeBatchRows;
    if (selectedStatuses.length > 0) result = result.filter((r) => selectedStatuses.includes(r.status_bucket));
    if (selectedBatchId != null) result = result.filter((r) => r.batch_id === selectedBatchId);
    return result;
  }, [employeeBatchRows, selectedStatuses, selectedBatchId]);

  const filteredBatchRows = useMemo(() => buildBatchRows(moduleFiltered), [moduleFiltered]);
  // Batches grid only (not BatchesByQuarterTable, which stays scoped to the top filter
  // bar) also narrows to selectedStatuses — batches with at least one matching enrollment.
  const batchTableRows = useMemo(() => {
    if (selectedStatuses.length === 0) return filteredBatchRows;
    const selectedKeys = HOME_PROGRESS_BUCKET_CONFIG.filter((b) => selectedStatuses.includes(b.label)).map((b) => b.key);
    return filteredBatchRows.filter((row) => selectedKeys.some((key) => (row.status_counts[key] ?? 0) > 0));
  }, [filteredBatchRows, selectedStatuses]);

  // Header stat tiles — same filtered set the charts below render from.
  const totalBatches = filteredBatchRows.length;
  const completedCount = employeesByStatus.buckets.find((b) => b.key === "completed")?.count ?? 0;
  const completionRate = employeesByStatus.totalEmployees > 0
    ? Math.round((completedCount / employeesByStatus.totalEmployees) * 100)
    : 0;
  // "Incomplete Training" tooltip breakdown, from the same per-bucket counts as the status chart —
  // an employee in two of these buckets is counted in both, so they don't sum to notCompletedCount.
  const notStartedEmployeeCount = employeesByStatus.buckets.find((b) => b.key === "notStarted")?.count ?? 0;
  const inProgressEmployeeCount = employeesByStatus.buckets.find((b) => b.key === "inProgress")?.count ?? 0;
  const notCompletedStatusEmployeeCount = employeesByStatus.buckets.find((b) => b.key === "notCompleted")?.count ?? 0;

  // Certifications view: single Provider filter, reusing MultiSelectFilter/getUniqueValues.
  const [selectedProviders, setSelectedProviders] = useState([]);
  const providerOptions = useMemo(() => getUniqueValues(certRecords, "cert_provider"), [certRecords]);
  const providerFilteredCertRecords = useMemo(
    () => filterCertRecords(certRecords, { providers: selectedProviders }),
    [certRecords, selectedProviders]
  );
  const certificatesByStatus = useMemo(() => countCertificatesByStatus(providerFilteredCertRecords), [providerFilteredCertRecords]);
  const providerData = useMemo(
    () => countByField(providerFilteredCertRecords, "cert_provider", { foldOthers: true }),
    [providerFilteredCertRecords]
  );

  // Each export reads the same in-memory filtered array its chart renders from,
  // so the CSV always matches what's on screen instead of a fresh, possibly-drifted fetch.
  const exportAreaRecords = useCallback(() => areaFiltered, [areaFiltered]);
  const exportSubAreaRecords = useCallback(() => subAreaFiltered, [subAreaFiltered]);
  const exportModuleRecords = useCallback(() => moduleFiltered, [moduleFiltered]);

  // status_counts is a nested object (for the info popover), so it's flattened
  // into per-status CSV columns here — shared by both exports below.
  const flattenBatchRows = (rows) =>
    rows.map(({ status_counts, ...rest }) => ({
      ...rest,
      ...Object.fromEntries(HOME_PROGRESS_BUCKET_CONFIG.map((b) => [`${b.label} Count`, status_counts[b.key] ?? 0])),
    }));
  // Batches-by-Quarter's own export — stays scoped to the top filter bar only.
  const exportBatchDetail = useCallback(() => flattenBatchRows(filteredBatchRows), [filteredBatchRows]);
  // Batches grid's export reads its own (status-narrowed) rows, so the CSV always matches what's on screen.
  const exportBatchTableRows = useCallback(() => flattenBatchRows(batchTableRows), [batchTableRows]);
  // Enrollments chart's export reads the same enrollment-grain rows its bars are built from.
  const exportEnrollmentStatusDetail = useCallback(() => employeeBatchRows, [employeeBatchRows]);
  // The grid below can be further narrowed by clicking a status bar, so its
  // own export reads that filtered view rather than the chart's full set.
  const exportEmployeeTableRows = useCallback(() => filteredEmployeeRows, [filteredEmployeeRows]);

  const exportCertificateRecords = useCallback(() => providerFilteredCertRecords, [providerFilteredCertRecords]);

  const handleAreaSliceClick = (name) => setSelectedAreas((prev) => toggle(prev, name));
  const handleSubAreaSliceClick = (name) => setSelectedSubAreas((prev) => toggle(prev, name));
  const handleModuleSliceClick = (name) => setSelectedModules((prev) => toggle(prev, name));
  const handleProviderSliceClick = (name) => setSelectedProviders((prev) => toggle(prev, name));

  const hasActiveFilters =
    selectedQuarters.length > 0 || selectedAreas.length > 0 || selectedSubAreas.length > 0 || selectedModules.length > 0;
  const clearAll = () => {
    setSelectedQuarters([]);
    setSelectedAreas([]);
    setSelectedSubAreas([]);
    setSelectedModules([]);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="shrink-0 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
            title="Back to overview"
          >
            <FiChevronLeft className="h-4 w-4" />
          </button>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">Training Analytics</h1>
        </div>
        <SegmentedToggle
          options={VIEW_OPTIONS}
          value={view}
          onChange={setView}
          ariaLabel="Switch between Training and Certifications view"
        />
      </div>

      {view !== "training" ? null : loading ? (
        <LoadingSkeleton />
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 px-4 text-center rounded-xl border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400">
          <p className="text-sm font-medium">Failed to load training analytics.</p>
          <p className="text-xs">{error}</p>
          <button type="button" onClick={refetch} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
            Try again
          </button>
        </div>
      ) : records.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 px-4 text-center rounded-xl border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400">
          <FiList className="h-6 w-6" />
          <p className="text-sm font-medium">No training records found.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
            <TrainingFilterBar
              quarterOptions={quarterOptions}
              selectedQuarters={selectedQuarters}
              onQuartersChange={setSelectedQuarters}
              areaOptions={areaOptions}
              selectedAreas={selectedAreas}
              onAreasChange={setSelectedAreas}
              subAreaOptions={subAreaOptions}
              selectedSubAreas={selectedSubAreas}
              onSubAreasChange={setSelectedSubAreas}
              moduleOptions={moduleOptions}
              selectedModules={selectedModules}
              onModulesChange={setSelectedModules}
              hasActiveFilters={hasActiveFilters}
              onClearAll={clearAll}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
              <span className="font-semibold text-gray-900 dark:text-white">{moduleFiltered.length.toLocaleString()}</span>
              {" "}of {records.length.toLocaleString()} records
            </p>
          </div>

          {/* Reflects the same moduleFiltered set the charts below render from,
              so it stays in sync with the filters above rather than the full record set. */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 shrink-0">
            <StatTile
              icon={FiLayers}
              n={totalBatches.toLocaleString()}
              label="Batches"
              colorClass="text-slate-600 dark:text-slate-300"
              iconBgClass="bg-slate-100 dark:bg-slate-700/60"
              helpText="Number of training batches running."
            />
            <StatTile
              icon={FiClipboard}
              n={moduleFiltered.length.toLocaleString()}
              label="Total enrollments"
              colorClass="text-indigo-600 dark:text-indigo-400"
              iconBgClass="bg-indigo-50 dark:bg-indigo-900/20"
              helpText="Total employee enrollments across all training batches."
            />
            <StatTile
              icon={FiUsers}
              n={employeesByStatus.totalEmployees.toLocaleString()}
              label="Employees trained"
              colorClass="text-blue-600 dark:text-blue-400"
              iconBgClass="bg-blue-50 dark:bg-blue-900/20"
              helpText="Number of unique employees who have taken training."
            />
            <StatTile
              icon={FiCheckCircle}
              n={`${completionRate}%`}
              label="Completion rate"
              colorClass="text-green-600 dark:text-green-400"
              iconBgClass="bg-green-50 dark:bg-green-900/20"
              helpText="Share of employees who have successfully completed at least one training."
            />
            <StatTile
              icon={FiAlertTriangle}
              n={employeesByStatus.notCompletedCount.toLocaleString()}
              label="Incomplete Training"
              colorClass="text-orange-600 dark:text-orange-400"
              iconBgClass="bg-orange-50 dark:bg-orange-900/20"
              helpText={`Employees yet to complete their training, out of which:\nNot Started: ${notStartedEmployeeCount.toLocaleString()}\nIn Progress: ${inProgressEmployeeCount.toLocaleString()}\nNot Completed: ${notCompletedStatusEmployeeCount.toLocaleString()}`}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">
            <PieChartCard
              title="Records by Area"
              data={areaData}
              selectedNames={effectiveSelectedAreas}
              onSliceClick={handleAreaSliceClick}
              exportFilename="records-by-area.csv"
              onExport={exportAreaRecords}
            />
            <PieChartCard
              title="Records by Sub Area"
              data={subAreaData}
              selectedNames={selectedSubAreas}
              onSliceClick={handleSubAreaSliceClick}
              exportFilename="records-by-sub-area.csv"
              onExport={exportSubAreaRecords}
            />
            <BatchesByQuarterTable rows={batchesByQuarter} areas={batchQuarterAreas} onExport={exportBatchDetail} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
            <ModuleBarChart
              data={moduleData}
              selectedNames={selectedModules}
              onSliceClick={handleModuleSliceClick}
              onExport={exportModuleRecords}
              moduleOptions={moduleOptions}
              onModulesChange={setSelectedModules}
              moduleAreaMap={moduleAreaMap}
            />
            <EmployeesByStatusChart
              data={enrollmentsByStatus}
              selectedNames={selectedStatuses}
              onSliceClick={handleStatusBarClick}
              onExport={exportEnrollmentStatusDetail}
              groupedData={enrollmentStatusAreaGroupedData}
              areaOrder={statusAreaOrder}
            />
          </div>
          <BatchTable
            rows={batchTableRows}
            onExport={exportBatchTableRows}
            selectedBatchId={selectedBatchId}
            onBatchClick={handleBatchRowClick}
          />
          <EmployeeTable
            rows={filteredEmployeeRows}
            onExport={exportEmployeeTableRows}
            activeBatchLabel={
              selectedBatchId == null
                ? undefined
                : filteredBatchRows.find((b) => b.batch_id === selectedBatchId)?.batch_num ?? `#${selectedBatchId}`
            }
            onClearBatchFilter={() => setSelectedBatchId(null)}
          />
        </>
      )}

      {view !== "certifications" ? null : certLoading ? (
        <div className="h-72 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
      ) : certError ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 px-4 text-center rounded-xl border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400">
          <p className="text-sm font-medium">Failed to load certifications.</p>
          <p className="text-xs">{certError}</p>
          <button type="button" onClick={certRefetch} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
            Try again
          </button>
        </div>
      ) : certRecords.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 px-4 text-center rounded-xl border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400">
          <FiList className="h-6 w-6" />
          <p className="text-sm font-medium">No certification records found.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
            <MultiSelectFilter
              label="Provider"
              allLabel="All Providers"
              options={providerOptions}
              selected={selectedProviders}
              onChange={setSelectedProviders}
              minWidthClass="min-w-[10rem]"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
              <span className="font-semibold text-gray-900 dark:text-white">{providerFilteredCertRecords.length.toLocaleString()}</span>
              {" "}of {certRecords.length.toLocaleString()} records
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
            <PieChartCard
              title="Certifications by Provider"
              data={providerData}
              selectedNames={selectedProviders}
              onSliceClick={handleProviderSliceClick}
              exportFilename="certifications-by-provider.csv"
              onExport={exportCertificateRecords}
            />
            <CertificationsByStatusChart data={certificatesByStatus} onExport={exportCertificateRecords} />
          </div>
        </>
      )}
    </div>
  );
}
