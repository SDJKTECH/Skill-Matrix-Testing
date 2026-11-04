import React from "react";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useTheme } from "../../../../context/ThemeContext";
import { getChartTheme } from "../services/chartPalette";
import ExportButton from "./ExportButton";

/**
 * A single donut chart card, used for both the Area and Sub Area breakdowns.
 * Clicking a slice toggles it into/out of the selection — the same array
 * the dropdown filter for this dimension reads/writes (see
 * TrainingFilterBar.jsx).
 * @param {{ title: string, data: Array<{name:string,value:number}>, selectedNames: string[], onSliceClick: (name:string)=>void, exportFilename: string, onExport: () => Promise<Array<object>> }} props
 */
export default function PieChartCard({ title, data, selectedNames, onSliceClick, exportFilename, onExport }) {
  const { dark } = useTheme();
  const { categorical, chrome } = getChartTheme(dark);
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const hasSelection = selectedNames.length > 0;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-3 flex flex-col min-w-0">
      <div className="flex items-center justify-between gap-2 mb-1 shrink-0">
        <h2 className="text-xs font-semibold text-gray-900 dark:text-white">{title}</h2>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-gray-400 dark:text-gray-500">{total.toLocaleString()} records</span>
          <ExportButton filename={exportFilename} fetchRows={onExport} />
        </div>
      </div>
      {data.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-10 text-xs text-gray-400 dark:text-gray-500">
          No data for the current filters
        </div>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={1}
                onClick={(entry) => onSliceClick(entry.name)}
                cursor="pointer"
              >
                {data.map((entry, index) => {
                  const isActive = selectedNames.includes(entry.name);
                  const isDimmed = hasSelection && !isActive;
                  return (
                    <Cell
                      key={entry.name}
                      fill={categorical[index % categorical.length]}
                      stroke={chrome.surface}
                      strokeWidth={isActive ? 3 : 2}
                      opacity={isDimmed ? 0.35 : 1}
                    />
                  );
                })}
              </Pie>
              <Tooltip
                formatter={(value, name) => [`${value.toLocaleString()} records`, name]}
                contentStyle={{
                  backgroundColor: chrome.surface,
                  border: `1px solid ${chrome.gridline}`,
                  borderRadius: 8,
                  fontSize: 12,
                  color: chrome.textPrimary,
                }}
                itemStyle={{ color: chrome.textPrimary }}
              />
              <Legend
                verticalAlign="bottom"
                height={36}
                wrapperStyle={{ fontSize: 11, color: chrome.textSecondary }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
