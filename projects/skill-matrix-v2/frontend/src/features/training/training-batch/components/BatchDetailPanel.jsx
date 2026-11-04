// The detail panel that opens under a batch row: Batch Details, Enrollments
// and Notes sections. Used only by BatchRow.jsx.
import React, { useEffect, useRef, useState } from "react";
import { FiChevronRight, FiEdit2, FiPlus } from "react-icons/fi";
import {
  formatDate,
  countEnrollmentStatuses,
  SCROLL_INTO_VIEW_DELAY,
} from "../services/trainingUtils";
import { formatDateTime, EnrollmentStatusChips } from "./BatchTableCells";
import Collapse from "../../shared/components/Collapse";
import linkifyText from "../services/linkifyText";
import {
  useBatchPermissions,
  BATCH_ACTIONS,
} from "../services/batchPermissions";
import { isNestedOnlySearchMatch } from "../services/batchSearch";
import ErrorBoundary from "./ErrorBoundary";
import BatchEnrollmentPanel from "./EnrollmentTable";
import BatchNotesPanel from "./BatchNotesPanel";
import { useVisibleEnrollments } from "../services/enrollmentVisibility";

/* ── Schema for the inline "Overview" tab ────────────────────────────────────
   The fields shown in the Batch Details section. To show a new field, add
   one entry here and it appears on screen. Batch number, area, sub-area and
   module identify the batch, so they cannot be edited.
   Note: the Create/Edit form (InlineCreatePanel.jsx) has its own field list,
   so a new field must be added there too. ── */
