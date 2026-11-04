import React from "react";
import { FiBell } from "react-icons/fi";
import { FOCUS_RING } from "../config/focusRing";

/**
 * Icon-only notification-bell trigger, shared between My Trainings
 * (EmployeeTrainingPanel.jsx's nomination catalog) and Manager Dashboard
 * (pending-approvals entry that navigates to Training Batches) — same
 * control footprint so both pages look identical rather than each rolling
 * its own bell button.
 *
 * Always renders (a stable, predictable spot to check — not a control
 * that appears/disappears and shifts the rest of the toolbar around).
 * Same 36px circular footprint as the collapsed SearchToggle button it
 * sits next to on both pages, and picks up that same neutral gray
 * treatment while `count` is 0 so it doesn't compete for attention when
 * there's nothing to see. Once `count` is truthy, it switches to the
 * violet-tinted treatment with a badge overlapping the icon's top-right
 * corner — a `ring` in the page's own background color is what makes it
 * read as a badge "sitting on top of" the icon (the standard iOS/Slack
 * notification treatment) instead of two shapes just touching. No "0"
 * badge is ever shown — the color shift alone is the zero-state signal.
 *
 * Props: { count, onClick, label, open?, panelId?, icon?, tooltip? }
 * `open` / `panelId` are optional — only used when the bell expands an
 * inline panel (My Trainings). Manager Dashboard omits them and navigates.
 * `icon` defaults to FiBell (My Trainings' "new items to browse" use case);
 * Manager Dashboard overrides it to FiInbox since its bell is a
 * single-destination approvals shortcut, not a scannable feed — see
 * ManagerDashboard.jsx. `tooltip` defaults to the `label (count)` format
 * below; Manager Dashboard overrides it with an action-stating string so
 * hovering reveals what clicking actually does, not just a count.
 */
export default function NotificationBellButton({ count, open, onClick, label, panelId, icon, tooltip }) {
  const Icon = icon ?? FiBell;
  const hasCount = Boolean(count);
  const resolvedTooltip = tooltip ?? (hasCount ? `${label} (${count})` : label);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={panelId != null ? open : undefined}
      aria-controls={panelId}
      aria-label={resolvedTooltip}
      title={resolvedTooltip}
      className={`relative shrink-0 h-9 w-9 inline-flex items-center justify-center rounded-full border transition-colors cursor-pointer ${FOCUS_RING} ${
        hasCount
          ? "border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/40"
          : "border-transparent bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {hasCount ? (
        <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-violet-600 text-white text-[10px] font-bold leading-none ring-2 ring-gray-50 dark:ring-gray-900">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </button>
  );
}
