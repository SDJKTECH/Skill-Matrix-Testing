import React, { useState } from "react";
import toast from "react-hot-toast";
import { useAuth } from "../hooks/useAuth";
import {
  uploadTrainingCSV,
  downloadBulkUploadReport,
} from "../helper/addTrainingV2Api";

const TRAININGS_TEMPLATE_URL = "/trainings_template.xlsx";

function AdminConsoleTraining() {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [csvFile, setCsvFile] = useState(null);
  const [reportUrl, setReportUrl] = useState(null);
  const [uploadSummary, setUploadSummary] = useState(null);

  const handleUploadCSV = async () => {
    if (!csvFile) {
      toast.error("Please select a CSV or Excel file first.");
      return;
    }
    const adminId = user?.dbEmployeeId ?? user?.employeeId;
    if (!adminId) {
      toast.error("User not identified. Please log in again.");
      return;
    }
    setUploading(true);
    setReportUrl(null);
    setUploadSummary(null);
    try {
      const res = await uploadTrainingCSV(csvFile, adminId);
      const summary = res?.summary || res;
      const created = summary.created ?? summary.created_count ?? 0;
      const updated = summary.updated ?? 0;
      const alreadyExists = summary.already_exists ?? summary.skipped_count ?? 0;
      const errors = summary.errors ?? summary.error_count ?? 0;

      setUploadSummary({ created, updated, alreadyExists, errors });

      if (res.report_url) {
        setReportUrl(res.report_url);
      }

      // The request itself succeeded, so the toast is always "complete" —
      // row-level created/updated/already-exists/errors counts are shown as
      // persistent badges below (uploadSummary). A toast.error here is
      // reserved for the request failing outright (see catch block).
      toast.success("Upload complete.");
      setCsvFile(null);
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Add Training Record</h2>
      {/* CSV Upload section */}
      <div className="mb-8 p-4 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Upload CSV / Excel</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Required columns: batch_num, Employee ID, Area, Sub Area, Module.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              className="text-sm text-gray-600 dark:text-gray-400 file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-blue-50 file:text-blue-700 dark:file:bg-blue-900/30 dark:file:text-blue-300 file:text-sm"
              onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
            />
          </label>
          <button
            type="button"
            onClick={handleUploadCSV}
            disabled={uploading || !csvFile}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? "Uploading..." : "Upload"}
          </button>
          <a
            href={TRAININGS_TEMPLATE_URL}
            download="trainings_template.xlsx"
            className="inline-flex px-4 py-2 rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200 text-sm font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50 no-underline"
          >
            Download template
          </a>
          {reportUrl && (
            <a
              href={reportUrl}
              onClick={async (e) => {
                e.preventDefault();
                const adminId = user?.dbEmployeeId ?? user?.employeeId;
                try {
                  await downloadBulkUploadReport(reportUrl, adminId);
                } catch {
                  toast.error("Failed to download report.");
                }
              }}
              className="inline-flex px-4 py-2 rounded-lg bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-200 text-sm font-medium hover:bg-red-100 dark:hover:bg-red-900/50 no-underline ml-auto"
            >
              Download Upload Results
            </a>
          )}
        </div>
        {uploadSummary && (
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              Created: {uploadSummary.created}
            </span>
            {uploadSummary.updated > 0 && (
              <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200">
                Updated: {uploadSummary.updated}
              </span>
            )}
            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
              Already Exists: {uploadSummary.alreadyExists}
            </span>
            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-200">
              Errors: {uploadSummary.errors}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminConsoleTraining;
