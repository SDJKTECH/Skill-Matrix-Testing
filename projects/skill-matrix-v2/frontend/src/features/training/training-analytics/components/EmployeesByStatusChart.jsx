import React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, Cell, ResponsiveContainer } from "recharts";
import { useTheme } from "../../../../context/ThemeContext";
import { getChartTheme } from "../services/chartPalette";
import ExportButton from "./ExportButton";

// Custom tooltip so zero-count Areas in this status group are hidden and the rest sort by size.
function GroupedStatusTooltip({ active, payload, chrome, areaColors }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const entries = payload.filter((p) => p.value > 0).sort((a, b) => b.value - a.value);
  const total = entries.reduce((sum, p) => sum + p.value, 0);
  return (
    <div style={{ backgroundColor: chrome.surface, border: `1px solid ${chrome.gridline}`, borderRadius: 8, padding: "6px 10px", fontSize: 12, minWidth: 150 }}>
      <div style={{ color: chrome.textPrimary, fontWeight: 600 }}>{row.label}</div>
      <div style={{ color: chrome.textPrimary, marginBottom: 4 }}>{total.toLocaleString()} enrollments</div>
      {entries.map((entry) => (
        <div key={entry.dataKey} style={{ color: chrome.textSecondary, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, display: "inline-block", backgroundColor: areaColors[entry.dataKey] }} />
            {entry.dataKey}
          </span>
          <span>{entry.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

// Enrollment count (not distinct employees) per status bucket, grouped by Area.
// A segment's click toggles BOTH status and Area (onSliceClick(status, area)), same as an Area pie slice.
export default function EmployeesByStatusChart({ data, selectedNames, onSliceClick, onExport, groupedData, areaOrder }) {
  const { dark } = useTheme();
  const { chrome, categorical } = getChartTheme(dark);
  const { totalEnrollments, notCompletedCount } = data;
  const hasSelection = selectedNames.length > 0;
  // Color by position in the full stable areaOrder, but only render Areas with nonzero data below.
  const areaColors = Object.fromEntries(areaOrder.map((area, i) => [area, categorical[i % categorical.length]]));
  const visibleAreas = areaOrder.filter((area) => groupedData.some((row) => (row[area] || 0) > 0));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-3 flex flex-col min-w-0">
      <div className="flex items-center justify-between gap-2 mb-1 shrink-0">
        <h2 className="text-xs font-semibold text-gray-900 dark:text-white">Enrollments by Training Status</h2>
        <div className="flex items-center gap-2 shrink-0">
          {totalEnrollments > 0 && (
            <span className="text-[10px] font-medium text-orange-600 dark:text-orange-400">
              {notCompletedCount.toLocaleString()} of {totalEnrollments.toLocaleString()} not completed
            </span>
          )}
          <ExportButton filename="enrollments-by-training-status.csv" fetchRows={onExport} />
        </div>
      </div>
      {totalEnrollments === 0 ? (
        <div className="flex-1 flex items-center justify-center py-10 text-xs text-gray-400 dark:text-gray-500">
          No data for the current filters
        </div>
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={groupedData} margin={{ top: 4, right: 8, bottom: 4, left: 4 }} barGap={2} barCategoryGap="20%">
              <CartesianGrid vertical={false} stroke={chrome.gridline} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: chrome.textSecondary }}
                axisLine={{ stroke: chrome.baseline }}
                tickLine={false}
              />
              <YAxis
                type="number"
                allowDecimals={false}
                tick={{ fontSize: 10, fill: chrome.muted }}
                axisLine={{ stroke: chrome.baseline }}
                tickLine={false}
                width={32}
              />
              <Tooltip
                content={<GroupedStatusTooltip chrome={chrome} areaColors={areaColors} />}
                cursor={{ fill: chrome.gridline, opacity: 0.4 }}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {visibleAreas.map((area) => (
                <Bar
                  key={area}
                  dataKey={area}
                  name={area}
                  fill={areaColors[area]}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={20}
                  onClick={(row) => onSliceClick(row.label, area)}
                  cursor="pointer"
                >
                  {groupedData.map((row) => {
                    const isDimmed = hasSelection && !selectedNames.includes(row.label);
                    return <Cell key={row.key} fill={areaColors[area]} opacity={isDimmed ? 0.35 : 1} />;
                  })}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
