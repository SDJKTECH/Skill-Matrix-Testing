import React from "react";
import { FiAlertTriangle, FiClock, FiChevronRight } from "react-icons/fi";

// Two tones, not one blanket "warning" style for every row: a genuine gap
// (no certifications/trainings/skills) is actionable and gets the amber
// alert treatment; a neutral status update ("N associates currently
// undergoing training") isn't a problem at all — showing it with the same
// warning triangle as a real gap misrepresents it. `tone` defaults to
// "warning" so existing callers don't have to opt in explicitly for the
// common case. The info tone deliberately does NOT reuse FiActivity (the
// "Total Skills" KPI card's icon a few rows away) — a clock reads
// unambiguously as "ongoing," where the activity/pulse glyph would just
// look like a copy-pasted icon with a different color.
const TONE_STYLES = {
  warning: {
    icon: FiAlertTriangle,
    iconClass: "text-amber-500",
    border: "border-amber-100 dark:border-amber-800/30",
    bg: "bg-amber-50/50 dark:bg-amber-900/10",
    hoverBg: "hover:bg-amber-50 dark:hover:bg-amber-900/20",
  },
  info: {
    icon: FiClock,
    iconClass: "text-blue-500",
    border: "border-blue-100 dark:border-blue-800/30",
    bg: "bg-blue-50/50 dark:bg-blue-900/10",
    hoverBg: "hover:bg-blue-50 dark:hover:bg-blue-900/20",
  },
};

/**
 * "Team Alerts" card — config-driven list of alert rows. Every row is
 * still just an `onClick`, but the two shapes read differently:
 *   - no `items`: a real destination page exists to navigate to — trailing
 *     "→", clicking navigates away. Not currently used by any of the four
 *     configured alerts (see ManagerDashboard.jsx's alertItems — all four
 *     now reveal inline instead), kept as a supported shape for any future
 *     alert that DOES have a real destination worth leaving the dashboard
 *     for.
 *   - `items` is set: no dedicated destination page (or the detail is
 *     more useful shown right here) — clicking doesn't navigate anywhere,
 *     the parent (ManagerDashboard) uses the click to drive what
 *     TeamTrainingStatusCard shows in its own list area (an employee list
 *     for the three absence alerts, or actual training cards for
 *     associatesUndergoingTraining — see that card's own doc comment),
 *     reusing that card's existing list/scroll surface instead of
 *     cramming a second list into this narrow sidebar card. Shown with a
 *     lighter "›" reveal chevron instead of "→".
 *
 * The active row uses a SOLID blue fill (white text/icon), not a pale
 * blue tint over the tone's own pale background — the row's default state
 * is already a soft pastel (amber for warning, blue for info), so a
 * similarly-pale "active" tint didn't read as clearly different at a
 * glance. Solid fill is the same "this one is selected" language
 * StatusTabs/SegmentedToggle already use elsewhere on this dashboard.
 *
 * Props: { alerts: [{key, count, text, onClick, items?, tone?}], activeKey }
 */
export default function TeamAlertsCard({ alerts, activeKey }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-2.5 flex flex-col cursor-default">
      <div className="flex items-center gap-1.5 mb-2 shrink-0">
        <FiAlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
        <h2 className="text-xs font-semibold text-gray-900 dark:text-white">Team Alerts</h2>
      </div>
      <div className="space-y-1.5">
        {alerts.map(({ key, count, text, onClick, items, tone = "warning" }) => {
          const t = TONE_STYLES[tone] || TONE_STYLES.warning;
          const isReveal = Array.isArray(items);
          const enabled = isReveal ? items.length > 0 : Boolean(onClick);
          const isActive = isReveal && activeKey === key;
          return (
            <button
              key={key}
              type="button"
              onClick={enabled ? onClick : undefined}
              disabled={!enabled}
              aria-pressed={isReveal ? isActive : undefined}
              className={`w-full flex items-center gap-2.5 p-2 rounded-lg border transition-colors text-left ${
                isActive
                  ? "border-blue-600 dark:border-blue-500 bg-blue-600 dark:bg-blue-600"
                  : `${t.border} ${t.bg} ${enabled ? t.hoverBg : ""}`
              } ${enabled ? "cursor-pointer" : "cursor-default"}`}
            >
              <t.icon className={`h-4 w-4 shrink-0 ${isActive ? "text-white" : t.iconClass}`} />
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-medium ${isActive ? "text-white" : "text-gray-900 dark:text-white"}`}>{count} {text}</p>
              </div>
              {!isReveal && onClick && <span className="text-gray-400 dark:text-gray-500 text-xs">→</span>}
              {isReveal && enabled && (
                <FiChevronRight className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-white" : "text-gray-400 dark:text-gray-500"}`} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
