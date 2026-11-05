import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiFilter } from "react-icons/fi";

import { FOCUS_RING } from "../../shared/config/focusRing";

export default function CourseHeaderFilter({
  id,
  label,
  options,
  selected,
  activeFilter,
  onToggle,
  onApply,
}) {
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const isOpen = activeFilter === id;
  const [draft, setDraft] = useState(selected);
  const [position, setPosition] = useState({
    position: "fixed",
    top: -1000,
    left: -1000,
    visibility: "hidden",
  });

  useEffect(() => {
    if (isOpen) setDraft(selected);
  }, [isOpen, selected]);

  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current || !panelRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const panelRect = panelRef.current.getBoundingClientRect();
    const margin = 8;
    const top =
      triggerRect.bottom + panelRect.height <= window.innerHeight - margin
        ? triggerRect.bottom + 6
        : Math.max(margin, triggerRect.top - panelRect.height - 6);

    setPosition({
      position: "fixed",
      top,
      left: Math.max(
        margin,
        Math.min(
          triggerRect.left,
          window.innerWidth - panelRect.width - margin
        )
      ),
      visibility: "visible",
    });
  }, [isOpen, draft.length]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onToggle(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen, onToggle]);

  const allSelected = options.every((option) => draft.includes(option));
  const toggleOption = (option) => {
    setDraft((current) =>
      current.includes(option)
        ? current.filter((item) => item !== option)
        : [...current, option]
    );
  };

  return (
    <>
      <span className="relative inline-flex items-center gap-1">
        {label && <span>{label}</span>}
        <button
          ref={triggerRef}
          type="button"
          aria-label={`Filter by ${label || id.replace(/-/g, " ")}`}
          aria-expanded={isOpen}
          onClick={(event) => {
            event.stopPropagation();
            onToggle(isOpen ? null : id);
          }}
          className={`inline-flex h-5 w-5 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200 ${
            selected.length ? "text-gray-800 dark:text-gray-100" : ""
          } ${FOCUS_RING}`}
        >
          <FiFilter className="h-3 w-3" aria-hidden="true" />
          {selected.length > 0 && (
            <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-gray-700 dark:bg-gray-200" />
          )}
        </button>
      </span>

      {isOpen &&
        createPortal(
          <>
            <button
              type="button"
              className="fixed inset-0 z-[60] cursor-default"
              aria-label={`Close ${(label || id.replace(/-/g, " ")).toLowerCase()} filter`}
              onClick={() => onToggle(null)}
            />
            <div
              ref={panelRef}
              style={position}
              role="dialog"
              aria-label={`${label || id.replace(/-/g, " ")} filter`}
              className="z-[70] w-64 overflow-hidden rounded-xl border border-gray-200 bg-white text-left shadow-xl dark:border-gray-700 dark:bg-gray-800"
            >
              <label className="flex cursor-pointer items-center gap-2.5 border-b border-gray-100 px-3.5 py-3 text-xs font-semibold text-gray-700 dark:border-gray-700 dark:text-gray-200">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() =>
                    setDraft(allSelected ? [] : [...options])
                  }
                  className="h-4 w-4 rounded border-gray-300 accent-blue-600"
                />
                Select all
              </label>

              <div className="py-1.5">
                {options.map((option) => (
                  <label
                    key={option}
                    className="flex cursor-pointer items-center gap-2.5 px-3.5 py-2 text-xs text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700/60"
                  >
                    <input
                      type="checkbox"
                      checked={draft.includes(option)}
                      onChange={() => toggleOption(option)}
                      className="h-4 w-4 rounded border-gray-300 accent-blue-600"
                    />
                    {option}
                  </label>
                ))}
              </div>

              <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/70 px-3.5 py-2 dark:border-gray-700 dark:bg-gray-900/30">
                <button
                  type="button"
                  onClick={() => setDraft([])}
                  disabled={draft.length === 0}
                  className="text-xs font-medium text-gray-500 hover:text-gray-800 disabled:cursor-default disabled:opacity-40 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onApply(draft);
                    onToggle(null);
                  }}
                  className={`rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 ${FOCUS_RING}`}
                >
                  Done
                </button>
              </div>
            </div>
          </>,
          document.body
        )}
    </>
  );
}
