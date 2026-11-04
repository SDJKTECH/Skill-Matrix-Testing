import React, { useRef, useState } from "react";
import { FiChevronRight } from "react-icons/fi";

const STAGGER_STEP_MS = 45;
// Items beyond this index all share the same (last) delay instead of an
// ever-growing one — keeps a long, scrollable list from making the bottom
// rows wait seconds to appear.
const STAGGER_CAP_INDEX = 6;

/**
 * One row of OpenBatchesCard.jsx — name + subtitle + status label + chevron.
 * `statusStyleMap`/`onClick` are caller-supplied (OCP/DIP): this component
 * knows nothing about batch/training status vocabulary, only that it was
 * handed a `statusKey` to look up in whatever style map it's given. `isNew`
 * doesn't get its own badge — it's purely a sort-order signal (see
 * openBatchesAdapter.js) so it doesn't compete with the status label for
 * the same trailing slot.
 *
 * Micro-interactions: staggered fade+rise entrance and a click-ripple — all
 * gated behind `prefers-reduced-motion` (see the `@media` block in
 * OpenBatchesCard.jsx's injected <style>). Hover feedback is bg tint + a
 * 3px left border accent, no transform — a translateX hover here previously
 * pushed the row past its list container's bounds and triggered a
 * horizontal scrollbar (the list's `overflow-y-auto`, with no explicit
 * overflow-x, computes overflow-x as "auto" too per the CSS spec). Left
 * border width is set at rest (not just on hover) so only its color
 * changes, avoiding a layout shift.
 */
export default function BatchListItem({ item, statusStyleMap, onClick, index = 0 }) {
  const [ripples, setRipples] = useState([]);
  const rippleSeq = useRef(0);
  const style = statusStyleMap[item.statusKey] || statusStyleMap.notStarted;
  const delay = Math.min(index, STAGGER_CAP_INDEX) * STAGGER_STEP_MS;

  const handleClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const id = ++rippleSeq.current;
    setRipples((r) => [...r, { id, x: e.clientX - rect.left, y: e.clientY - rect.top }]);
    onClick?.(item);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      style={{ animationDelay: `${delay}ms` }}
      className="obc-row group relative w-full flex items-center gap-2 px-2 py-1 rounded-lg border-l-[3px] border-l-transparent overflow-hidden text-left cursor-pointer transition-colors duration-200 hover:border-l-blue-300 dark:hover:border-l-blue-300 hover:bg-gray-50 dark:hover:bg-gray-700/40"
    >
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium text-gray-800 dark:text-gray-200 truncate">{item.name}</p>
        {item.subtitle && <p className="text-[9px] text-gray-400 truncate">{item.subtitle}</p>}
      </div>
      <span className={`text-[9px] font-medium shrink-0 ${style.text}`}>{style.label}</span>
      <FiChevronRight className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600 shrink-0 transition-transform group-hover:translate-x-0.5" />
      {ripples.map((r) => (
        <span
          key={r.id}
          aria-hidden="true"
          className="obc-ripple pointer-events-none absolute rounded-full bg-gray-400/30 dark:bg-gray-300/20"
          style={{ left: r.x, top: r.y, width: 8, height: 8, marginLeft: -4, marginTop: -4 }}
          onAnimationEnd={() => setRipples((rs) => rs.filter((x) => x.id !== r.id))}
        />
      ))}
    </button>
  );
}
