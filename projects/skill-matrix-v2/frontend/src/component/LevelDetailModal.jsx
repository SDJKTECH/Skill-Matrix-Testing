import React, { useEffect } from "react";
import { getHeaderName } from "../helper/utility";

export default function LevelDetailModal({
  open,
  onClose,
  levels = {},
  title = "Level Details",
}) {
  const values = {
    L1: levels.L1 || "-",
    L2: levels.L2 || "-",
    L3: levels.L3 || "-",
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* backdrop */}
      <div
        className="fixed inset-0 bg-gray-900/50 dark:bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* modal panel — header/footer + scrollable body pattern shared with
          the other modals in this app (e.g. certDataTable.jsx's Add
          Certificate modal): outer flex-col + overflow-hidden keeps the
          panel itself from scrolling, `shrink-0` pins the header/footer in
          place, and only the middle body div (overflow-y-auto) scrolls —
          so a long set of level requirements scrolls internally instead of
          pushing the Close button off-screen. */}
      <div className="relative w-full max-w-4xl max-h-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl flex flex-col overflow-hidden">

        {/* header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 z-10">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
            {title}
          </h3>
        </div>

        {/* scrollable body */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50 dark:bg-gray-900/50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
            {/* L1 */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800 shadow-sm flex flex-col">
              <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-2">
                {getHeaderName("L1")}
              </h4>
              <div className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed space-y-1.5">
                {values.L1.toString()
                  .split("\n")
                  .map((line, idx) => (
                    <p key={idx}>{line || "-"}</p>
                  ))}
              </div>
            </div>

            {/* L2 */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800 shadow-sm flex flex-col">
              <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-2">
                {getHeaderName("L2")}
              </h4>
              <div className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed space-y-1.5">
                {values.L2.toString()
                  .split("\n")
                  .map((line, idx) => (
                    <p key={idx}>{line || "-"}</p>
                  ))}
              </div>
            </div>

            {/* L3 (full width) */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800 shadow-sm flex flex-col md:col-span-2 mt-1">
              <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-2">
                {getHeaderName("L3")}
              </h4>
              <div className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed space-y-1.5">
                {values.L3.toString()
                  .split("\n")
                  .map((line, idx) => (
                    <p key={idx}>{line || "-"}</p>
                  ))}
              </div>
            </div>
          </div>
        </div>

        {/* footer */}
        <div className="shrink-0 flex items-center justify-end px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-900 transition-colors shadow-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
