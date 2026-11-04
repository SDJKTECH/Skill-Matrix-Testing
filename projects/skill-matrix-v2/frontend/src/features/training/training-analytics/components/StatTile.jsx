import React from "react";

// Same card language as GrowthPathPage.jsx's StatTile — kept as its own copy
// since that one lives in pages/ and isn't a shared component.
export default function StatTile({ icon, n, label, colorClass, iconBgClass, helpText }) {
  const Icon = icon;
  return (
    <div
      className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm px-3 py-2 flex items-center gap-2.5 whitespace-nowrap"
      title={helpText || undefined}
    >
      <div className={`w-8 h-8 rounded-lg ${iconBgClass} flex items-center justify-center shrink-0`}>
        <Icon className={`h-4 w-4 ${colorClass}`} />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">{label}</span>
        <span className={`text-lg font-bold leading-none ${colorClass}`}>{n}</span>
      </div>
    </div>
  );
}
