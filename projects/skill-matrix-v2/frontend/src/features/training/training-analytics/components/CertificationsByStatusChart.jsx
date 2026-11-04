import React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, LabelList, ResponsiveContainer } from "recharts";
import { useTheme } from "../../../../context/ThemeContext";
import { getChartTheme, CERT_STATUS_COLORS } from "../services/chartPalette";
import ExportButton from "./ExportButton";

/**
 * Certification count by expiry status — org-wide, unfiltered by the
 * dashboard's dropdowns since certifications have no link to the training
 * hierarchy those filters read from.
 * @param {{ data: { buckets: Array<{key:string,label:string,count:number}>, total: number }, onExport: () => Promise<Array<object>> }} props
 */
export default function CertificationsByStatusChart({ data, onExport }) {
  const { dark } = useTheme();
  const { chrome } = getChartTheme(dark);
  const { buckets, total } = data;
  const expiredOrSoon = buckets
    .filter((b) => b.key !== "Valid")
    .reduce((sum, b) => sum + b.count, 0);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-3 flex flex-col min-w-0">
      <div className="flex items-center justify-between gap-2 mb-1 shrink-0">
        <h2 className="text-xs font-semibold text-gray-900 dark:text-white">Certifications by Status</h2>
        <div className="flex items-center gap-2 shrink-0">
          {total > 0 && (
            <span className="text-[10px] font-medium text-orange-600 dark:text-orange-400">
              {expiredOrSoon.toLocaleString()} of {total.toLocaleString()} expiring or expired
            </span>
          )}
          <ExportButton filename="certifications-by-status.csv" fetchRows={onExport} />
        </div>
      </div>
      {total === 0 ? (
        <div className="flex-1 flex items-center justify-center py-10 text-xs text-gray-400 dark:text-gray-500">
          No certification data
        </div>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={buckets} margin={{ top: 16, right: 8, bottom: 4, left: 4 }}>
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
                formatter={(value) => [`${value.toLocaleString()} certifications`, "Count"]}
                contentStyle={{
                  backgroundColor: chrome.surface,
                  border: `1px solid ${chrome.gridline}`,
                  borderRadius: 8,
                  fontSize: 12,
                  color: chrome.textPrimary,
                }}
                itemStyle={{ color: chrome.textPrimary }}
                cursor={{ fill: chrome.gridline, opacity: 0.4 }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={64}>
                {buckets.map((bucket) => (
                  <Cell key={bucket.key} fill={CERT_STATUS_COLORS[bucket.key]} />
                ))}
                <LabelList dataKey="count" position="top" style={{ fontSize: 11, fill: chrome.textPrimary }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
