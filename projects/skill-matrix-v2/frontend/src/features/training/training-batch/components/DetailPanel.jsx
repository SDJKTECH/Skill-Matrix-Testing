import React, { useEffect, useRef } from "react";
import { FiX } from "react-icons/fi";
import CopyButton from "../../shared/components/CopyButton";

/* ── Generic read-only "More details" panel ──────────────────────────────────
   Read-only "More details" panel. It shows `data` using a list of `sections`
   ([{ key, title, fields }]); each field is { key, label, format?, render? }.
   To show a new field, add it to the sections list (e.g.
   ENROLLMENT_DETAIL_SECTIONS); nothing changes here.
   If `onClose` is not given, there is no ✕ button and Escape does nothing;
   the button that opened the panel closes it. */
export default function DetailPanel({ id, title, sections, data, onClose }) {
  const panelRef = useRef(null);

  // If the panel has a close button (onClose), move keyboard focus into it
  // when it opens. The caller moves focus back when it closes.
  useEffect(() => {
    if (onClose) panelRef.current?.focus();
  }, [onClose]);

  const renderValue = (field) => {
    const raw = data?.[field.key];
    // Check for null/undefined/"" only, because 0 is a real value (e.g. a count).
    // An empty value shows nothing.
    if (raw === null || raw === undefined || raw === "") {
      return null;
    }
    if (field.render) return field.render(raw, data);
    const display = field.format ? field.format(raw) : String(raw);
    return (
      <span className="flex items-center gap-1">
        <span className="min-w-0 truncate text-gray-900 dark:text-gray-100" title={display}>
          {display}
        </span>
        <CopyButton text={display} label={`Copy ${field.label}`} />
      </span>
    );
  };

  return (
    <div
      id={id}
      ref={panelRef}
      tabIndex={-1}
      role="region"
      aria-label={title}
      onKeyDown={(e) => {
        if (onClose && e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
      className="px-4 pt-3 pb-4 focus:outline-none"
    >
      {/* No title on screen: the button that opened this panel already shows it.
          `title` is still used as the label for screen readers. */}
      {onClose && (
        <div className="flex items-center justify-end mb-1">
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <FiX className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="space-y-2">
        {sections.map((section) => (
          <div key={section.key}>
            <div className="py-1 text-[10px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
              {section.title}
            </div>
            {/* Each label/value pair takes only the space it needs, and the pairs are
                spread across the row. */}
            <dl className="flex flex-wrap justify-between gap-x-6 gap-y-2 pb-2 border-b border-gray-100 dark:border-gray-800">
              {section.fields.map((field) => (
                <div key={field.key} className="group flex items-center gap-2 py-0.5">
                  <dt className="shrink-0 text-xs font-medium text-gray-600 dark:text-gray-300">
                    {field.label}:
                  </dt>
                  <dd className="max-w-[280px] text-xs">{renderValue(field)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}
