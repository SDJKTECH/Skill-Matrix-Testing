import React, { useState } from "react";
import toast from "react-hot-toast";
import { getApiUrl } from "../config/apiConfig";

/** Report type id -> Cloud Function name (no env prefix; proxy/Vite map the path). */
const REPORT_API_MAP = {
  "skill-matrix-activity": "get_employee_skill_matrix_report_v2",
  "employee-skill": "get_employee_skills_report_v2",
  "employee-certificate": "get_employee_certificate_report_v2",
  "employee-training": "get_employee_training_report_v2",
};

const REPORT_TYPES = [
  {
    id: "skill-matrix-activity",
    title: "Skill Matrix Activity Report",
    description: "Skills, certificates & trainings update status for all employees",
    icon: "📊",
    accent: "blue",
    api: true,
  },
  {
    id: "employee-skill",
    title: "Employee Skill Report",
    description: "Detailed employee skills (domain, discipline, level, approval status)",
    icon: "👤",
    accent: "emerald",
    api: true,
  },
  {
    id: "employee-certificate",
    title: "Employee Certificate Report",
    description: "Download employee certifications",
    icon: "📜",
    accent: "amber",
    api: true,
  },
  {
    id: "employee-training",
    title: "Employee Training Report",
    description: "Download employee training records",
    icon: "🎓",
    accent: "violet",
    api: true,
  },
];

const ACCENT_STYLES = {
  blue: {
    iconBg: "bg-blue-100 dark:bg-blue-900/40",
    iconRing: "ring-blue-200 dark:ring-blue-800",
    border: "border-blue-200 dark:border-blue-800/60",
    hoverBorder: "hover:border-blue-400 dark:hover:border-blue-500",
    hoverBg: "hover:bg-blue-50/80 dark:hover:bg-blue-900/20",
    accentBar: "bg-blue-500",
    downloadText: "text-blue-600 dark:text-blue-400",
    loadingColor: "border-blue-500",
  },
  emerald: {
    iconBg: "bg-emerald-100 dark:bg-emerald-900/40",
    iconRing: "ring-emerald-200 dark:ring-emerald-800",
    border: "border-emerald-200 dark:border-emerald-800/60",
    hoverBorder: "hover:border-emerald-400 dark:hover:border-emerald-500",
    hoverBg: "hover:bg-emerald-50/80 dark:hover:bg-emerald-900/20",
    accentBar: "bg-emerald-500",
    downloadText: "text-emerald-600 dark:text-emerald-400",
    loadingColor: "border-emerald-500",
  },
  amber: {
    iconBg: "bg-amber-100 dark:bg-amber-900/40",
    iconRing: "ring-amber-200 dark:ring-amber-800",
    border: "border-amber-200 dark:border-amber-800/60",
    hoverBorder: "hover:border-amber-400 dark:hover:border-amber-500",
    hoverBg: "hover:bg-amber-50/80 dark:hover:bg-amber-900/20",
    accentBar: "bg-amber-500",
    downloadText: "text-amber-600 dark:text-amber-400",
    loadingColor: "border-amber-500",
  },
  violet: {
    iconBg: "bg-violet-100 dark:bg-violet-900/40",
    iconRing: "ring-violet-200 dark:ring-violet-800",
    border: "border-violet-200 dark:border-violet-800/60",
    hoverBorder: "hover:border-violet-400 dark:hover:border-violet-500",
    hoverBg: "hover:bg-violet-50/80 dark:hover:bg-violet-900/20",
    accentBar: "bg-violet-500",
    downloadText: "text-violet-600 dark:text-violet-400",
    loadingColor: "border-violet-500",
  },
};

/**
 * Fetch report as Excel blob and trigger browser download.
 * @param {string} reportType - One of: skill-matrix-activity | employee-skill | employee-certificate | employee-training
 * @returns {Promise<void>}
 */
async function downloadReport(reportType) {
  const functionName = REPORT_API_MAP[reportType];
  if (!functionName) throw new Error(`Unknown report type: ${reportType}`);

  const reportUrl = getApiUrl(functionName);
  const authToken = localStorage.getItem("authToken");
  const headers = {};
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const res = await fetch(reportUrl, { method: "GET", headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Report failed (${res.status})`);
  }

  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition");
  let filename = "report.xlsx";
  if (disposition) {
    const match = disposition.match(/filename[^;=\n]*=([^;\n]*)/);
    if (match) filename = match[1].trim().replace(/^["']|["']$/g, "");
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function DownloadReport() {
  const [loadingId, setLoadingId] = useState(null);

  const handleCardClick = async (report) => {
    if (!report.api) {
      toast("Coming soon", { icon: "📜" });
      return;
    }
    setLoadingId(report.id);
    try {
      await downloadReport(report.id);
      toast.success(`${report.title} downloaded`);
    } catch (err) {
      toast.error("Download failed. Please try again.");
      console.error("Download report error:", err);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="min-h-[519px] p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-0.5">Download Report</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Click a card to request the download.
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-full">
        {REPORT_TYPES.map((report) => {
          const isLoading = loadingId === report.id;
          const style = ACCENT_STYLES[report.accent];
          return (
            <button
              key={report.id}
              type="button"
              onClick={() => handleCardClick(report)}
              disabled={isLoading}
              className={`group relative flex flex-col items-start text-left w-full min-w-0 p-3 pl-4 rounded-xl border-2
                bg-white dark:bg-gray-800/80 backdrop-blur-sm
                shadow-sm hover:shadow-md
                transition-all duration-300 ease-out
                disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:shadow-sm
                ${style.border} ${style.hoverBorder} ${style.hoverBg}`}
            >
              {/* Left accent bar */}
              <span
                className={`absolute left-0 top-2 bottom-2 w-0.5 rounded-r-full ${style.accentBar} opacity-80 group-hover:opacity-100 transition-opacity`}
                aria-hidden
              />
              {/* Icon in pill */}
              <span
                className={`flex items-center justify-center w-8 h-8 rounded-lg mb-2 ring-2 ${style.iconBg} ${style.iconRing} text-lg group-hover:scale-105 transition-transform duration-300 shrink-0`}
                aria-hidden
              >
                {report.icon}
              </span>
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-0.5 pr-5 leading-tight">
                {report.title}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400 leading-snug mb-2 line-clamp-2">
                {report.description}
              </span>
              {!isLoading ? (
                <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${style.downloadText} opacity-0 group-hover:opacity-100 transition-opacity duration-200`}>
                  <span>Download</span>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </span>
              ) : (
                <span className={`inline-flex items-center gap-1.5 text-[10px] font-medium ${style.downloadText}`}>
                  <span className={`w-3 h-3 border-2 ${style.loadingColor} border-t-transparent rounded-full animate-spin`} />
                  Preparing…
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default DownloadReport;