const OVERVIEW_FIELDS = [
  // Main fields: always shown. Batch number, area, sub-area and module cannot
  // be edited; the others can.
  { key: "batch_num", label: "Batch Number" },
  { key: "batch_desc", label: "Description", editable: true, type: "textarea" },
  { key: "area_name", label: "Area" },
  { key: "sub_area_name", label: "Sub Area" },
  { key: "module_name", label: "Module" },
  // training_quarter is saved in the database and can be edited in Create/Edit.
  {
    key: "training_quarter",
    label: "Training Quarter",
    editable: true,
    type: "month",
  },
  {
    key: "training_mode",
    label: "Training Mode",
    editable: true,
    type: "select",
  },
  {
    key: "batch_status",
    label: "Batch Status",
    editable: true,
    type: "select",
  },
  {
    key: "start_date",
    label: "Start Date",
    editable: true,
    type: "date",
    format: formatDate,
  },
  {
    key: "end_date",
    label: "End Date",
    editable: true,
    type: "date",
    format: formatDate,
  },
  // Batch Size is the last field of the main grid (next to End Date).
  { key: "batch_size", label: "Batch Size", editable: true, type: "number" },
  // Extra fields: hidden until the user clicks "Show Additional Details".
  // Shown in a small 2x2 grid because the values are short.
  {
    key: "trainer",
    label: "Trainer",
    editable: true,
    type: "text",
    secondary: true,
  },
  {
    key: "duration",
    label: "Duration",
    editable: true,
    type: "text",
    secondary: true,
  },
  {
    key: "created_at",
    label: "Created On",
    format: formatDateTime,
    secondary: true,
  },
  {
    key: "updated_at",
    label: "Last Updated",
    format: formatDateTime,
    secondary: true,
  },
  // Long text fields: `full: true` shows each one in its own full-width box,
  // not in a small label/value row.
  {
    key: "prerequisite",
    label: "Prerequisites",
    editable: true,
    type: "textarea",
    secondary: true,
    contentGroup: true,
    full: true,
  },
  {
    key: "batch_status_remarks",
    label: "Status Remark",
    editable: true,
    type: "textarea",
    secondary: true,
    contentGroup: true,
    full: true,
  },
  {
    key: "content",
    label: "Content",
    editable: true,
    type: "textarea",
    secondary: true,
    contentGroup: true,
    full: true,
  },
  {
    key: "resources",
    label: "Resources",
    editable: true,
    type: "textarea",
    secondary: true,
    contentGroup: true,
    full: true,
  },
];
const PRIMARY_FIELDS = OVERVIEW_FIELDS.filter((f) => !f.secondary);
const SECONDARY_FIELDS = OVERVIEW_FIELDS.filter((f) => f.secondary);
/* ── Batch Details section: schema-driven key-value grid with inline view / edit / add ── */
function BatchDetailsSection({ batch, isExpanded, onEdit }) {
  const [open, setOpen] = useState(false); // section is closed at first
  const [moreOpen, setMoreOpen] = useState(false); // is "Show Additional Details" open
  const { can } = useBatchPermissions();
  const canEditBatch = can(BATCH_ACTIONS.EDIT_BATCH);

  // The row stays on the page after it is closed, so close this section too.
  // Otherwise it would still be open the next time the batch is opened.
  useEffect(() => {
    if (!isExpanded) {
      setOpen(false);
      setMoreOpen(false);
    }
  }, [isExpanded]);

  const renderValue = (field) => {
    // Only shows values. Editing is done in the Edit Training Batch form.
    const raw = batch[field.key];
    if (raw === null || raw === undefined || raw === "") {
      return null;
    }
    if (field.render) return field.render(raw);
    const display = field.format ? field.format(raw) : raw;
    // Long text wraps onto many lines; short values stay on one line.
    if (field.type === "textarea") {
      const wrapped = (
        <span className="block whitespace-pre-wrap break-words text-gray-800 dark:text-gray-100">
          {linkifyText(display)}
        </span>
      );
      // Full-width fields (like Prerequisites, Content, Resources) get a light box,
      // so they look like a block of text.
      return field.full ? (
        <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/40 px-2.5 py-2">
          {wrapped}
        </div>
      ) : (
        wrapped
      );
    }
    return (
      <span
        className="block truncate text-gray-800 dark:text-gray-100"
        title={typeof display === "string" ? display : undefined}
      >
        {display}
      </span>
    );
  };

  // Full-width fields show the label above the value. Other fields show the
  // label on the left and the value on the right.
  const renderRow = (field) =>
    field.full ? (
      <div
        key={field.key}
        className="sm:col-span-2 py-1.5 border-b border-gray-100 dark:border-gray-800"
      >
        <dt className="mb-0.5 text-xs font-medium text-gray-600 dark:text-gray-300">
          {field.label}
        </dt>
        <dd className="min-w-0 text-xs">{renderValue(field)}</dd>
      </div>
    ) : (
      <div
        key={field.key}
        className="flex items-center gap-3 py-1.5 border-b border-gray-100 dark:border-gray-800 min-h-[34px]"
      >
        <dt className="w-28 shrink-0 text-xs font-medium text-gray-600 dark:text-gray-300">
          {field.label}
        </dt>
        <dd className="flex-1 min-w-0 text-xs">{renderValue(field)}</dd>
      </div>
    );

  return (
    <div>
      {/* Click the header to open or close the section. The Edit button opens the
          Edit Training Batch form (stopPropagation stops it from also closing). */}
      <div
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        className="group flex items-center justify-between gap-2 -mx-1.5 px-1.5 py-1 rounded-md cursor-pointer hover:bg-blue-50/70 dark:hover:bg-blue-900/10 transition-colors"
      >
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
          <FiChevronRight
            className={`h-3 w-3 transition-transform duration-150 ${open ? "rotate-90 text-blue-500 dark:text-blue-400" : ""}`}
          />
          Batch Details
        </span>
        {open && canEditBatch && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30"
            aria-label="Edit batch details"
          >
            <FiEdit2 className="h-3 w-3" /> Edit
          </button>
        )}
      </div>

      <Collapse open={open}>
        <div>
          {/* Main fields, always shown. */}
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-0 mt-1.5">
            {PRIMARY_FIELDS.map(renderRow)}
          </dl>

          {/* Extra fields, shown after "Show Additional Details" is clicked: a small
              grid of short values, then the long text fields. The button sits below
              them, so it moves down when they open. */}
          <Collapse open={moreOpen}>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-0">
              {SECONDARY_FIELDS.filter((f) => !f.contentGroup).map(renderRow)}
            </dl>
            <dl className="grid grid-cols-1 gap-y-2 mt-2">
              {SECONDARY_FIELDS.filter((f) => f.contentGroup).map(renderRow)}
            </dl>
          </Collapse>
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            className="w-full flex items-center gap-1.5 py-1.5 min-h-[34px] border-b border-gray-100 dark:border-gray-800 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50/40 dark:hover:bg-blue-900/10 transition-colors"
          >
            <FiChevronRight
              className={`h-3 w-3 transition-transform duration-150 ${moreOpen ? "rotate-90" : ""}`}
            />
            {moreOpen ? "View Less" : "Show Additional Details"}
          </button>
        </div>
      </Collapse>
    </div>
  );
}

/* ── Inline detail panel: two collapsible sections, both closed by default ──
   Batch Details and Enrollments both start closed. The enrollment table loads
   only when its section is opened, but the status chips in its header can
   show earlier, once the batch's enrollments are loaded by BatchTable.      */
