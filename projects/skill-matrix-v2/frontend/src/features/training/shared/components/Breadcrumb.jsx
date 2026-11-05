import React, { useMemo, useRef, useState, useEffect } from "react";
import { FiChevronRight } from "react-icons/fi";
import { FOCUS_RING } from "../config/focusRing";

/**
 * Keep the trail readable on deep drills: first crumb + last two when the
 * path is long; middle levels collapse behind a "…" control that lists them.
 */
function buildVisibleTrail(items, maxVisible = 3) {
  if (!items || items.length <= maxVisible) {
    return { visible: items || [], collapsed: [] };
  }
  return {
    visible: [items[0], { key: "__ellipsis__", isEllipsis: true }, ...items.slice(-2)],
    collapsed: items.slice(1, -2),
  };
}

/**
 * Generic crumb trail — "My Team > Priya Nair's Team" style navigation for
 * the Manager Dashboard's hierarchy drill-down (any earlier crumb jumps
 * back to that level; the last crumb is the current position, not
 * clickable). Deep paths collapse middle levels so the row never overflows
 * its card; long labels truncate with a title tooltip.
 *
 * Props: { items: [{key,label,onClick}], maxVisible? } — last item's onClick is ignored
 * (current position); trails longer than maxVisible (default 3) collapse.
 */
export default function Breadcrumb({ items, maxVisible = 3 }) {
  const { visible, collapsed } = useMemo(() => buildVisibleTrail(items, maxVisible), [items, maxVisible]);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [items]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  if (!visible || visible.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="min-w-0 max-w-full flex items-center gap-1 text-xs overflow-hidden">
      {visible.map((item, idx) => {
        const isLast = idx === visible.length - 1;
        return (
          <React.Fragment key={item.key}>
            {idx > 0 && <FiChevronRight className="h-3 w-3 shrink-0 text-gray-300 dark:text-gray-600" aria-hidden="true" />}
            {item.isEllipsis ? (
              <span className="relative shrink-0" ref={menuRef}>
                <button
                  type="button"
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                  aria-label="Show hidden breadcrumb levels"
                  onClick={() => setMenuOpen((open) => !open)}
                  className={`px-1.5 py-0.5 rounded font-semibold text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700/60 cursor-pointer ${FOCUS_RING}`}
                >
                  …
                </button>
                {menuOpen && collapsed.length > 0 && (
                  <div
                    role="menu"
                    className="absolute left-0 top-full z-30 mt-1 min-w-[12rem] max-w-[min(20rem,70vw)] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1"
                  >
                    {collapsed.map((crumb) => (
                      <button
                        key={crumb.key}
                        type="button"
                        role="menuitem"
                        title={crumb.label}
                        onClick={() => {
                          setMenuOpen(false);
                          crumb.onClick?.();
                        }}
                        className={`w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-blue-900/30 truncate cursor-pointer ${FOCUS_RING}`}
                      >
                        {crumb.label}
                      </button>
                    ))}
                  </div>
                )}
              </span>
            ) : isLast ? (
              <span
                className="min-w-0 flex-1 basis-0 truncate font-semibold text-gray-900 dark:text-white"
                aria-current="page"
                title={item.label}
              >
                {item.label}
              </span>
            ) : (
              <button
                type="button"
                onClick={item.onClick}
                title={item.label}
                className={`shrink-0 max-w-[9rem] sm:max-w-[12rem] truncate text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer rounded ${FOCUS_RING}`}
              >
                {item.label}
              </button>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
