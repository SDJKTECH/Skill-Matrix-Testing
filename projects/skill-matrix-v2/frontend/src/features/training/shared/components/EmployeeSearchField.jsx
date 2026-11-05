import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { FiPlus, FiSearch, FiX } from "react-icons/fi";
import { suggestEmployees } from "../../../../helper/addTrainingV2Api";

/**
 * Employee search box with a dropdown of matches. Used for the main
 * "Search employee" box, the Nominated By box in each row and the
 * missing-manager prompt in My Trainings.
 * With `value`, it keeps the chosen employee (Nominated By). Without it, it
 * clears after each pick (main search, where a pick adds a new row).
 * `getBadge(emp)` can mark matches as already taken ("Enrolled", "Added").
 */
export default function EmployeeSearchField({
  value = null,
  onSelect,
  getBadge,
  placeholder = "Search employee by name, ID, or email…",
  ariaLabel = "Search employee by ID, name, or email",
  compact = false,
  autoFocus = false,
  className = "",
  // nominated_by names already used in this batch (no server call). Only the
  // Nominated By box passes these.
  extraOptions = [],
  // The pinned "Self nomination" option. Text that matches no real employee
  // is never saved.
  selfNominationOption = null,
}) {
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [focused, setFocused] = useState(false);
  const searchTimer = useRef(null);
  const wrapperRef = useRef(null); // used to detect clicks outside
  // The dropdown is drawn outside this box (a portal), so it shows above the
  // panel's buttons instead of being hidden behind them.
  const panelRef = useRef(null);
  const [panelStyle, setPanelStyle] = useState({ position: "fixed", top: -9999, left: -9999, visibility: "hidden" });
  const trimmedSearch = search.trim();
  // Matches from this batch's history show at once on focus (no 3-letter wait).
  // The exact current value and "Self nomination" (it has its own option) are
  // left out.
  const localMatches = (trimmedSearch
    ? extraOptions.filter((n) => n.toLowerCase().includes(trimmedSearch.toLowerCase()) && n.toLowerCase() !== trimmedSearch.toLowerCase())
    : extraOptions
  ).filter((n) => n.toLowerCase() !== "self nomination");
  const showLocalMatches = focused && localMatches.length > 0;
  // The "Self nomination" option is shown first, when the box is empty or the
  // text looks like "self".
  const showSelfNomination = focused && Boolean(selfNominationOption)
    && (!trimmedSearch || "self nomination".includes(trimmedSearch.toLowerCase()));
  // When a search finds nobody, tell the user the typed text will not be saved.
  const showNoMatchHint = trimmedSearch.length >= 3 && !searching
    && options.length === 0 && !showLocalMatches && !showSelfNomination;
  const isOpen = options.length > 0 || searching || showLocalMatches || showSelfNomination || showNoMatchHint;

  // Place the dropdown right under the input. PANEL_MAX_HEIGHT matches the
  // dropdown's max height (max-h-56), so it always fits on the screen.
  useLayoutEffect(() => {
    if (!isOpen || !wrapperRef.current) return;
    const PANEL_MAX_HEIGHT = 224;
    const margin = 4;
    const recompute = () => {
      if (!wrapperRef.current) return;
      const triggerRect = wrapperRef.current.getBoundingClientRect();
      const width = compact ? 224 : triggerRect.width;
      const left = Math.max(margin, Math.min(triggerRect.left, window.innerWidth - width - margin));
      const top = Math.max(margin, Math.min(triggerRect.bottom + margin, window.innerHeight - PANEL_MAX_HEIGHT - margin));
      setPanelStyle({ position: "fixed", top, left, width, visibility: "visible" });
    };
    recompute();
    // Move the dropdown with the input when the page scrolls or the window
    // is resized.
    window.addEventListener("resize", recompute);
    window.addEventListener("scroll", recompute, true);
    return () => {
      window.removeEventListener("resize", recompute);
      window.removeEventListener("scroll", recompute, true);
    };
    // Use .length, not the arrays: a new array on every render would make this
    // run forever.
  }, [isOpen, compact, localMatches.length, options.length, searching, showSelfNomination, showNoMatchHint]);

  // Close the dropdown when the user clicks outside it (the input or the
  // dropdown itself count as inside).
  useEffect(() => {
    if (!isOpen) return;
    const onDocMouseDown = (e) => {
      if (wrapperRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
      clearTimeout(searchTimer.current); // stop a waiting search from opening it again
      setOptions([]);
      setSearching(false);
      setFocused(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [isOpen]);

  const handleSearch = (v) => {
    setSearch(v);
    setFocused(true);
    clearTimeout(searchTimer.current);
    if (v.trim().length < 3) { setOptions([]); setSearching(false); return; }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        setOptions((await suggestEmployees(v.trim())) || []);
      } catch {
        setOptions([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  };

  const pick = (emp) => {
    onSelect(emp);
    setSearch("");
    setOptions([]);
  };

  if (value) {
    return (
      <div
        className={`flex items-center gap-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 ${compact ? "w-full max-w-[11rem] px-2 py-1 text-xs" : "px-2 py-1.5 text-xs"} ${className}`}
      >
        {/* displayName is only for showing (e.g. "Self nomination"); the real
            name/emp_id is what gets saved. */}
        <span className="min-w-0 truncate" title={value.displayName || value.name || value.emp_id}>
          <span className="font-medium">{value.displayName || value.name || value.emp_id}</span>
        </span>
        <button
          type="button"
          onClick={() => onSelect(null)}
          aria-label="Clear selection"
          className="ml-auto shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          <FiX className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    // Same width as the input, so the clear (✕) button stays inside the box.
    <div className={`relative ${compact ? "w-full max-w-[11rem]" : "w-full"} ${className}`} ref={wrapperRef}>
      <FiSearch className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-blue-500 ${compact ? "left-2 h-3 w-3" : "left-2.5 h-3.5 w-3.5"}`} />
      <input
        type="text"
        autoFocus={autoFocus}
        value={search}
        onChange={(e) => handleSearch(e.target.value)}
        onFocus={() => setFocused(true)}
        onKeyDown={(e) => {
          // The first Escape closes only the dropdown; a second Escape closes the panel.
          if (e.key === "Escape" && isOpen) {
            e.stopPropagation();
            clearTimeout(searchTimer.current);
            setOptions([]);
            setSearching(false);
            // Clear the text too, or the "No match" hint opens the dropdown again.
            setSearch("");
            setFocused(false);
          }
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={
          compact
            ? "w-full max-w-[11rem] pl-6 pr-5 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:border-blue-400"
            : "w-full pl-8 pr-7 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:border-blue-400"
        }
      />
      {search && (
        <button
          type="button"
          onClick={() => { setSearch(""); setOptions([]); }}
          aria-label="Clear search"
          className={`absolute top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 ${compact ? "right-1.5" : "right-2"}`}
        >
          <FiX className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
        </button>
      )}
      {isOpen && createPortal(
        <div
          ref={panelRef}
          style={panelStyle}
          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg max-h-56 overflow-y-auto z-50"
        >
          {/* Pinned "Self nomination" option. It picks the logged-in user's own record. */}
          {showSelfNomination && (
            <button
              type="button"
              onClick={() => pick(selfNominationOption)}
              className="w-full text-left px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 border-b border-gray-100 dark:border-gray-800 hover:bg-blue-50 dark:hover:bg-gray-900/40"
            >
              {selfNominationOption.displayName}
            </button>
          )}
          {/* Matches from this batch's history, shown above the server results. */}
          {showLocalMatches && (
            <>
              {localMatches.map((n) => (
                <button
                  key={`local-${n}`}
                  type="button"
                  onClick={() => pick({ id: null, name: n, emp_id: null })}
                  className="w-full text-left px-3 py-1.5 text-xs border-b last:border-b-0 border-gray-100 dark:border-gray-800 hover:bg-blue-50 dark:hover:bg-gray-800"
                >
                  {n}
                </button>
              ))}
            </>
          )}
          {searching ? (
            <div className="px-3 py-1.5 text-xs text-gray-400 dark:text-gray-500">Searching…</div>
          ) : (
            <>
              {options.map((emp) => {
                const badge = getBadge?.(emp);
                return (
                  <button
                    key={emp.id}
                    type="button"
                    onClick={() => { if (badge) return; pick(emp); }}
                    disabled={Boolean(badge)}
                    className="w-full flex items-center justify-between gap-2 text-left px-3 py-1.5 text-xs border-b last:border-b-0 border-gray-100 dark:border-gray-800 hover:bg-blue-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{emp.emp_id}</span>
                      {emp.name && <span className="ml-1.5 text-gray-600 dark:text-gray-400">{emp.name}</span>}
                      {emp.department && <span className="ml-1.5 text-gray-400 dark:text-gray-500">· {emp.department}</span>}
                    </span>
                    {badge ? (
                      <span className={badge.className}>{badge.label}</span>
                    ) : (
                      <FiPlus className="shrink-0 h-3 w-3 text-blue-500" />
                    )}
                  </button>
                );
              })}
              {/* Typed text that matches nobody cannot be saved; say so. */}
              {showNoMatchHint && (
                <p className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                  No match — select an employee{selfNominationOption && " or Self nomination"}.
                </p>
              )}
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
