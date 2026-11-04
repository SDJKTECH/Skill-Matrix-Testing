import React, { useMemo, useRef, useState } from "react";
import { FiChevronLeft, FiChevronRight, FiChevronUp, FiChevronDown, FiInfo } from "react-icons/fi";
import { HOME_PROGRESS_BUCKET_CONFIG } from "../../shared/config/trainingStatusBuckets";
import { STATUS_COLORS } from "../services/chartPalette";
import InfoPopover from "../../shared/components/InfoPopover";
import ExportButton from "./ExportButton";

const ROWS_PER_PAGE = 10;

const COLUMNS = [
  { field: "batch_num", label: "Batch" },
  { field: "batch_desc", label: "Description" },
  { field: "training_quarter", label: "Training Quarter" },
  { field: "module_name", label: "Module" },
  { field: "batch_status", label: "Status" },
  { field: "enrollment_count", label: "Total Enrollments", align: "right" },
];

function SortIcon({ field, sortField, sortDir }) {
  if (sortField !== field) return null;
  return sortDir === "asc" ? <FiChevronUp className="inline h-3 w-3 ml-0.5" /> : <FiChevronDown className="inline h-3 w-3 ml-0.5" />;
}

// Per-batch detail grid, sits above EmployeeTable in the dashboard.
// Clicking a row drills the Employees grid down to just that batch; click the same row again to clear it.
export default function BatchTable({ rows, onExport, selectedBatchId, onBatchClick }) {
  const [collapsed, setCollapsed] = useState(true);
  const [sortField, setSortField] = useState("training_quarter");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(1);
  // Area/Sub-area and the per-status employee breakdown have no columns of
  // their own — click the info icon on a row to reveal them.
  const [openInfoKey, setOpenInfoKey] = useState(null);
  // Trigger DOM nodes for InfoPopover, keyed by batch_id (see its own doc comment).
  const infoButtonRefs = useRef(new Map());

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const cmp =
        sortField === "enrollment_count"
          ? a.enrollment_count - b.enrollment_count
          : String(a[sortField] || "").localeCompare(String(b[sortField] || ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / ROWS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pageRows = sorted.slice((safePage - 1) * ROWS_PER_PAGE, safePage * ROWS_PER_PAGE);

  const toggleSort = (field) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "enrollment_count" ? "desc" : "asc");
    }
    setPage(1);
    setOpenInfoKey(null);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-3 flex flex-col min-w-0">
      <div className="flex items-center justify-between gap-2 mb-2 shrink-0">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          className="flex items-center gap-1.5 text-xs font-semibold text-gray-900 dark:text-white"
        >
          {collapsed ? <FiChevronRight className="h-3.5 w-3.5 shrink-0" /> : <FiChevronDown className="h-3.5 w-3.5 shrink-0" />}
          Batches
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-gray-400 dark:text-gray-500">{rows.length.toLocaleString()} batches</span>
          <ExportButton filename="batches.csv" fetchRows={onExport} />
        </div>
      </div>

      {collapsed ? null : rows.length === 0 ? (
        <div className="py-10 text-center text-xs text-gray-400 dark:text-gray-500">No data for the current filters</div>
      ) : (
        <>
          {openInfoKey && <div className="fixed inset-0 z-10" onClick={() => setOpenInfoKey(null)} />}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  {COLUMNS.map((col) => (
                    <th
                      key={col.field}
                      className={`font-semibold text-gray-600 dark:text-gray-300 py-1.5 px-2 cursor-pointer select-none whitespace-nowrap ${
                        col.align === "right" ? "text-right" : "text-left"
                      }`}
                      onClick={() => toggleSort(col.field)}
                    >
                      {col.label} <SortIcon field={col.field} sortField={sortField} sortDir={sortDir} />
                    </th>
                  ))}
                  <th className="text-left font-semibold text-gray-600 dark:text-gray-300 py-1.5 px-2 whitespace-nowrap">Info</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr
                    key={row.batch_id}
                    onClick={() => onBatchClick(row.batch_id)}
                    className={`border-b border-gray-100 dark:border-gray-800 last:border-0 cursor-pointer ${
                      selectedBatchId === row.batch_id
                        ? "bg-blue-50 dark:bg-blue-900/20"
                        : "hover:bg-gray-50 dark:hover:bg-gray-700/40"
                    }`}
                  >
                    <td className="py-1.5 px-2 text-gray-800 dark:text-gray-200 whitespace-nowrap" title={row.batch_num || undefined}>
                      {row.batch_num || "—"}
                    </td>
                    <td className="py-1.5 px-2 text-gray-600 dark:text-gray-400 max-w-[16rem] truncate" title={row.batch_desc || undefined}>
                      {row.batch_desc || "—"}
                    </td>
                    <td className="py-1.5 px-2 text-gray-800 dark:text-gray-200 whitespace-nowrap" title={row.training_quarter || undefined}>
                      {row.training_quarter || "—"}
                    </td>
                    <td className="py-1.5 px-2 text-gray-600 dark:text-gray-400 whitespace-nowrap" title={row.module_name || undefined}>
                      {row.module_name || "—"}
                    </td>
                    <td className="py-1.5 px-2 text-gray-800 dark:text-gray-200 whitespace-nowrap">{row.batch_status || "—"}</td>
                    <td className="py-1.5 px-2 text-right text-gray-800 dark:text-gray-200 font-medium whitespace-nowrap">
                      {row.enrollment_count.toLocaleString()}
                    </td>
                    <td className="py-1.5 px-2 relative">
                      <button
                        ref={(el) => {
                          if (el) infoButtonRefs.current.set(row.batch_id, el);
                          else infoButtonRefs.current.delete(row.batch_id);
                        }}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenInfoKey((k) => (k === row.batch_id ? null : row.batch_id));
                        }}
                        className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500"
                        aria-label="Show more info"
                      >
                        <FiInfo className="h-3.5 w-3.5" />
                      </button>
                      {openInfoKey === row.batch_id && (
                        <InfoPopover triggerEl={infoButtonRefs.current.get(row.batch_id)} onClose={() => setOpenInfoKey(null)}>
                          <div className="text-left space-y-1.5">
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-0.5">Area</p>
                              <p className="text-gray-800 dark:text-gray-200">{row.area_name || "—"}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-0.5">Sub-area</p>
                              <p className="text-gray-800 dark:text-gray-200">{row.sub_area_name || "—"}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">Employees by Status</p>
                              <ul className="space-y-0.5">
                                {HOME_PROGRESS_BUCKET_CONFIG.map((b) => (
                                  <li key={b.key} className="flex items-center justify-between gap-2 text-gray-800 dark:text-gray-200">
                                    <span className="inline-flex items-center gap-1.5">
                                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLORS[b.key] }} />
                                      {b.label}
                                    </span>
                                    <span className="font-medium">{row.status_counts[b.key] ?? 0}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </InfoPopover>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 dark:border-gray-800 shrink-0">
              <span className="text-[10px] text-gray-400 dark:text-gray-500">
                {(safePage - 1) * ROWS_PER_PAGE + 1}-{Math.min(safePage * ROWS_PER_PAGE, sorted.length)} of {sorted.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => { setPage((p) => Math.max(1, p - 1)); setOpenInfoKey(null); }}
                  disabled={safePage === 1}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-gray-500 dark:text-gray-400"
                  aria-label="Previous page"
                >
                  <FiChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => { setPage((p) => Math.min(totalPages, p + 1)); setOpenInfoKey(null); }}
                  disabled={safePage === totalPages}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-gray-500 dark:text-gray-400"
                  aria-label="Next page"
                >
                  <FiChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
