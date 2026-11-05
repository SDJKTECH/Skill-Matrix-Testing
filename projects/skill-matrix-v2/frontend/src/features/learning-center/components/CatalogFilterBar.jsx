import React, { useMemo } from "react";
import { FiSearch, FiX } from "react-icons/fi";

function FilterSelect({ value, onChange, options, placeholder }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-xs font-medium px-3 py-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <option value="">{placeholder}</option>
      {options.map((opt) => (
        <option key={opt.value ?? opt} value={opt.value ?? opt}>
          {opt.label ?? opt}
        </option>
      ))}
    </select>
  );
}

// Options are derived from whatever is actually in courses — no hardcoded
// list to keep in sync with the DB. Type shows the raw course_type value;
// duration shows the raw duration_minutes value.
export default function CatalogFilterBar({ filters, onChange, courses }) {
  const typeOptions = useMemo(
    () => [...new Set(courses.map((c) => c.type).filter(Boolean))].sort(),
    [courses]
  );

  const durationOptions = useMemo(
    () =>
      [...new Set(courses.map((c) => c.durationMinutes).filter((d) => d != null))]
        .sort((a, b) => a - b)
        .map((minutes) => ({ value: minutes, label: `${minutes} min` })),
    [courses]
  );

  const hasActiveFilters = filters.type || filters.duration || filters.search;

  const clearAll = () => onChange({ search: "", type: "", duration: "" });

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          placeholder="What do you want to learn today?"
          className="w-full rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-100 pl-10 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          value={filters.type}
          onChange={(v) => onChange({ ...filters, type: v })}
          options={typeOptions}
          placeholder="Type"
        />
        <FilterSelect
          value={filters.duration}
          onChange={(v) => onChange({ ...filters, duration: v })}
          options={durationOptions}
          placeholder="Duration"
        />
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-2 py-2 cursor-pointer"
          >
            <FiX className="h-3.5 w-3.5" />
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}
