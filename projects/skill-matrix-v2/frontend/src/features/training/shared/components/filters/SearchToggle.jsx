import React, { useRef } from "react";
import { FiSearch, FiX } from "react-icons/fi";
import IconRevealTrigger, { ICON_REVEAL_FOCUS } from "./IconRevealTrigger";

// Two sizes: "md" (normal) for the top of the page, "compact" for table headers.
const SIZE_STYLES = {
  md: {
    wrapperOpen: "w-[min(260px,70vw)]",
    wrapperClosed: "w-9",
    height: "h-9",
    input: "pl-8 pr-7 text-xs rounded-full",
    icon: "left-2.5 h-3.5 w-3.5",
    clear: "right-2",
    triggerSize: "md",
    triggerRounded: "full",
  },
  compact: {
    wrapperOpen: "w-[min(160px,70vw)]",
    wrapperClosed: "w-6",
    height: "h-6",
    input: "pl-6 pr-5 text-[11px] rounded min-w-[130px]",
    icon: "left-1.5 h-3 w-3",
    clear: "right-1",
    triggerSize: "sm",
    triggerRounded: "md",
  },
};

/**
 * Search box that shows only a search icon at first. Click the icon to open
 * a text box. If the box is empty and you click somewhere else, it closes.
 *
 * Props: { value, onChange, open, onOpenChange, placeholder, ariaLabel, size? }
 * `size`: "md" (default, page toolbar) | "compact" (table header cell).
 */
export default function SearchToggle({
  value,
  onChange,
  open,
  onOpenChange,
  placeholder = "Search...",
  ariaLabel = "Search",
  size = "md",
}) {
  const inputRef = useRef(null);
  const hasQuery = Boolean(String(value || "").trim());
  const s = SIZE_STYLES[size] || SIZE_STYLES.md;

  return (
    <div
      className={`relative shrink-0 ${s.height} transition-all duration-200 ease-out motion-reduce:transition-none ${
        open ? s.wrapperOpen : s.wrapperClosed
      }`}
    >
      {open ? (
        <>
          <FiSearch className={`absolute top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none ${s.icon}`} />
          <input
            ref={inputRef}
            autoFocus
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onBlur={() => {
              if (!String(value || "").trim()) onOpenChange(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                if (String(value || "").trim()) onChange("");
                else {
                  onOpenChange(false);
                }
              }
            }}
            placeholder={placeholder}
            aria-label={ariaLabel}
            className={`w-full ${s.height} ${s.input} bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 transition-shadow ${ICON_REVEAL_FOCUS}`}
          />
          {hasQuery && (
            <button
              type="button"
              onClick={() => onChange("")}
              aria-label="Clear search"
              className={`absolute top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 ${s.clear}`}
            >
              <FiX className={size === "compact" ? "h-3 w-3" : "h-3.5 w-3.5"} />
            </button>
          )}
        </>
      ) : (
        <IconRevealTrigger
          open={false}
          active={hasQuery}
          indicator={hasQuery}
          icon={FiSearch}
          size={s.triggerSize}
          rounded={s.triggerRounded}
          aria-label={`Open ${ariaLabel.toLowerCase()}`}
          aria-expanded={false}
          title={ariaLabel}
          className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
          onClick={() => onOpenChange(true)}
        />
      )}
    </div>
  );
}
