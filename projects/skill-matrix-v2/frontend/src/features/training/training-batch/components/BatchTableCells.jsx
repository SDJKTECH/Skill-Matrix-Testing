import { FiInfo } from "react-icons/fi";
import { ENROLLMENT_STATUS_COLORS, groupEnrollmentStatusCounts } from "../services/trainingUtils";
import { BATCH_STATUS_COLORS } from "../../shared/config/batchStatusColors";
import linkifyText from "../services/linkifyText";
import HighlightMatch from "../../shared/components/HighlightMatch";
import InfoPopover from "../../shared/components/InfoPopover";

// InfoPopover now lives in shared/components; re-exported so old imports work.
export { InfoPopover };

// eslint-disable-next-line react-refresh/only-export-components
export function formatDateTime(d) {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date)) return d;
  return date.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Gray color for a batch status that has no color set.
const STATUS_BADGE_FALLBACK_CLASS = "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300";
export function StatusBadge({ status }) {
  if (!status) return <span className="text-gray-400"></span>;
  // The label is the real status text from the server. String() is used so a
  // non-text value does not crash the page; it just gets the gray color.
  const colorClass = BATCH_STATUS_COLORS[String(status).toLowerCase()] || STATUS_BADGE_FALLBACK_CLASS;
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
      {status}
    </span>
  );
}

// Gray color for a training status that has no color set (same as in
// EnrollmentTable.jsx).
const ENROLLMENT_STATUS_FALLBACK_CLASS = "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300";

// Small colored chips with the count of enrollments for each status. Used in
// the Enrollments header and the row's info popup, so both show the same
// numbers. Statuses listed in NOT_COMPLETED_STATUSES are added up into one
// "Not Completed" chip; every other status gets its own chip.
export function EnrollmentStatusChips({ counts }) {
  const { notCompletedCount, rest } = groupEnrollmentStatusCounts(counts);
  const pillEntries = [
    ["Completed", rest["Completed"] || 0],
    ["In Progress", rest["In Progress"] || 0],
    ["Not Completed", notCompletedCount],
    ...Object.entries(rest).filter(([label]) => label !== "Completed" && label !== "In Progress"),
  ].filter(([, count]) => count > 0);

  if (pillEntries.length === 0) return null;

  return (
    <span className="flex items-center gap-1 flex-wrap">
      {pillEntries.map(([label, count]) => (
        <span key={label} className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium ${ENROLLMENT_STATUS_COLORS[label.toLowerCase()] || ENROLLMENT_STATUS_FALLBACK_CLASS}`}>
          {label}: {count}
        </span>
      ))}
    </span>
  );
}

// Table cell for long text (Description, Status Remark). If the text is cut
// off, hovering or clicking shows the full text in a popup. Hover does not
// work on touch screens, so click works too.
export function TruncatableCell({ cellKey, text, className, isTruncated, isOpen, onToggle, onOpen, onClose, textCellRefs, textTriggerRefs, searchQuery = "" }) {
  return (
    <div
      className="flex items-center gap-1 min-w-0"
      onMouseEnter={isTruncated ? onOpen : undefined}
      onMouseLeave={isTruncated ? onClose : undefined}
    >
      <div
        ref={(el) => {
          if (el) textCellRefs.current.set(cellKey, el);
          else textCellRefs.current.delete(cellKey);
        }}
        className={`min-w-0 truncate cursor-help ${className}`}
        title={text || undefined}
      >
        {searchQuery ? <HighlightMatch text={text} query={searchQuery} /> : text}
      </div>
      {isTruncated && (
        <button
          ref={(el) => {
            if (el) textTriggerRefs.current.set(cellKey, el);
            else textTriggerRefs.current.delete(cellKey);
          }}
          type="button"
          data-textpopover-trigger
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className="shrink-0 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          title="View full text"
          aria-label="View full text"
        >
          <FiInfo className="h-3 w-3" />
        </button>
      )}
      {isOpen && (
        <InfoPopover triggerEl={textTriggerRefs.current.get(cellKey)}>
          <div data-textpopover-panel className="max-w-[240px] text-[11px] text-gray-700 dark:text-gray-200 whitespace-pre-wrap break-words">
            {linkifyText(text)}
          </div>
        </InfoPopover>
      )}
    </div>
  );
}
