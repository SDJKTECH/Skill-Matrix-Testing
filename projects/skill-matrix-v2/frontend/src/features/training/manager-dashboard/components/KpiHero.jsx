import React from "react";
import { FiChevronRight } from "react-icons/fi";

/**
 * The 4 KPI summary cards, config-driven — a new metric is a new entry in
 * the `items` array the caller supplies, not a new copy-pasted JSX block
 * here (the OCP fix: previously 4 hand-written blocks in ManagerDashboard.jsx).
 *
 * An item without `onClick` renders as a non-interactive div (no
 * hover-color treatment, no chevron, cursor-default) — driven by
 * `onClick`'s presence, not a separate boolean, so a config entry can't
 * end up "looks clickable but does nothing" or vice versa.
 *
 * flex-wrap (not a fixed-column-count grid) — a discrete breakpoint jump
 * (e.g. 2-up until some width, then straight to N-up) is fragile: any width
 * short of the jump falls all the way back regardless of how much real
 * room exists, and confirmed LIVE (Edge vs Chrome, same machine, same
 * moment) two browsers' actual content-viewport widths can differ enough
 * to land on opposite sides of the same breakpoint even when outwardly
 * "the same window size" — the exact bug this replaced (5 items collapsing
 * to 2+2+1, an orphan tile alone on its own row). Each tile instead has its
 * own `flex: 1 1 <minWidth>`, so however many fit a given row's actual
 * width, they share it evenly and continuously — no hard jumps, and
 * whatever's left on a trailing (possibly partial) row still stretches to
 * fill it rather than leaving a dead gap, at ANY width, for ANY item
 * count. Sizing is deliberately compact (small icon box, tight
 * line-height) so the whole row — and the page below it — takes less
 * vertical space; this card doesn't need the same visual heft as a click
 * target elsewhere on the page since its job is a quick glanceable count,
 * not a primary action.
 *
 * `tooltip` (optional, item-level): shown on hover over the WHOLE tile, not
 * just the value text — an item whose value alone doesn't fully explain
 * what clicking it does (e.g. "Pending Approvals" — an icon-only badge
 * button covering the same information used to test as not self-evident
 * on its own, see ManagerDashboard.jsx's own comment) can layer on an
 * action-stating detail without needing a bespoke non-KpiHero control.
 *
 * `highlighted` (optional, item-level, e.g. Pending Approvals when its count
 * is > 0): a "needs attention" treatment shared by whichever items opt in —
 * intentionally more than a single color swap (WCAG 1.4.1: don't convey
 * meaning through color alone, and a caller's own `iconBg`/`iconColor` may
 * already be tuned per item). Layers a notification dot on the icon, a tile
 * ring/tint, and a bold value color — three independent channels (shape,
 * boundary, and color) that still degrade gracefully if any one is missed.
 * Centralized here, not a per-caller class string, so a second tile that
 * later wants the same "needs attention" look gets it for free instead of
 * re-guessing the same amber combination.
 *
 * Props: { items: [{key,icon,label,value,iconBg,iconColor,highlighted?,onClick?,tooltip?}] }
 */
export default function KpiHero({ items }) {
  const baseClasses = "bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700 shadow-sm p-2 flex items-center gap-2 transition-all text-left";
  const highlightClasses = "border-amber-200 dark:border-amber-800 ring-1 ring-amber-200/70 dark:ring-amber-800/50 bg-amber-50/60 dark:bg-amber-900/10";

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => {
        const body = (
          <>
            <div className={`relative w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${item.iconBg}`}>
              <item.icon className={`h-3.5 w-3.5 ${item.iconColor}`} />
              {item.highlighted && (
                // `animate-pulse` (calm opacity breathe), not `animate-ping`
                // (expanding radar ring) — this exact codebase already
                // tried `animate-ping` on a badge once (Quick Actions'
                // nomination tile) and the user asked for it softened for
                // reading as harsh "blinking"; `motion-safe:` respects
                // prefers-reduced-motion, same convention that fix landed
                // on. Scoped to this 2x2 dot only, not the whole tile —
                // continuous motion stays proportional to how small/
                // secondary the cue is.
                <span
                  className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-amber-500 dark:bg-amber-400 ring-2 ring-white dark:ring-gray-800 motion-safe:animate-pulse"
                  aria-hidden="true"
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 truncate leading-tight" title={item.label}>{item.label}</p>
              <p
                className={`text-base font-bold truncate leading-tight ${item.highlighted ? "text-amber-600 dark:text-amber-400" : "text-gray-900 dark:text-white"}`}
                title={String(item.value)}
              >
                {item.value}
              </p>
            </div>
            {item.onClick && <FiChevronRight className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600 shrink-0" />}
          </>
        );
        // basis-[150px]: roughly the narrowest a tile stays legible at
        // (icon + truncating label/value + chevron) — matches how many fit
        // per row at the old grid's own narrowest step (2 columns on a
        // ~375px mobile screen). grow+shrink means every row, including a
        // partial trailing one, always fills its full width. No max-width
        // cap — tried one first (capped a lone trailing tile's growth so
        // it wouldn't look oversized), but confirmed live it backfired: capping
        // growth is exactly what leaves a dead gap instead of filling the
        // row, the original problem this whole change exists to remove. A
        // lone tile taking the full row's width reads as "this one has the
        // room," not broken — the standard, expected flex-grow outcome for
        // an odd-one-out on its own line.
        const sizeClasses = "grow shrink basis-[150px]";
        const toneClasses = item.highlighted ? highlightClasses : "";

        return item.onClick ? (
          <button key={item.key} type="button" onClick={item.onClick} title={item.tooltip} className={`${baseClasses} ${sizeClasses} ${toneClasses} hover:shadow-md cursor-pointer`}>
            {body}
          </button>
        ) : (
          <div key={item.key} title={item.tooltip} className={`${baseClasses} ${sizeClasses} ${toneClasses} cursor-default`}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
