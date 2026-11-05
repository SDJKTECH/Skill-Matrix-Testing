import React from "react";
import Breadcrumb from "../../../training/shared/components/Breadcrumb";
import { FOCUS_RING } from "../../../shared/config/focusRing";

export default function LessonHeader({ breadcrumbItems, onCancel, onSave, isEditing = false }) {
  return (
    <div className="sticky top-0 z-10 w-full shrink-0 flex flex-col gap-1.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 pb-3">
      <Breadcrumb items={breadcrumbItems} maxVisible={5} />

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
            {isEditing ? "Edit Lesson" : "Add Lesson"}
          </h1>
          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            Attach a video, document or text block as this lesson&apos;s content.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className={`px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${FOCUS_RING}`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            className={`px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors ${FOCUS_RING}`}
          >
            {isEditing ? "Update Lesson" : "Save Lesson"}
          </button>
        </div>
      </div>
    </div>
  );
}