import React from "react";
import { FiArrowRight } from "react-icons/fi";
import StatusPill from "./StatusPill";
import HoverPillLabel from "./HoverPillLabel";
import { ELEVATION } from "../config/elevation";
import { FOCUS_RING } from "../config/focusRing";
import HighlightMatch from "./HighlightMatch";

// One metadata cell. An empty value shows "Not set" so the grid stays aligned.
function MetaCell({ field, compact }) {
  const isEmpty = !field.value;
  return (
    <span className={`flex items-center gap-1.5 text-gray-600 dark:text-gray-300 truncate ${compact ? "text-[10px]" : "text-[11px]"}`}>
      <field.icon className={`text-gray-400 dark:text-gray-500 shrink-0 ${compact ? "h-3 w-3" : "h-3.5 w-3.5"}`} />
      <span className={`truncate ${isEmpty ? "italic text-gray-400 dark:text-gray-500" : ""}`} title={field.value || undefined}>{field.value || "Not set"}</span>
    </span>
  );
}

// A note is a sentence, so it spans both columns and wraps to two lines.
function NoteCell({ field, compact }) {
  if (!field.value) return null;
  return (
    <span className={`col-span-2 flex items-start gap-1.5 text-gray-600 dark:text-gray-300 ${compact ? "text-[10px]" : "text-[11px]"}`}>
      <field.icon className={`text-gray-400 dark:text-gray-500 shrink-0 mt-0.5 ${compact ? "h-3 w-3" : "h-3.5 w-3.5"}`} />
      <span className="line-clamp-2">{field.value}</span>
    </span>
  );
}

