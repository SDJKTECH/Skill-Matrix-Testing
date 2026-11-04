import React, { useMemo, useState } from "react";
import { FiChevronLeft, FiChevronRight, FiChevronUp, FiChevronDown } from "react-icons/fi";
import { parseQuarterSortKey } from "../services/trainingAnalyticsAggregation";
import ExportButton from "./ExportButton";

const ROWS_PER_PAGE = 8;

function SortIcon({ field, sortField, sortDir }) {
  if (sortField !== field) return null;
  return sortDir === "asc" ? <FiChevronUp className="inline h-3 w-3 ml-0.5" /> : <FiChevronDown className="inline h-3 w-3 ml-0.5" />;
}

// Distinct batch counts per quarter, plus one column per Area breaking that total down further.
export default function BatchesByQuarterTable({ rows, areas, onExport }) {
  const [sortField, setSortField] = useState("quarter"); // "quarter" | "count" | an Area name
  const [sortDir, setSortDir] = useState("desc"); // latest quarter first by default
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      let cmp;
      if (sortField === "count") {
        cmp = a.count - b.count;
      } else if (areas.includes(sortField)) {
        cmp = (a.byArea[sortField] || 0) - (b.byArea[sortField] || 0);
      } else {
        const keyA = parseQuarterSortKey(a.quarter);
        const keyB = parseQuarterSortKey(b.quarter);
        if (keyA !== null && keyB !== null) cmp = keyA - keyB;
        else if (keyA !== null) cmp = -1;
        else if (keyB !== null) cmp = 1;
        else cmp = a.quarter.localeCompare(b.quarter);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, areas, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / ROWS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pageRows = sorted.slice((safePage - 1) * ROWS_PER_PAGE, safePage * ROWS_PER_PAGE);
  const totalBatches = useMemo(() => rows.reduce((sum, r) => sum + r.count, 0), [rows]);

  const toggleSort = (field) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
    setPage(1);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-3 flex flex-col min-w-0">
      <div className="flex items-center justify-between gap-2 mb-2 shrink-0">
        <h2 className="text-xs font-semibold text-gray-900 dark:text-white">New Batches by Quarter</h2>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-gray-400 dark:text-gray-500">{totalBatches.toLocaleString()} batches total</span>
          <ExportButton filename="batches-by-quarter.csv" fetchRows={onExport} />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="py-10 text-center text-xs text-gray-400 dark:text-gray-500">No data for the current filters</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th
                    className="text-left font-semibold text-gray-600 dark:text-gray-300 py-1.5 px-2 cursor-pointer select-none whitespace-nowrap"
                    onClick={() => toggleSort("quarter")}
                  >
                    Quarter <SortIcon field="quarter" sortField={sortField} sortDir={sortDir} />
                  </th>
                  <th
                    className="text-right font-semibold text-gray-600 dark:text-gray-300 py-1.5 px-2 cursor-pointer select-none whitespace-nowrap"
                    onClick={() => toggleSort("count")}
                  >
                    Batch Count <SortIcon field="count" sortField={sortField} sortDir={sortDir} />
                  </th>
                  {areas.map((area) => (
                    <th
                      key={area}
                      className="text-right font-semibold text-gray-600 dark:text-gray-300 py-1.5 px-2 cursor-pointer select-none whitespace-nowrap"
                      onClick={() => toggleSort(area)}
                    >
                      {area} <SortIcon field={area} sortField={sortField} sortDir={sortDir} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr key={row.quarter} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                    <td className="py-1.5 px-2 text-gray-800 dark:text-gray-200 whitespace-nowrap">{row.quarter}</td>
                    <td className="py-1.5 px-2 text-right text-gray-800 dark:text-gray-200 font-medium">{row.count.toLocaleString()}</td>
                    {areas.map((area) => (
                      <td key={area} className="py-1.5 px-2 text-right text-gray-600 dark:text-gray-400">
                        {(row.byArea[area] || 0).toLocaleString()}
                      </td>
                    ))}
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
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-gray-500 dark:text-gray-400"
                  aria-label="Previous page"
                >
                  <FiChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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