export default function BatchDetailPanel({
  batch,
  isExpanded,
  searchQuery = "",
  onEdit,
  onEnrollmentChange,
  cachedEnrollments,
  hasEnrollmentsError,
  onFetchEnrollments,
  onEnrollmentsCacheUpdate,
  onInvalidateEnrollments,
  reviewedDecisions,
}) {
  const { canViewAll, filterVisible } = useVisibleEnrollments();
  const visibleEnrollments = cachedEnrollments ? filterVisible(cachedEnrollments) : null;
  const total = canViewAll ? Number(batch.employee_count ?? 0) : visibleEnrollments?.length ?? 0;
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false); // is the "+ Add Enrollment" form open
  const { can } = useBatchPermissions();
  const canAddEnrollment = can(BATCH_ACTIONS.ADD_ENROLLMENT);
  // Count of enrollments per status, from the shared enrollment data, so the
  // chips can show before this section is opened.
  const enrollCounts = visibleEnrollments
    ? countEnrollmentStatuses(visibleEnrollments)
    : null;
  const enrollRef = useRef(null);

  // The add form is inside the Enrollments section, so opening the form also
  // opens the section. A second click closes the form.
  const toggleAdd = () => {
    setEnrollOpen(true);
    setAddOpen((v) => !v);
  };

  // The row stays on the page after it is closed, so close Enrollments too.
  // Otherwise it would still be open the next time the batch is opened.
  useEffect(() => {
    if (!isExpanded) {
      setEnrollOpen(false);
      setAddOpen(false);
    }
  }, [isExpanded]);

  // Open Enrollments at once if the search matched an employee in this batch,
  // or if requests were approved/rejected here, so the user sees the result.
  const reviewedCount = reviewedDecisions?.size ?? 0;
  useEffect(() => {
    if (isExpanded && (isNestedOnlySearchMatch(batch, searchQuery) || reviewedCount > 0))
      setEnrollOpen(true);
  }, [isExpanded, batch, searchQuery, reviewedCount]);

  // When the Enrollments section has opened, scroll it into view so the user
  // does not have to scroll down by hand.
  useEffect(() => {
    if (!enrollOpen) return;
    const t = setTimeout(() => {
      enrollRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }, SCROLL_INTO_VIEW_DELAY);
    return () => clearTimeout(t);
  }, [enrollOpen]);

  return (
    <div className="px-4 pt-3 pb-4 space-y-3">
      {/* Batch Details section, closed at first */}
      <BatchDetailsSection
        batch={batch}
        isExpanded={isExpanded}
        onEdit={onEdit}
      />

      {/* Enrollments section, closed at first */}
      <div
        ref={enrollRef}
        className="border-t border-gray-200 dark:border-gray-700 pt-2"
      >
        <div>
          {/* Click the header to open or close the section. The Add button uses
              stopPropagation so clicking it does not also close the section. */}
          <div
            onClick={() => setEnrollOpen((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setEnrollOpen((v) => !v);
              }
            }}
            role="button"
            tabIndex={0}
            aria-expanded={enrollOpen}
            aria-controls={`enroll-${batch.batch_id}`}
            className="group flex items-center justify-between gap-2 -mx-1.5 px-1.5 py-1 rounded-md cursor-pointer hover:bg-blue-50/70 dark:hover:bg-blue-900/10 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors shrink-0">
                <FiChevronRight
                  className={`h-3 w-3 transition-transform duration-150 ${enrollOpen ? "rotate-90 text-blue-500 dark:text-blue-400" : ""}`}
                />
                Enrollments{total > 0 ? ` (${total})` : ""}
              </span>
              {/* Status chips, shown once this batch's enrollments are loaded. */}
              {enrollCounts && total > 0 && (
                <EnrollmentStatusChips counts={enrollCounts} />
              )}
            </div>
            {enrollOpen && canAddEnrollment && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleAdd();
                }}
                aria-expanded={addOpen}
                aria-controls={`addemp-${batch.batch_id}`}
                title="Enroll an employee in this batch"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
              >
                <FiPlus className="h-3 w-3" />
                Add Enrollment
              </button>
            )}
          </div>
          <Collapse open={enrollOpen}>
            <div id={`enroll-${batch.batch_id}`}>
              {/* Its own error box: if this batch's enrollments crash, the rest of the
                  table still works. */}
              <ErrorBoundary label="this batch's enrollments">
                <BatchEnrollmentPanel
                  batchId={batch.batch_id}
                  batchInfo={batch}
                  addOpen={addOpen}
                  onAddClose={() => setAddOpen(false)}
                  onEnrollmentChange={onEnrollmentChange}
                  highlightQuery={searchQuery}
                  cachedEnrollments={cachedEnrollments}
                  hasEnrollmentsError={hasEnrollmentsError}
                  onFetchEnrollments={onFetchEnrollments}
                  onEnrollmentsCacheUpdate={onEnrollmentsCacheUpdate}
                  onInvalidateEnrollments={onInvalidateEnrollments}
                  reviewedDecisions={reviewedDecisions}
                />
              </ErrorBoundary>
            </div>
          </Collapse>
        </div>
      </div>

      {/* Notes section, with its own error box too. */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-2">
        <ErrorBoundary label="this batch's notes">
          <BatchNotesPanel batchId={batch.batch_id} isExpanded={isExpanded} />
        </ErrorBoundary>
      </div>
    </div>
  );
}
