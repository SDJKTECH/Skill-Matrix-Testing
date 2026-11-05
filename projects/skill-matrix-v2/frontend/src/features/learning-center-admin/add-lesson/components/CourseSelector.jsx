import React from "react";

const inputClass =
  "w-full rounded-lg border bg-white dark:bg-gray-900 px-3 py-2 text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500";

// Dropdown when the backend can list courses; otherwise a manual Course ID input.
export default function CourseSelector({
  courses = [],
  loading = false,
  value = "",
  error,
  onChange,
  courseName,
}) {
  const border = error ? "border-red-400 dark:border-red-500" : "border-gray-200 dark:border-gray-700";
  const hasList = courses.length > 0;

  // The course was already chosen on the previous tab: just show its name.
  if (courseName) {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          Course
        </span>
        <h2 className="text-base font-bold leading-tight text-gray-900 dark:text-white">
          {courseName}
        </h2>
      </div>
    );
  }

  return (
    <label className="flex flex-col gap-1 text-[11px] font-semibold text-gray-700 dark:text-gray-300">
      Course
      {hasList ? (
        <select
          value={value}
          onChange={(e) => onChange("courseId", e.target.value)}
          className={`${inputClass} ${border}`}
        >
          <option value="">Select a course</option>
          {courses.map((c) => (
            <option key={c.course_id} value={c.course_id}>
              {c.title}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="number"
          min="1"
          value={value}
          disabled={loading}
          onChange={(e) => onChange("courseId", e.target.value)}
          placeholder={loading ? "Loading courses..." : "Enter course ID"}
          className={`${inputClass} ${border}`}
        />
      )}
      {!hasList && !loading && (
        <span className="text-[10px] font-normal text-gray-400 dark:text-gray-500">
          Course list isn&apos;t available yet, so enter the course ID.
        </span>
      )}
      {error && <span className="text-[10px] font-normal text-red-500">{error}</span>}
    </label>
  );
}