import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FiChevronRight } from "react-icons/fi";
import { getScrollContainer } from "../../../../helper/utility";

/** Strip parenthetical mock/role suffixes so labels stay readable in peeks. */
function displayName(name) {
  const cleaned = String(name || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
  return cleaned || name || "Unknown";
}

const PANEL_HEIGHT = 44;

/**
 * Hover affordance for drillable manager rows — deliberately NOT a data
 * preview (no roster, no headcount): earlier versions showed both and it
 * read as a wall of information for what's really a one-step "click to go
 * here" signal. This is that signal alone — one clickable line, same
 * drill-in `onNavigate` the row itself triggers. The mouse/focus handlers
 * exist so hovering or tabbing INTO the panel (a portal, so it isn't a DOM
 * descendant of the trigger row) keeps it open — without them the row's own
 * hide-on-leave timer would close this out from under the cursor/focus
 * before a click or Tab could ever land on it.
 */
export default function EmployeeDrillPeek({
  anchorRef,
  open,
  employee,
  panelId,
  onNavigate,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
}) {
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [placement, setPlacement] = useState("bottom");
  const panelWidth = 220;
  const managerLabel = displayName(employee?.name);

  useEffect(() => {
    if (!open || !anchorRef?.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    // CROSS-3/FLAG-4 (2026-08-19): now the shared helper/utility.js version
    // (was a near-duplicate local copy) — its "no scrollable ancestor found"
    // fallback is document.documentElement rather than null, so containerRect
    // is truthy more often than before. In practice this converges to the
    // same boundTop/boundBottom below: documentElement's top is ≤0 and its
    // bottom exceeds window.innerHeight for any page taller than the
    // viewport (true throughout this dashboard), so Math.max/Math.min just
    // land on the same `: 8` / `: window.innerHeight - 8` fallbacks either
    // way.
    const containerRect = getScrollContainer(anchorRef.current)?.getBoundingClientRect();
    const boundTop = containerRect ? Math.max(8, containerRect.top) : 8;
    const boundBottom = containerRect ? Math.min(window.innerHeight - 8, containerRect.bottom) : window.innerHeight - 8;

    let left = rect.left;
    if (left + panelWidth > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - panelWidth - 8);
    }
    let top = rect.bottom + 8;
    let nextPlacement = "bottom";
    if (top + PANEL_HEIGHT > boundBottom) {
      top = rect.top - PANEL_HEIGHT - 8;
      nextPlacement = "top";
    }
    top = Math.max(boundTop, Math.min(top, boundBottom - PANEL_HEIGHT));
    setPosition({ top, left });
    setPlacement(nextPlacement);
  }, [open, anchorRef]);

  if (!open || !employee) return null;

  const content = (
    <div
      id={panelId}
      className="fixed z-[200]"
      style={{ top: position.top, left: position.left, width: panelWidth }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Caret ties the card visually to the row that triggered it — without
          it, a floating panel with the same white background as the list
          behind it reads as a layout glitch rather than a preview. */}
      <div
        aria-hidden="true"
        className={`absolute left-5 h-2.5 w-2.5 rotate-45 bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 ${
          placement === "top" ? "border-b border-r -bottom-[5px]" : "border-t border-l -top-[5px]"
        }`}
      />
      <button
        type="button"
        onClick={onNavigate}
        onFocus={onFocus}
        onBlur={onBlur}
        className="relative w-full flex items-center justify-between gap-2 rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl px-3 py-2.5 text-left cursor-pointer hover:border-blue-200 dark:hover:border-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <span className="min-w-0 truncate text-[11px] font-semibold text-blue-600 dark:text-blue-400">
          View {managerLabel}&apos;s team
        </span>
        <FiChevronRight className="h-3.5 w-3.5 shrink-0 text-blue-500 dark:text-blue-400" aria-hidden="true" />
      </button>
    </div>
  );

  return createPortal(content, document.body);
}
