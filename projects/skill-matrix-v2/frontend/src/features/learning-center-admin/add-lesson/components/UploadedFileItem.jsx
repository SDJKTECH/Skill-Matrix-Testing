import React from "react";
import { FiCheck, FiX } from "react-icons/fi";
import { formatFileSize } from "../services/LessonMaterial";

export default function UploadedFileItem({ file, onRemove }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2">
      <div className="w-7 h-7 rounded-lg bg-green-50 dark:bg-green-900/20 flex items-center justify-center shrink-0">
        <FiCheck className="h-3.5 w-3.5 text-green-500 dark:text-green-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">{file.name}</p>
        <p className="text-[10px] text-gray-400 dark:text-gray-500">{file.size == null ? "Already uploaded" : `${formatFileSize(file.size)} · Selected`}</p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        title="Remove file"
        className="w-6 h-6 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 flex items-center justify-center transition-colors"
      >
        <FiX className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}