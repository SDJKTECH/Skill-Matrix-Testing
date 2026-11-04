import React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, ResponsiveContainer } from "recharts";
import { useTheme } from "../../../../context/ThemeContext";
import { getChartTheme } from "../services/chartPalette";
import MultiSelectFilter from "../../shared/components/filters/MultiSelectFilter";
import ExportButton from "./ExportButton";

// Custom tooltip so the module's Area can show as muted subtext under the record count — Recharts' formatter prop only replaces one value line.
function ModuleTooltip({ active, payload, chrome, moduleAreaMap }) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0].payload;
  return (
    <div style={{ backgroundColor: chrome.surface, border: `1px solid ${chrome.gridline}`, borderRadius: 8, padding: "6px 10px", fontSize: 12 }}>
      <div style={{ color: chrome.textPrimary, fontWeight: 600 }}>{name}</div>
      {moduleAreaMap[name] && <div style={{ color: chrome.muted, fontSize: 11 }}>{moduleAreaMap[name]}</div>}
      <div style={{ color: chrome.textPrimary }}>{value.toLocaleString()} records</div>
    </div>
  );
}

// Records by Module — bars toggle the Module selection like a PieChartCard slice.
// The header's MultiSelectFilter shares that same selection state, reaching modules beyond the visible top rows.
export default function ModuleBarChart({ data, selectedNames, onSliceClick, onExport, moduleOptions, onModulesChange, moduleAreaMap }) {
  const { dark } = useTheme();
  const { barFill, chrome } = getChartTheme(dark);
  // Cap visible rows so the chart doesn't grow unbounded with the module catalog.
  const visible = data.slice(0, 10);
  const rowHeight = 28;
  const chartHeight = Math.max(visible.length * rowHeight, 120);
  const hasSelection = selectedNames.length > 0;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-3 flex flex-col min-w-0">
      <div className="flex items-center justify-between gap-2 mb-1 shrink-0">
        <h2 className="text-xs font-semibold text-gray-900 dark:text-white">Records by Module</h2>
        <div className="flex items-center gap-2 shrink-0">
          {data.length > visible.length && (
            <span className="text-[10px] text-gray-400 dark:text-gray-500">Top {visible.length} of {data.length}</span>
          )}
          <MultiSelectFilter
            label="Module"
            allLabel="All Modules"
            options={moduleOptions}
            selected={selectedNames}
            onChange={onModulesChange}
            minWidthClass="min-w-[8rem]"
          />
          <ExportButton filename="records-by-module.csv" fetchRows={onExport} />
        </div>
      </div>
      {visible.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-10 text-xs text-gray-400 dark:text-gray-500">
          No data for the current filters
        </div>
      ) : (
        <div style={{ height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={visible} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
              <CartesianGrid horizontal={false} stroke={chrome.gridline} />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fontSize: 10, fill: chrome.muted }}
                axisLine={{ stroke: chrome.baseline }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={140}
                tick={{ fontSize: 11, fill: chrome.textSecondary }}
                axisLine={{ stroke: chrome.baseline }}
                tickLine={false}
              />
              <Tooltip
                content={<ModuleTooltip chrome={chrome} moduleAreaMap={moduleAreaMap} />}
                cursor={{ fill: chrome.gridline, opacity: 0.4 }}
              />
              <Bar
                dataKey="value"
                fill={barFill}
                radius={[0, 4, 4, 0]}
                maxBarSize={16}
                onClick={(entry) => onSliceClick(entry.name)}
                cursor="pointer"
              >
                {visible.map((entry) => {
                  const isActive = selectedNames.includes(entry.name);
                  const isDimmed = hasSelection && !isActive;
                  return <Cell key={entry.name} fill={barFill} opacity={isDimmed ? 0.35 : 1} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
