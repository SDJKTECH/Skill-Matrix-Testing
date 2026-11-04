import React, { useLayoutEffect, useRef, useState } from "react";
import { FOCUS_RING } from "../config/focusRing";

/**
 * Sliding-indicator tab list — one shared absolutely-positioned pill
 * measured against whichever tab button is currently active, animated via
 * CSS transform/width transitions instead of each tab owning its own
 * background (that would just be an instant color snap between buttons,
 * not a sliding highlight). Recomputed whenever `items` changes too (a
 * tab's own label/count text width can change the active button's own
 * offsetWidth). Horizontally scrollable (not wrapping) below the `sm`
 * breakpoint so a single-row toolbar stays one row on mobile too.
 *
 * Extracted from EmployeeTrainingPanel.jsx (My Trainings' status tabs) so
 * Manager Dashboard's "Direct Reports — Training Status" section can use
 * the exact same tabs, in place of the differently-styled (instant
 * color-snap, no sliding indicator) StatusChipRow it used before.
 *
 * `icon` is optional per item — both current consumers omit it (matching
 * My Trainings' original label+count-only look on both pages), but it's
 * supported so a future caller isn't blocked from adding one.
 *
 * Props: { items: [{key,label,icon?,count?}], activeKey, onChange, ariaLabel, className? }
 */
export default function StatusTabs({ items, activeKey, onChange, ariaLabel, className = "" }) {
  const tabRefs = useRef({});
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  useLayoutEffect(() => {
    const el = tabRefs.current[activeKey];
    if (el) setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
  }, [activeKey, items]);

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`relative flex items-center gap-1.5 overflow-x-auto flex-nowrap hide-scrollbar sm:flex-wrap sm:overflow-visible ${className}`}
    >
      <span
        aria-hidden="true"
        className="absolute top-0 left-0 h-8 rounded-full bg-blue-600 dark:bg-blue-500 shadow-sm transition-[transform,width] duration-200 ease-out motion-reduce:transition-none"
        style={{ transform: `translateX(${indicator.left}px)`, width: indicator.width }}
      />
      {items.map((item) => {
        const active = activeKey === item.key;
        return (
          <button
            key={item.key}
            ref={(el) => {
              if (el) tabRefs.current[item.key] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.key)}
            className={`relative z-10 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-semibold whitespace-nowrap transition-colors duration-150 cursor-pointer ${FOCUS_RING} ${
              active ? "text-white" : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
          >
            {item.icon && <item.icon className="h-3.5 w-3.5" />}
            {item.label}
            {item.count != null && (
              <span
                className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold tabular-nums ${
                  active ? "bg-white/25 text-white" : "bg-gray-100 dark:bg-gray-900 text-gray-500 dark:text-gray-400"
                }`}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
