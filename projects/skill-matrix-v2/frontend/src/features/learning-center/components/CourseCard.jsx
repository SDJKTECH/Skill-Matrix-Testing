import React from "react";
import { FiBookOpen, FiShield, FiClock, FiArrowRight } from "react-icons/fi";
import { formatDuration } from "../services/catalogFilters";

// course_type is "Training" | "Policy" today — the finer badge (Video/Reading/
// etc.) is a rendering-time concern derived from the actual content object,
// not something the catalog query returns (see learning-center conversation).
const TYPE_BADGE = {
  Training: { icon: FiBookOpen, label: "Training" },
  Policy: { icon: FiShield, label: "Policy" },
};

export default function CourseCard({ course, onOpen }) {
  const badge = TYPE_BADGE[course.type] ?? TYPE_BADGE.Training;
  const Icon = badge.icon;

  return (
    <div className="flex flex-col bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow p-4">
      <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-1 text-[11px] font-semibold text-gray-600 dark:text-gray-300">
        <Icon className="h-3.5 w-3.5" />
        {badge.label}
      </span>

      <h3 className="mt-3 text-sm font-semibold text-gray-900 dark:text-white leading-snug line-clamp-2">
        {course.title}
      </h3>
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 line-clamp-3 flex-1">
        {course.description}
      </p>

      <div className="mt-4 flex items-center justify-between">
        <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
          <FiClock className="h-3.5 w-3.5" />
          {formatDuration(course.durationMinutes)}
        </span>
        <button
          type="button"
          onClick={() => onOpen(course)}
          aria-label={`Open ${course.title}`}
          className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 cursor-pointer transition-colors"
        >
          <FiArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
