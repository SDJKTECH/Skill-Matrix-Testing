import React from "react";
import { MATERIAL_TYPES } from "../services/LessonMaterial";

export default function MaterialTypeSelector({ value, onChange }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">Material Type</p>
      <div className="flex flex-wrap gap-2">
        {MATERIAL_TYPES.map((type) => {
          const active = type.key === value;
          return (
            <button
              key={type.key}
              type="button"
              onClick={() => onChange(type.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                active
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                  : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              }`}
            >
              <type.icon className="h-3.5 w-3.5" />
              {type.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}