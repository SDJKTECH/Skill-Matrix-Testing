import React, { useState, useEffect, useRef } from "react";
import { FiChevronDown } from "react-icons/fi";

/**
 * Reusable searchable dropdown with optional "Add as new" for values not in the list.
 * Used by Admin Console Skill, Certificates, and Training tabs.
 */
function SkillFilterDropdown({ label, options, value, onChange, placeholder, emptyMessage }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef(null);

  const safeOptions = Array.isArray(options) ? options : [];
  const normalizedOptions = safeOptions.map((o) => (typeof o === "string" ? o : o?.name || "")).filter(Boolean);
  // Keep only unique values (case-insensitive) so the same option is not shown twice
  const uniqueOptions = normalizedOptions.filter(
    (opt, i, arr) => arr.findIndex((o) => (o || "").toLowerCase() === (opt || "").toLowerCase()) === i
  );
  const searchLower = search.trim().toLowerCase();
  const filtered = searchLower
    ? uniqueOptions.filter((opt) => opt.toLowerCase().includes(searchLower))
    : uniqueOptions;
  const showAddNew = search.trim() && !uniqueOptions.some((opt) => opt.toLowerCase() === searchLower);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectValue = (val) => {
    onChange(val);
    setSearch("");
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      <div className="w-full flex items-center gap-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex-1 flex items-center justify-between gap-2 px-3 py-2 text-gray-900 dark:text-gray-100 text-left text-sm min-w-0"
        >
          <span className={value ? "truncate" : "text-gray-500 dark:text-gray-400 truncate"}>
            {value || placeholder}
          </span>
          {/* Matches the FiChevronDown house style used by every LiveSelect-
              backed dropdown elsewhere (e.g. the Status dropdown right next to
              this one) — was a plain "▼" text glyph, a different weight/style. */}
          <FiChevronDown className="shrink-0 text-gray-400 h-3 w-3" />
        </button>
        {value && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(""); }}
            title="Clear selection"
            className="shrink-0 px-2 py-2 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            ×
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg max-h-60 overflow-hidden">
          <div className="p-2 border-b border-gray-200 dark:border-gray-600 sticky top-0 bg-white dark:bg-gray-800">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
              autoFocus
            />
          </div>
          <div className="overflow-y-auto max-h-48 py-1">
            {filtered.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => selectValue(opt)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                  value === opt ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" : ""
                }`}
              >
                {opt}
              </button>
            ))}
            {showAddNew && (
              <button
                type="button"
                onClick={() => selectValue(search.trim())}
                className="w-full text-left px-3 py-2 text-sm text-green-600 dark:text-green-400 hover:bg-gray-100 dark:hover:bg-gray-700 font-medium"
              >
                + Add &quot;{search.trim()}&quot; as new
              </button>
            )}
            {filtered.length === 0 && !showAddNew && (
              <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                {emptyMessage || "No options. Type above to add a new one."}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default SkillFilterDropdown;
