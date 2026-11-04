import React, { useState } from "react";
import { FiDownload, FiLoader } from "react-icons/fi";
import toast from "react-hot-toast";
import { downloadCsv } from "../services/csvExport";

/**
 * Per-chart "Export" trigger — resolves `fetchRows` (usually an in-memory
 * snapshot of the exact rows the chart is rendering) and downloads them as
 * CSV. `fetchRows` may also hit the network; either way this component just
 * awaits whatever it returns.
 * @param {{ filename: string, fetchRows: () => Promise<Array<object>>|Array<object> }} props
 */
export default function ExportButton({ filename, fetchRows }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const rows = await fetchRows();
      if (!rows || rows.length === 0) {
        toast("No records to export for the current filters.");
        return;
      }
      downloadCsv(filename, rows);
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.message || "Export failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      title="Export underlying records as CSV"
      aria-label="Export underlying records as CSV"
      className="inline-flex items-center gap-1 shrink-0 text-[10px] font-medium text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {loading ? <FiLoader className="h-3 w-3 animate-spin" /> : <FiDownload className="h-3 w-3" />}
      Export
    </button>
  );
}