// Split fields into groups, keeping the order they first appear. No group means one grid.
function groupMetaFields(fields) {
  const groups = [];
  const byKey = new Map();
  for (const field of fields) {
    const key = field.group || "__default";
    let group = byKey.get(key);
    if (!group) {
      group = { key, fields: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.fields.push(field);
  }
  return groups;
}

/**
 * Shared card used by trainings, certificates, and open batches.
 * The caller passes the text. This file only draws it.
 * Height grows with the content, but stays at least the minimum so short
 * cards do not look uneven. `minHeightClass` lets one page use a different
 * minimum without changing every other card. `compact` is the smaller size
 * on the manager dashboard. The ribbon and the status pill stack so neither
 * covers the other.
 */
export default function EntityCard({ banner, title, subtitle, statusPill, primaryFields = [], metaFields = [], progressBar, ctaLabel, onClick, ariaLabel, compact = false, minHeightClass = "", highlightClassName = "", cornerBadge = null, searchQuery = "", domId, isActiveMatch = false }) {
  // No onClick means a plain div, with no footer button.
  const interactive = Boolean(onClick);
  const Tag = interactive ? "button" : "div";
  return (
    // Size to this card's own content. min-w-0 keeps a long field from widening the column.
    <div className="relative min-w-0" id={domId}>
      <Tag
        type={interactive ? "button" : undefined}
        onClick={onClick}
        aria-label={ariaLabel}
        className={`group relative flex flex-col w-full border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 ${ELEVATION.card} transition-shadow duration-150 text-left overflow-hidden ${
          interactive
            ? `hover:shadow-lg hover:border-gray-200 dark:hover:border-gray-600 cursor-pointer ${FOCUS_RING}`
            : ""
        } ${compact ? "min-h-[240px] rounded-xl" : `${minHeightClass || "min-h-[350px]"} rounded-2xl`} ${
          isActiveMatch ? "ring-2 ring-indigo-400 dark:ring-indigo-500" : ""
        } ${highlightClassName}`}
      >
      {cornerBadge && (
        <span
          className={`oe-sparkle-badge absolute top-2 right-2 z-20 inline-flex items-center gap-1 h-6 pl-1.5 pr-2 rounded-full text-white shadow-md ring-2 ring-white dark:ring-gray-900 text-[10px] font-bold uppercase tracking-wide leading-none overflow-hidden ${
            // Blue for New, amber for Retry.
            cornerBadge.tone === "retry" ? "bg-gradient-to-r from-amber-500 to-orange-600" : "bg-gradient-to-r from-blue-600 to-indigo-600"
          }`}
          title={cornerBadge.title}
          aria-hidden="true"
        >
          <span className="oe-sparkle-shine" />
          <cornerBadge.icon className="relative h-3 w-3 shrink-0" />
          <span className="relative">{cornerBadge.label}</span>
        </span>
      )}
      {/* Status pill sits under the ribbon when both are shown. */}
      {statusPill && (
        <div className={`absolute right-2 z-10 ${cornerBadge ? "top-9" : "top-2"}`}>
          <StatusPill status={statusPill.status} size="corner" colorMap={statusPill.colorMap} icon={statusPill.icon} label={statusPill.label} />
        </div>
      )}
      {banner && (
        <div
          className={`relative shrink-0 flex items-center gap-3 h-16 px-5 border-l-4 ${banner.border || "border-gray-400 dark:border-gray-500"} ${
            banner.tint || "bg-gray-50 dark:bg-gray-800/60"
          } transition-colors duration-150 group-hover:brightness-95 dark:group-hover:brightness-125`}
        >
          <banner.icon className={`shrink-0 h-7 w-7 ${banner.iconColor || "text-gray-600 dark:text-gray-400"}`} aria-hidden="true" />
          <p className={`min-w-0 font-semibold text-gray-900 dark:text-white leading-tight truncate ${compact ? "text-xs" : "text-sm"}`}>{banner.label}</p>
        </div>
      )}
      <div className="relative flex-1 min-h-0 bg-gradient-to-b from-white to-gray-50/80 dark:from-gray-800 dark:to-gray-800/60">
        {banner && (
          <banner.icon
            className={`absolute z-0 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-32 w-32 pointer-events-none opacity-[0.05] dark:opacity-[0.08] ${banner.iconColor || "text-gray-600 dark:text-gray-400"}`}
            aria-hidden="true"
          />
        )}
        {/* inset-0 fills the body so the footer sits at the bottom. */}
        <div className={`absolute inset-0 z-10 flex flex-col ${compact ? "gap-3 p-2.5 pt-4" : "gap-5 p-5 pt-6"}`}>
        <div>
          <p className={`font-semibold text-gray-900 dark:text-white leading-snug line-clamp-2 ${compact ? "text-xs" : "text-sm"}`} title={title}>
            <HighlightMatch text={title} query={searchQuery} />
          </p>
          {subtitle && <p className={`text-gray-500 dark:text-gray-400 truncate ${compact ? "text-[10px] mt-0" : "text-xs mt-0.5"}`}>{subtitle}</p>}
        </div>

        {/* Leftover space is split above and below the fields. */}
        <div className={`flex-1 min-h-0 flex flex-col justify-center ${compact ? "gap-3" : "gap-4"}`}>
          {primaryFields.length > 0 && (
            <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-gray-600 dark:text-gray-300 ${compact ? "text-[10px]" : "text-[11px]"}`}>
              {primaryFields.filter((field) => field.value).map((field, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 min-w-0">
                  <field.icon className={`shrink-0 text-gray-400 dark:text-gray-500 ${compact ? "h-3 w-3" : "h-3.5 w-3.5"}`} aria-hidden="true" />
                  <span className="truncate">{field.value}</span>
                </span>
              ))}
            </div>
          )}

          {metaFields.length > 0 && (
            <div className={`flex flex-col ${compact ? "gap-2.5" : "gap-4"}`}>
              {groupMetaFields(metaFields).map((group, gi) => (
                <div
                  key={group.key}
                  className={`grid grid-cols-2 ${compact ? "gap-x-3 gap-y-1.5" : "gap-x-5 gap-y-3"} ${
                    gi > 0 ? `border-t border-gray-100 dark:border-gray-700/60 ${compact ? "pt-2" : "pt-3"}` : ""
                  }`}
                >
                  {group.fields.map((field, i) =>
                    group.key === "note" ? (
                      <NoteCell key={i} field={field} compact={compact} />
                    ) : (
                      <MetaCell key={i} field={field} compact={compact} />
                    )
                  )}
                </div>
              ))}
            </div>
          )}

          {progressBar != null && (
            <div className="h-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden" aria-hidden="true">
              <div className={`h-full rounded-full ${progressBar.colorClass || "bg-amber-500 dark:bg-amber-500"}`} style={{ width: `${progressBar.percent}%` }} />
            </div>
          )}
        </div>

        {/* Not a second button. The whole card is already the click. */}
        {interactive && (
          <div className={`mt-auto border-t border-gray-100 dark:border-gray-700/60 flex items-center justify-end ${compact ? "pt-2" : "pt-3"}`}>
            <HoverPillLabel
              roundedClassName="rounded-md"
              className={`shrink-0 gap-1 font-medium text-gray-600 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 ${
                compact ? "text-[11px]" : "text-[13px]"
              }`}
            >
              {ctaLabel}
              <FiArrowRight className={`transition-transform duration-150 group-hover:translate-x-0.5 ${compact ? "h-3 w-3" : "h-3.5 w-3.5"}`} aria-hidden="true" />
            </HoverPillLabel>
          </div>
        )}
        </div>
      </div>
      </Tag>
    </div>
  );
}
