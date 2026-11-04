import React from "react";
import { ALL_YEARS } from "../config/trainingYearFilter";

/**
 * Small reusable year <select> for the Employee Training Progress widgets.
 * Props: { years: number[], value: number | "all", onChange(value), includeAll?: boolean, className?: string }
 * `className` defaults to this component's own standalone look (used by the
 * Home Screen widgets); EmployeeTrainingPanel's advanced-filters panel
 * passes its own classes so this reads as one of that panel's fields
 * instead of a visually distinct control.
 */
export default function YearFilter({
  years,
  value,
  onChange,
  includeAll = true,
  className = "text-xs border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 cursor-pointer",
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value === ALL_YEARS ? ALL_YEARS : Number(e.target.value))}
      aria-label="Filter trainings by year"
      className={className}
    >
      {years.map((year) => (
        <option key={year} value={year}>
          {year}
        </option>
      ))}
      {includeAll && <option value={ALL_YEARS}>All Years</option>}
    </select>
  );
}
