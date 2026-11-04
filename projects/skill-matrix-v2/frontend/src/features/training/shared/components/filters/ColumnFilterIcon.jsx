import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiFilter } from "react-icons/fi";
import usePortalPosition from "../../../../../hooks/usePortalPosition";
import IconRevealTrigger, { ICON_REVEAL_FOCUS } from "./IconRevealTrigger";

function normalizeOptions(options) {
  return (options || []).map((option) => {
    if (option != null && typeof option === "object") {
      return {
        value: String(option.value),
        label: option.label != null ? String(option.label) : String(option.value),
      };
    }
    return { value: String(option), label: String(option) };
  });
}

/**
 * Filter icon for a table column. Click it to see a list of options.
 * The parent gives the options, the chosen value and the mode:
 *   - mode="single": choose one option (value is text or null). The list closes.
 *   - mode="multiple": choose many (value is a list). The list stays open
 *     until you press Done or Escape, or click outside.
 */
export default function ColumnFilterIcon({
  mode = "single",
  options = [],
  value = mode === "multiple" ? [] : null,
  onChange,
  label = "Filter",
  searchable = true,
  clearLabel = "Clear",
  doneLabel = "Done",
  className = "",
  /** Show the filter as "on" even when `value` is empty (e.g. the page set it). */
  active: activeOverride,
  /** Number shown on the icon. If not given, it is counted from `value`. */
  count: countOverride,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const panelId = useId();
  const normalized = useMemo(() => normalizeOptions(options), [options]);
  const style = usePortalPosition({
    anchorRef: triggerRef,
    panelRef,
    open,
    deps: [search, value, normalized.length],
    margin: 4,
    align: "left",
  });

  const isMultiple = mode === "multiple";
  const selectedSet = useMemo(() => {
    if (!isMultiple) return new Set(value != null && value !== "" ? [String(value)] : []);
    return new Set((value || []).map(String));
  }, [isMultiple, value]);

  const derivedCount = isMultiple
    ? selectedSet.size
    : value != null && value !== ""
      ? 1
      : 0;
  const appliedCount = typeof countOverride === "number" ? countOverride : derivedCount;
  const active = activeOverride != null ? Boolean(activeOverride) : appliedCount > 0;

  useEffect(() => {
    if (!open) return undefined;
    const onDocMouseDown = (event) => {
      if (triggerRef.current?.contains(event.target) || panelRef.current?.contains(event.target)) return;
      setOpen(false);
      setSearch("");
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        setSearch("");
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const filteredOptions = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return normalized;
    return normalized.filter(
      (option) =>
        option.label.toLowerCase().includes(needle) || option.value.toLowerCase().includes(needle)
    );
  }, [normalized, search]);

  const allFilteredSelected =
    isMultiple &&
    filteredOptions.length > 0 &&
    filteredOptions.every((option) => selectedSet.has(option.value));
  const someFilteredSelected =
    isMultiple && filteredOptions.some((option) => selectedSet.has(option.value));

  const close = () => {
    setOpen(false);
    setSearch("");
  };

  const toggleOpen = () => setOpen((prev) => !prev);

  const handleTriggerKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleOpen();
    }
  };

  const selectSingle = (nextValue) => {
    const current = value != null && value !== "" ? String(value) : null;
    onChange?.(current === String(nextValue) ? null : String(nextValue));
    close();
  };

  const toggleMultiple = (optionValue) => {
    const key = String(optionValue);
    const current = Array.isArray(value) ? value.map(String) : [];
    const next = current.includes(key) ? current.filter((item) => item !== key) : [...current, key];
    onChange?.(next);
  };

  const toggleSelectAllFiltered = () => {
    const current = Array.isArray(value) ? value.map(String) : [];
    const filteredValues = filteredOptions.map((option) => option.value);
    onChange?.(
      allFilteredSelected
        ? current.filter((item) => !filteredValues.includes(item))
        : Array.from(new Set([...current, ...filteredValues]))
    );
  };

  const clear = () => {
    onChange?.(isMultiple ? [] : null);
    if (!isMultiple) close();
  };

  return (
    <div className={`relative inline-flex ${className}`}>
      <IconRevealTrigger
        buttonRef={triggerRef}
        open={open}
        active={active}
        count={appliedCount}
        icon={FiFilter}
        aria-label={`Filter by ${label}${appliedCount > 0 ? `, ${appliedCount} selected` : ""}`}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="listbox"
        title={
          appliedCount > 0
            ? isMultiple
              ? `${appliedCount} selected`
              : `Filtered: ${value ?? `${appliedCount} selected`}`
            : `Filter by ${label}`
        }
        onClick={(event) => {
          event.stopPropagation();
          toggleOpen();
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          handleTriggerKeyDown(event);
        }}
      />

      {open
        ? createPortal(
            <div
              ref={panelRef}
              id={panelId}
              role="listbox"
              aria-label={`${label} filter options`}
              aria-multiselectable={isMultiple || undefined}
              data-floating-panel="column-filter"
              style={{ ...style, maxHeight: "calc(100vh - 8px)" }}
              className="z-50 w-56 min-h-0 flex flex-col overflow-hidden bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl origin-top transition-[opacity,transform] duration-150 ease-out"
            >
              {searchable ? (
                <div className="shrink-0 p-2.5 border-b border-gray-200 dark:border-gray-700">
                  <input
                    type="text"
                    autoFocus
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search..."
                    aria-label={`Search ${label} options`}
                    className={`w-full px-2.5 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 ${ICON_REVEAL_FOCUS}`}
                  />
                </div>
              ) : null}

              {isMultiple && filteredOptions.length > 0 ? (
                <label className="shrink-0 flex items-center gap-3 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors duration-150">
                  <input
                    type="checkbox"
                    ref={(el) => {
                      if (el) el.indeterminate = someFilteredSelected && !allFilteredSelected;
                    }}
                    checked={allFilteredSelected}
                    onChange={toggleSelectAllFiltered}
                    className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-2 focus:ring-blue-500"
                  />
                  <span>Select all{search.trim() ? ` (${filteredOptions.length})` : ""}</span>
                </label>
              ) : null}

              <div className="min-h-0 flex-1 max-h-48 overflow-y-auto py-1">
                {filteredOptions.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">No matches</p>
                ) : (
                  filteredOptions.map((option) => {
                    const selected = selectedSet.has(option.value);
                    if (isMultiple) {
                      return (
                        <label
                          key={option.value}
                          className="flex items-center gap-3 px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors duration-150"
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleMultiple(option.value)}
                            className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-2 focus:ring-blue-500"
                          />
                          <span className="flex-1 truncate" title={option.label}>
                            {option.label}
                          </span>
                        </label>
                      );
                    }
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => selectSingle(option.value)}
                        className={`w-full text-left px-3 py-2 text-xs transition-colors duration-150 ${ICON_REVEAL_FOCUS} ${
                          selected
                            ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 font-medium"
                            : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                        }`}
                      >
                        <span className="block truncate" title={option.label}>
                          {option.label}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>

              <div className="shrink-0 flex items-center justify-between gap-2 px-2.5 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80">
                <button
                  type="button"
                  onClick={clear}
                  disabled={appliedCount === 0}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150 ${ICON_REVEAL_FOCUS}`}
                >
                  {clearLabel}
                </button>
                {isMultiple ? (
                  <button
                    type="button"
                    onClick={close}
                    className={`px-3 py-1 rounded-md text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-colors duration-150 ${ICON_REVEAL_FOCUS}`}
                  >
                    {doneLabel}
                  </button>
                ) : null}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
