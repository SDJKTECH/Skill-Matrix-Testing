import React from "react";
import { FiX } from "react-icons/fi";
import MultiSelectFilter from "../../shared/components/filters/MultiSelectFilter";

// Passive pill for one applied filter value, with its own x to drop just
// that value (distinct from "Clear all filters" below).
function FilterChip({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700/60 text-[11px] text-gray-600 dark:text-gray-300">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter ${label}`}
        className="p-0.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400"
      >
        <FiX className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}

/**
 * Filter row: one MultiSelectFilter dropdown per dimension (Batch Quarter,
 * Area, Sub Area, Module), sharing state with pie-slice clicks (see
 * TrainingAnalyticsDashboard.jsx). Dropdowns always list the full option
 * set so an excluded value stays re-addable. A chip per selected value
 * mirrors what's applied; each chip's own x removes just that value.
 *
 * @param {{
 *   quarterOptions: string[], selectedQuarters: string[], onQuartersChange: (v:string[])=>void,
 *   areaOptions: string[], selectedAreas: string[], onAreasChange: (v:string[])=>void,
 *   subAreaOptions: string[], selectedSubAreas: string[], onSubAreasChange: (v:string[])=>void,
 *   moduleOptions: string[], selectedModules: string[], onModulesChange: (v:string[])=>void,
 *   hasActiveFilters: boolean, onClearAll: () => void,
 * }} props
 */
export default function TrainingFilterBar({
  quarterOptions,
  selectedQuarters,
  onQuartersChange,
  areaOptions,
  selectedAreas,
  onAreasChange,
  subAreaOptions,
  selectedSubAreas,
  onSubAreasChange,
  moduleOptions,
  selectedModules,
  onModulesChange,
  hasActiveFilters,
  onClearAll,
}) {
  const chipGroups = [
    { dimension: "Quarter", values: selectedQuarters, onChange: onQuartersChange },
    { dimension: "Area", values: selectedAreas, onChange: onAreasChange },
    { dimension: "Sub Area", values: selectedSubAreas, onChange: onSubAreasChange },
    { dimension: "Module", values: selectedModules, onChange: onModulesChange },
  ];

  return (
    <div className="flex flex-col gap-1.5 shrink-0">
      <div className="flex flex-wrap items-center gap-2">
        <MultiSelectFilter
          label="Batch Quarter"
          allLabel="All Quarters"
          options={quarterOptions}
          selected={selectedQuarters}
          onChange={onQuartersChange}
          minWidthClass="min-w-[9rem]"
        />
        <MultiSelectFilter
          label="Area"
          allLabel="All Areas"
          options={areaOptions}
          selected={selectedAreas}
          onChange={onAreasChange}
          minWidthClass="min-w-[8rem]"
        />
        <MultiSelectFilter
          label="Sub Area"
          allLabel="All Sub Areas"
          options={subAreaOptions}
          selected={selectedSubAreas}
          onChange={onSubAreasChange}
          minWidthClass="min-w-[8rem]"
        />
        <MultiSelectFilter
          label="Module"
          allLabel="All Modules"
          options={moduleOptions}
          selected={selectedModules}
          onChange={onModulesChange}
          minWidthClass="min-w-[8rem]"
        />
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onClearAll}
            className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            Clear all filters
          </button>
        )}
      </div>

      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chipGroups.flatMap(({ dimension, values, onChange }) =>
            values.map((value) => (
              <FilterChip
                key={`${dimension}-${value}`}
                label={`${dimension}: ${value}`}
                onRemove={() => onChange(values.filter((v) => v !== value))}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
