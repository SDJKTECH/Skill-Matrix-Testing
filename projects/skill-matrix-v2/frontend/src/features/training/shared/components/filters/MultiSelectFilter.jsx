import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { FiChevronDown } from "react-icons/fi";
import usePortalPosition from "../../../../../hooks/usePortalPosition";

/* ── Multi-select filter — same compact visual footprint as a plain
   <select> (min-w/py-1/text-[11px]/chevron), but supports multiple
   selections + type-to-search via a portaled dropdown panel. Portaled (not a
   plain absolute div) because this trigger is often used inside a
   scrollable table wrapper (overflow-x-auto forces overflow-y non-visible
   too per the CSS spec, silently clipping a normal in-flow panel). Each
   instance owns its own open/search state (no shared "only one open at a
   time" — keeps this self-contained). Shared across training-batch
   (BatchTable.jsx, EnrollmentTable.jsx), skillDataTable.jsx/
   certDataTable.jsx, and training-progress (My Trainings' advanced filters,
   Manager Dashboard's Completion Tier filter) — lives in shared/ so all of
   them can import it without any one feature owning it.
   `renderTrigger` lets a caller swap out the default select-like button for
   its own trigger element (skill/cert tables use it to keep their small
   funnel-icon look instead of this component's own button); `onOpenChange`
   reports open/closed state back to the caller, since the dropdown's
   open/close state itself is always managed internally here, never by the
   caller. */
export default function MultiSelectFilter({ label, allLabel, options, selected, onChange, minWidthClass = "", renderTrigger, onOpenChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const style = usePortalPosition({ anchorRef: triggerRef, panelRef, open: isOpen, deps: [search, selected] });

  useEffect(() => {
    if (!isOpen) return;
    const onDocMouseDown = (e) => {
      if (triggerRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
      setIsOpen(false);
      setSearch("");
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [isOpen]);

  useEffect(() => {
    onOpenChange?.(isOpen);

    // Scroll the first selected item into view when the popup opens
    if (isOpen && panelRef.current && selected.length > 0) {
      const timer = setTimeout(() => {
        if (panelRef.current) {
          const firstSelected = panelRef.current.querySelector('input[type="checkbox"]:checked');
          if (firstSelected) {
            firstSelected.scrollIntoView({ block: "nearest" });
          }
        }
      }, 10);
      return () => clearTimeout(timer);
    }
    // onOpenChange deliberately excluded: it's a fresh inline closure on
    // every parent render, so keeping it here would re-run the scrollIntoView
    // above on every keystroke/selection instead of only on open/close.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const filteredOptions = options.filter((o) => o.toLowerCase().includes(search.toLowerCase()));
  const toggleValue = (value) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };
  // "Select all" acts on whatever the search currently narrows the list to
  // (matching the search box right above it), not the full option set —
  // selecting/clearing just the filtered subset while leaving any other
  // already-selected options (from before the search) untouched.
  const allFilteredSelected = filteredOptions.length > 0 && filteredOptions.every((o) => selected.includes(o));
  const someFilteredSelected = filteredOptions.some((o) => selected.includes(o));
  const toggleSelectAllFiltered = () => {
    onChange(
      allFilteredSelected
        ? selected.filter((v) => !filteredOptions.includes(v))
        : Array.from(new Set([...selected, ...filteredOptions]))
    );
  };
  // Selecting every option filters out nothing, same as selecting none, so
  // the trigger reads as "all" either way instead of a misleading "N selected".
  const allOptionsSelected = options.length > 0 && options.every((o) => selected.includes(o));
  const triggerLabel =
    selected.length === 0 || allOptionsSelected ? allLabel : selected.length === 1 ? selected[0] : `${selected.length} selected`;
  const triggerProps = {
    ref: triggerRef,
    role: "button",
    tabIndex: 0,
    "aria-label": `Filter by ${label}`,
    "aria-expanded": isOpen,
    onClick: () => setIsOpen((v) => !v),
    onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setIsOpen((v) => !v);
      }
      if (e.key === "Escape") {
        setIsOpen(false);
        setSearch("");
      }
    },
  };

  return (
    <div className="relative">
      {renderTrigger ? (
        renderTrigger({ triggerProps, isOpen, selected, triggerLabel })
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          aria-label={`Filter by ${label}`}
          className={`w-full ${minWidthClass} pl-1.5 pr-5 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-[11px] font-normal normal-case text-left cursor-pointer focus:outline-none focus:border-blue-400 relative ${selected.length ? "text-gray-900 dark:text-gray-100" : "text-gray-500 dark:text-gray-400"}`}
        >
          <span className="block truncate">{triggerLabel}</span>
          <FiChevronDown className={`pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 h-2.5 w-2.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>
      )}
      {isOpen && createPortal(
        <div
          ref={panelRef}
          // Lets an ANCESTOR popover (e.g. FilterPopover.jsx, when this
          // trigger is rendered inside one) recognize a click landing in
          // here as "still inside," even though createPortal makes this
          // panel a DOM sibling of that ancestor's own portal, not an
          // actual descendant of it — without this marker, the ancestor's
          // own "click outside closes me" listener would misfire and close
          // itself the instant you interact with this nested dropdown.
          data-floating-panel="multiselect"
          style={{ ...style, maxHeight: "calc(100vh - 8px)" }}
          className="z-50 w-56 min-h-0 flex flex-col overflow-hidden bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl transition-[opacity,transform] duration-150 ease-out"
        >
          <div className="shrink-0 p-2.5 border-b border-slate-200 dark:border-slate-700">
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              aria-label={`Search ${label} options`}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {filteredOptions.length > 0 && (
            <label className="shrink-0 flex items-center gap-3 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors duration-150">
              <input
                type="checkbox"
                ref={(el) => el && (el.indeterminate = someFilteredSelected && !allFilteredSelected)}
                checked={allFilteredSelected}
                onChange={toggleSelectAllFiltered}
                className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-2 focus:ring-blue-500"
              />
              <span>Select all{search ? ` (${filteredOptions.length})` : ""}</span>
            </label>
          )}
          <div className="min-h-0 flex-1 max-h-48 overflow-y-auto py-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
            {filteredOptions.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">No matches</p>
            ) : (
              filteredOptions.map((opt) => (
                <label key={opt} className="flex items-center gap-3 px-4 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors duration-150">
                  <input
                    type="checkbox"
                    checked={selected.includes(opt)}
                    onChange={() => toggleValue(opt)}
                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-2 focus:ring-blue-500"
                  />
                  {/* title: `truncate` clips long option labels with an
                      ellipsis — the title attribute is what actually lets a
                      user recover the full text, via the native hover
                      tooltip. */}
                  <span className="flex-1 truncate" title={opt}>{opt}</span>
                </label>
              ))
            )}
          </div>
          <div className="shrink-0 flex items-center justify-between px-3 py-2.5 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
            <button type="button" onClick={() => onChange([])} className="px-3 py-1.5 rounded-md text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-200 transition-colors duration-150">
              Clear
            </button>
            <button type="button" onClick={() => setIsOpen(false)} className="px-4 py-1.5 rounded-md text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-colors duration-150">
              Apply
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
