import React, { useMemo, useRef, useState } from "react";
import { FiChevronLeft, FiChevronRight, FiChevronUp, FiChevronDown, FiInfo, FiX } from "react-icons/fi";
import { HOME_PROGRESS_BUCKET_CONFIG } from "../../shared/config/trainingStatusBuckets";
import { STATUS_COLORS } from "../services/chartPalette";
import InfoPopover from "../../shared/components/InfoPopover";
import ExportButton from "./ExportButton";

const ROWS_PER_PAGE = 10;
// buildEmployeeBatchRows only carries the display label, so look the bucket
// key back up from it to pick the matching STATUS_COLORS dot.
const KEY_BY_LABEL = new Map(HOME_PROGRESS_BUCKET_CONFIG.map((b) => [b.label, b.key]));

const COLUMNS = [
  { field: "employee_name", label: "Name" },
  { field: "employee_email", label: "Email" },
  { field: "manager_name", label: "Manager" },
  { field: "batch_num", label: "Batch" },
  { field: "employee_type", label: "Employee Type" },
  { field: "status_bucket", label: "Status" },
];

function SortIcon({ field, sortField, sortDir }) {
  if (sortField !== field) return null;
  return sortDir === "asc" ? <FiChevronUp className="inline h-3 w-3 ml-0.5" /> : <FiChevronDown className="inline h-3 w-3 ml-0.5" />;
}

// Per-employee-batch detail behind the Employees-by-Training-Status chart — a
// dense, sortable, paginated table, same interaction shape as BatchesByQuarterTable.
export default function EmployeeTable({ rows, onExport, activeBatchLabel, onClearBatchFilter }) {
  const [collapsed, setCollapsed] = useState(true);
  const [sortField, setSortField] = useState("employee_name");
  const [sortDir, setSortDir] = useState("asc");
  const [page, setPage] = useState(1);
  // Department, Batch Description, Status Remarks have no columns — click the info icon to reveal them.
  const [openInfoKey, setOpenInfoKey] = useState(null);
  // Trigger DOM nodes for InfoPopover, keyed by rowKey (see its own doc comment).
  const infoButtonRefs = useRef(new Map());

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const cmp = String(a[sortField] || "").localeCompare(String(b[sortField] || ""));
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
      setSortDir("asc");
    }
    setPage(1);
    setOpenInfoKey(null);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-3 flex flex-col min-w-0">
      <div className="flex items-center justify-between gap-2 mb-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-900 dark:text-white shrink-0"
          >
            {collapsed ? <FiChevronRight className="h-3.5 w-3.5 shrink-0" /> : <FiChevronDown className="h-3.5 w-3.5 shrink-0" />}
            Employees
          </button>
          {activeBatchLabel && (
            <span className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-[11px] text-blue-700 dark:text-blue-300 truncate">
              Batch: {activeBatchLabel}
              <button
                type="button"
                onClick={onClearBatchFilter}
                aria-label="Clear batch filter"
                className="p-0.5 rounded-full hover:bg-blue-100 dark:hover:bg-blue-800"
              >
                <FiX className="h-2.5 w-2.5" />
              </button>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-gray-400 dark:text-gray-500">{rows.length.toLocaleString()} enrollments</span>
          <ExportButton filename="employee-batches.csv" fetchRows={onExport} />
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
                      className="text-left font-semibold text-gray-600 dark:text-gray-300 py-1.5 px-2 cursor-pointer select-none whitespace-nowrap"
                      onClick={() => toggleSort(col.field)}
                    >
                      {col.label} <SortIcon field={col.field} sortField={sortField} sortDir={sortDir} />
                    </th>
                  ))}
                  <th className="text-left font-semibold text-gray-600 dark:text-gray-300 py-1.5 px-2 whitespace-nowrap">Info</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => {
                  const statusKey = KEY_BY_LABEL.get(row.status_bucket);
                  const rowKey = `${row.employee_id}-${row.batch_id}`;
                  return (
                    <tr key={rowKey} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <td className="py-1.5 px-2 text-gray-800 dark:text-gray-200 whitespace-nowrap" title={row.employee_name || `Employee ${row.employee_id}`}>
                        {row.employee_name || `Employee ${row.employee_id}`}
                      </td>
                      <td className="py-1.5 px-2 text-gray-600 dark:text-gray-400 whitespace-nowrap" title={row.employee_email || undefined}>
                        {row.employee_email || "—"}
                      </td>
                      <td className="py-1.5 px-2 text-gray-600 dark:text-gray-400 whitespace-nowrap" title={row.manager_name || undefined}>
                        {row.manager_name || "—"}
                      </td>
                      <td className="py-1.5 px-2 text-gray-800 dark:text-gray-200 whitespace-nowrap" title={row.batch_num || undefined}>
                        {row.batch_num || "—"}
                      </td>
                      <td className="py-1.5 px-2 text-gray-600 dark:text-gray-400 whitespace-nowrap" title={row.employee_type || undefined}>
                        {row.employee_type || "—"}
                      </td>
                      <td className="py-1.5 px-2 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-gray-800 dark:text-gray-200">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLORS[statusKey] }} />
                          {row.status_bucket}
                        </span>
                      </td>
                      <td className="py-1.5 px-2 relative">
                        <button
                          ref={(el) => {
                            if (el) infoButtonRefs.current.set(rowKey, el);
                            else infoButtonRefs.current.delete(rowKey);
                          }}
                          type="button"
                          onClick={() => setOpenInfoKey((k) => (k === rowKey ? null : rowKey))}
                          className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500"
                          aria-label="Show more info"
                        >
                          <FiInfo className="h-3.5 w-3.5" />
                        </button>
                        {openInfoKey === rowKey && (
                          <InfoPopover triggerEl={infoButtonRefs.current.get(rowKey)} onClose={() => setOpenInfoKey(null)}>
                            <div className="text-left space-y-1.5">
                              <div>
                                <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-0.5">Department</p>
                                <p className="text-gray-800 dark:text-gray-200">{row.department || "—"}</p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-0.5">Batch Description</p>
                                <p className="text-gray-800 dark:text-gray-200">{row.batch_desc || "—"}</p>
                              </div>
                              {row.status_remarks?.trim() && (
                                <div>
                                  <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-0.5">Status Remarks</p>
                                  <p className="text-gray-800 dark:text-gray-200">{row.status_remarks}</p>
                                </div>
                              )}
                            </div>
                          </InfoPopover>
                        )}
                      </td>
                    </tr>
                  );
                })}
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
