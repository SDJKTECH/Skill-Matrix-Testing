/* ── Inline create panel — one stacked "card" per batch ──────────────────────
   The Create/Edit Training Batch form. Each batch is one card. The main
   fields are always shown; the other fields are behind "View More". */
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import toast from "react-hot-toast";
import { FiX, FiChevronRight, FiPlus, FiUsers, FiUpload } from "react-icons/fi";
import { createBatch, updateBatch } from "../../../../helper/trainingBatchesApi";
import { useAuth } from "../../../../hooks/useAuth";
import { useManagerApprovals } from "../../../../context/ManagerApprovalsContext";
import { getCurrentEmployeeId } from "../../../../helper/accessRoles";
import { addTrainingBatch } from "../../../../helper/addTrainingV2Api";
import BatchEnrollmentPanel, { EnrollmentPanel } from "./EnrollmentTable";
import Collapse from "../../shared/components/Collapse";
import SkillFilterDropdown from "../../../../component/FilterDropdown";
import ErrorBoundary from "./ErrorBoundary";
import { toDateInput, resolveNominatedBy, uniqueSorted, SCROLL_INTO_VIEW_DELAY } from "../services/trainingUtils";
import { getTrainingQuarterFromDate } from "../services/trainingQuarter";
import { useRetryOnOpen } from "../hooks/useRetryOnOpen";
import { useTrainingReferenceData } from "../../../../context/TrainingReferenceDataContext";
import { useSubmitGuard } from "../hooks/useSubmitGuard";
import { getScrollContainer } from "../../../../helper/utility";
import { isBatchPayload } from "../../../../hooks/useTrainingEmailDeepLink";

const CREATE_LABEL = "block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-0.5";
const CREATE_INPUT = "w-full px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-blue-400 dark:focus:border-blue-500";
const CREATE_INPUT_BASE = "w-full px-2 py-1.5 rounded-lg border bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-blue-400 dark:focus:border-blue-500";
const CREATE_ERROR_TEXT = "mt-1 text-[11px] text-red-500 dark:text-red-400";
// Only length checks (real batch numbers can have spaces and "&"), so they
// can run on every key press.
const FIELD_RULES = {
  batch_num: { label: "Batch Number", max: 255 },
};
const getFieldFormatError = (field, value) => {
  if (!value) return undefined;
  const { label, max } = FIELD_RULES[field];
  if (value.length > max) return `${label} must be ${max} characters or fewer`;
  return undefined;
};
// Smaller label and input styles for the "View More" rows, which have many
// fields side by side.
const CREATE_LABEL_COMPACT = "block text-[10px] font-medium text-gray-600 dark:text-gray-300 mb-0.5";
const CREATE_INPUT_COMPACT = "w-full px-2 py-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:border-blue-400 dark:focus:border-blue-500";

// A textarea grows with its text up to this height, then it scrolls inside,
// so a very long text cannot push the form down too far.
const DESCRIPTION_MAX_HEIGHT = 128; // px, ~6 lines
// Note: the dropdown lists are loaded once by TrainingReferenceDataContext,
// and their sort order is set in trainingUtils.js.
function autoGrowTextarea(el) {
  if (!el) return;
  el.style.height = "auto";
  const next = Math.min(el.scrollHeight, DESCRIPTION_MAX_HEIGHT);
  el.style.height = `${next}px`;
  el.style.overflowY = el.scrollHeight > DESCRIPTION_MAX_HEIGHT ? "auto" : "hidden";
}

// An empty batch card. Note: the batch fields are listed in 5 places
// (emptyBatchRow, rowFromBatch, buildPayload, buildOptimisticBatch and
// OVERVIEW_FIELDS in BatchDetailPanel.jsx). Add a new field to all five.
const emptyBatchRow = () => ({
  batch_num: "",
  batch_desc: "",
  area_name: "",
  sub_area_name: "",
  module_name: "",
  batch_status: "Planned",
  batch_status_remarks: "",
  training_mode: "",
  start_date: "",
  end_date: "",
  // Extra fields, shown only after "View More" is clicked.
  trainer: "",
  batch_size: "",
  training_quarter: "",
  content: "",
  duration: "",
  prerequisite: "",
  resources: "",
  showMore: false,
  // Employees added before the batch exists. They are saved only after this
  // batch is created (see handleSave).
  enrollOpen: false,
  stagedEnrollments: [],
});

// Turns a saved batch (or an array, to fill many cards) into a form card.
// Dates can come as ISO or "Wed, 29 Apr 2026 …" text; batch_size becomes text
// for the number input. One of the 5 field lists (see emptyBatchRow).
const rowFromBatch = (batch) => ({
  batch_num: batch.batch_num || "",
  batch_desc: batch.batch_desc || "",
  area_name: batch.area_name || "",
  sub_area_name: batch.sub_area_name || "",
  module_name: batch.module_name || "",
  batch_status: batch.batch_status || "Planned",
  batch_status_remarks: batch.batch_status_remarks || "",
  training_mode: batch.training_mode || "",
  start_date: toDateInput(batch.start_date),
  end_date: toDateInput(batch.end_date),
  trainer: batch.trainer || "",
  batch_size: batch.batch_size ?? "",
  // The month picker needs "YYYY-MM", not the saved "YYYY-Qn", so use the
  // start date month (same as for a new card).
  training_quarter: toDateInput(batch.start_date).slice(0, 7),
  content: batch.content || "",
  duration: batch.duration || "",
  prerequisite: batch.prerequisite || "",
  resources: batch.resources || "",
  showMore: false,
  // Edit mode can also add employees; they are saved after the batch is
  // updated.
  enrollOpen: false,
  stagedEnrollments: [],
});

// Check every card, so an unfinished card is never skipped without warning
// when saving many batches.
const validateRows = (rows) => {
  const errs = {};
  rows.forEach((r, idx) => {
    const rowErrs = {};
    if (!r.batch_num?.trim()) {
      rowErrs.batch_num = "Batch Number is required";
    } else {
      const err = getFieldFormatError("batch_num", r.batch_num);
      if (err) rowErrs.batch_num = err;
    }
    if (!r.area_name) rowErrs.area_name = "Area is required";
    if (!r.sub_area_name) rowErrs.sub_area_name = "Sub Area is required";
    if (!r.module_name) rowErrs.module_name = "Module is required";
    if (!r.start_date) rowErrs.start_date = "Start Date is required";
    if (r.start_date && r.end_date && r.end_date < r.start_date) {
      rowErrs.end_date = "End Date cannot be before Start Date";
    }
    if (Object.keys(rowErrs).length) errs[idx] = rowErrs;
  });
  return errs;
};

// Filled-in cards open "View More" if it has data, so the user sees it.
// (training_quarter is skipped because it is worked out from the dates.)
const VIEW_MORE_FIELDS = ["training_mode", "trainer", "batch_size", "content", "duration", "prerequisite", "resources"];
const prefillRow = (batch) => {
  const row = rowFromBatch(batch);
  return { ...row, showMore: VIEW_MORE_FIELDS.some((f) => row[f] !== "") };
};

// The first, untouched card (ignoring open/close state): Import JSON replaces it.
const isBlankRow = (row) => JSON.stringify({ ...row, showMore: false, enrollOpen: false }) === JSON.stringify(emptyBatchRow());

// Shared open/close for "View More" and "Add Enrollment". On open, it saves
// the scroll position and scrolls the form's buttons into view. On close, it
// scrolls back to the saved position.
function createSectionToggle({ stateField, toggleRefs, scrollPositions, rows, setRows, panelFooterRef }) {
  return (idx) => {
    const willOpen = !rows[idx][stateField];
    const toggleElBefore = toggleRefs.current.get(idx);
    if (willOpen && toggleElBefore) {
      scrollPositions.current.set(idx, getScrollContainer(toggleElBefore).scrollTop);
    }
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [stateField]: !r[stateField] } : r)));
    setTimeout(() => {
      if (willOpen) {
        panelFooterRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      } else {
        const el = toggleRefs.current.get(idx);
        if (!el) return;
        const savedTop = scrollPositions.current.get(idx);
        if (savedTop != null) getScrollContainer(el).scrollTo({ top: savedTop, behavior: "smooth" });
      }
    }, SCROLL_INTO_VIEW_DELAY);
  };
}

export default function InlineCreatePanel({
  open,
  onClose,
  onSaved,
  mode = "create",
  initialData,
  onEnrollmentCountDelta,
  onOptimisticBatchUpdate,
  // Used only in edit mode (passed by BatchTable for the Edit form).
  cachedEnrollments,
  hasEnrollmentsError,
  onFetchEnrollments,
  onEnrollmentsCacheUpdate,
  onInvalidateEnrollments,
}) {
  const { user } = useAuth();
  const { refreshPendingApprovalsIfAffected } = useManagerApprovals();
  const isEdit = mode === "edit";
  // Dropdown lists come from the shared context. If one failed to load, try
  // once more when this panel opens.
  const {
    hierarchies, trainingModeOptions, trainingModeState, retryTrainingModes,
    batchStatusOptions, batchStatusState, retryBatchStatuses,
  } = useTrainingReferenceData();
  useRetryOnOpen(open, trainingModeState, retryTrainingModes);
  useRetryOnOpen(open, batchStatusState, retryBatchStatuses);
  const [rows, setRows] = useState([emptyBatchRow()]);
  const [errors, setErrors] = useState({}); // { [cardIndex]: { field: message } }
  const [saving, setSaving] = useState(false);
  // Text like "batch 2 of 3" while saving many batches at once.
  const [savingProgress, setSavingProgress] = useState("");
  const savingGuard = useSubmitGuard();

  // The "View More" and "Add Enrollment" buttons of each card, and the scroll
  // position saved when each one opened (key = card number).
  const viewMoreToggleRefs = useRef(new Map());
  const viewMoreScrollPositions = useRef(new Map());
  const enrollToggleRefs = useRef(new Map());
  const enrollScrollPositions = useRef(new Map());
  // The form's bottom bar. When a section opens, we scroll this into view, so
  // Cancel/Save stay visible.
  const panelFooterRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    // initialData without isEdit = Create form filled in from a batch (it still
    // creates a new batch). An array gives one card each. Missing required fields
    // are marked at once, because the user is reviewing the data.
    const prefilled = !isEdit && initialData ? [initialData].flat().map(prefillRow) : [];
    setRows(prefilled.length ? prefilled : [isEdit && initialData ? rowFromBatch(initialData) : emptyBatchRow()]);
    setErrors(validateRows(prefilled));
  }, [open, isEdit, initialData]);

  // Close on Escape, like other panels in the app.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const areas = useMemo(() => uniqueSorted(hierarchies.map((h) => h.area_name)), [hierarchies]);
  const getSubAreas = useCallback((area) =>
    !area ? [] : uniqueSorted(
      hierarchies.filter((h) => h.area_name?.toLowerCase() === area.toLowerCase()).map((h) => h.sub_area_name)
    ), [hierarchies]);
  const getModules = useCallback((area, sub) =>
    !area || !sub ? [] : uniqueSorted(
      hierarchies
        .filter((h) => h.area_name?.toLowerCase() === area.toLowerCase() && h.sub_area_name?.toLowerCase() === sub.toLowerCase())
        .map((h) => h.module_name)
    ), [hierarchies]);

  const handleRowChange = (idx, field, value) => {
    setRows((prev) => prev.map((r, i) => {
      if (i !== idx) return r;
      const next = { ...r, [field]: value };
      if (field === "area_name") { next.sub_area_name = ""; next.module_name = ""; }
      if (field === "sub_area_name") next.module_name = "";
      // training_quarter keeps the "YYYY-MM" the picker shows; it is changed to
      // "YYYY-Qn" only when saving (see buildPayload).
      if (field === "start_date") next.training_quarter = value.slice(0, 7);
      return next;
    }));
    setErrors((prev) => {
      // Check batch_num on every key press, not only on Save.
      if (field in FIELD_RULES) {
        const liveError = getFieldFormatError(field, value);
        const rowErrors = { ...prev[idx] };
        if (liveError) rowErrors[field] = liveError;
        else delete rowErrors[field];
        return { ...prev, [idx]: rowErrors };
      }
      if (!prev[idx]?.[field]) return prev;
      const rowErrors = { ...prev[idx] };
      delete rowErrors[field];
      return { ...prev, [idx]: rowErrors };
    });
  };

  // "View More" button of each card (its open/closed state is kept on the card).
  const toggleMore = createSectionToggle({
    stateField: "showMore",
    toggleRefs: viewMoreToggleRefs,
    scrollPositions: viewMoreScrollPositions,
    rows,
    setRows,
    panelFooterRef,
  });

  // "Add Enrollment" button of each card. The panel's Cancel/✕ also uses this.
  const toggleEnroll = createSectionToggle({
    stateField: "enrollOpen",
    toggleRefs: enrollToggleRefs,
    scrollPositions: enrollScrollPositions,
    rows,
    setRows,
    panelFooterRef,
  });

  // Saves the picked employees on this card only, so they never mix with
  // another card's employees. Called every time an employee is added or removed.
  const handleStageEnrollment = (idx, staged) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, stagedEnrollments: staged } : r)));
  };

  // Import JSON: new cards go after any card already started. Missing fields
  // are marked at once.
  const importInputRef = useRef(null);
  const handleImportFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // so the same file can be picked again
    if (!file) return;
    let data = null;
    try { data = JSON.parse(await file.text()); } catch { /* handled by the shape check below */ }
    if (!isBatchPayload(data)) {
      toast.error(`${file.name} can't be imported: it must be a JSON array of batches.`, { duration: 5000 });
      return;
    }
    const next = [...(rows.length === 1 && isBlankRow(rows[0]) ? [] : rows), ...data.map(prefillRow)];
    setRows(next);
    setErrors(validateRows(next));
    toast.success(`Imported ${data.length} batch${data.length === 1 ? "" : "es"} from ${file.name}. Fill in the highlighted fields, then Save.`, { duration: 6000 });
  };

  const removeRow = (idx) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
    setErrors((prev) => {
      const next = {};
      for (const [k, v] of Object.entries(prev)) {
        const ki = Number(k);
        if (ki === idx) continue;
        next[ki > idx ? ki - 1 : ki] = v;
      }
      return next;
    });
  };

  // The data sent to the server for create and update. One of the 5 field
  // lists (see emptyBatchRow).
  const buildPayload = (adminId, row) => ({
    admin_id: adminId,
    area: row.area_name,
    subarea: row.sub_area_name,
    module: row.module_name,
    batch_num: row.batch_num,
    batch_desc: row.batch_desc || null,
    batch_status: row.batch_status || "Planned",
    batch_status_remarks: row.batch_status_remarks || null,
    training_mode: row.training_mode || null,
    start_date: row.start_date || null,
    end_date: row.end_date || null,
    trainer: row.trainer || null,
    batch_size: row.batch_size === "" ? null : row.batch_size,
    training_quarter: getTrainingQuarterFromDate(row.training_quarter),
    content: row.content || null,
    duration: row.duration || null,
    prerequisite: row.prerequisite || null,
    resources: row.resources || null,
  });

  // The row shown in the table before the server confirms a new batch. Its id
  // is a text like "temp-…", so `typeof batch_id === "number"` tells it is not
  // saved yet. One of the 5 field lists (see emptyBatchRow).
  const buildOptimisticBatch = (row, tempId) => ({
    batch_id: tempId,
    batch_num: row.batch_num,
    batch_desc: row.batch_desc || null,
    area_name: row.area_name,
    sub_area_name: row.sub_area_name,
    module_name: row.module_name,
    training_quarter: getTrainingQuarterFromDate(row.training_quarter),
    batch_status: row.batch_status || "Planned",
    batch_status_remarks: row.batch_status_remarks || null,
    training_mode: row.training_mode || null,
    start_date: row.start_date || null,
    end_date: row.end_date || null,
    trainer: row.trainer || null,
    batch_size: row.batch_size === "" ? null : row.batch_size,
    content: row.content || null,
    duration: row.duration || null,
    prerequisite: row.prerequisite || null,
    resources: row.resources || null,
    employee_count: 0,
    completed_count: 0,
  });

  // Saves the Edit form. It handles its own errors.
  const saveEdit = async (adminId, toastId) => {
    // Update the batch on screen and close the form at once, then save to the
    // server in the background.
    const targetId = initialData.batch_id;
    const editedRow = rows[0];
    const optimisticBatch = {
      ...initialData,
      batch_num: editedRow.batch_num,
      batch_desc: editedRow.batch_desc || null,
      area_name: editedRow.area_name,
      sub_area_name: editedRow.sub_area_name,
      module_name: editedRow.module_name,
      training_quarter: getTrainingQuarterFromDate(editedRow.training_quarter),
      batch_status: editedRow.batch_status || "Planned",
      batch_status_remarks: editedRow.batch_status_remarks || null,
      training_mode: editedRow.training_mode || null,
      start_date: editedRow.start_date || null,
      end_date: editedRow.end_date || null,
      trainer: editedRow.trainer || null,
      batch_size: editedRow.batch_size === "" ? null : editedRow.batch_size,
      content: editedRow.content || null,
      duration: editedRow.duration || null,
      prerequisite: editedRow.prerequisite || null,
      resources: editedRow.resources || null,
    };
    // The old list, used to undo the change if saving fails.
    const snapshot = onOptimisticBatchUpdate((prev) => prev.map((b) => (b.batch_id === targetId ? optimisticBatch : b)));
    onClose();

    try {
      // The batch is found by batch_id, so batch_num can be renamed safely.
      await updateBatch({ ...buildPayload(adminId, editedRow), batch_id: targetId });

      // Then save the employees added in this Edit. If that fails, the batch
      // update is still kept; only a message is shown.
      let enrollError = null;
      if (editedRow.stagedEnrollments?.length) {
        toast.loading("Batch updated — enrolling employees...", { id: toastId, duration: Infinity });
        try {
          const trainings = editedRow.stagedEnrollments.map((r) => ({
            employee_id: Number(r.emp.id),
            area: editedRow.area_name,
            subarea: editedRow.sub_area_name,
            module: editedRow.module_name,
            batch_num: editedRow.batch_num,
            ...(r.nominatedByEmp ? { nominated_by: resolveNominatedBy(r.nominatedByEmp, r.emp) } : {}),
            ...(r.training_status ? { training_status: r.training_status } : {}),
          }));
          const enrollRes = await addTrainingBatch(adminId, trainings);
          const created = enrollRes?.summary?.created ?? 0;
          // Update the "Enrollments (N)" count on screen at once.
          if (created > 0) {
            onOptimisticBatchUpdate((prev) => prev.map((b) => (
              b.batch_id === targetId ? { ...b, employee_count: Number(b.employee_count || 0) + created } : b
            )));
            // These saves skip the shared enrollment data, so clear it; the next load
            // gets the new list.
            onInvalidateEnrollments?.(targetId);
          }
          toast.success(
            `Batch ${editedRow.batch_num} updated${created ? ` and ${created} employee${created !== 1 ? "s" : ""} enrolled` : ""}.`,
            { id: toastId, duration: 5000 }
          );
          // An added employee can be "Pending Approval", so refresh the pending counts.
          refreshPendingApprovalsIfAffected(editedRow.stagedEnrollments.map((r) => r.training_status));
        } catch (err) {
          enrollError = err.response?.data?.error || "Failed to enroll newly added employees.";
        }
      } else {
        toast.success(`Batch ${editedRow.batch_num} updated.`, { id: toastId, duration: 5000 });
      }
      if (enrollError) {
        const n = editedRow.stagedEnrollments.length;
        toast.error(`Batch updated. ${n} enrollment${n !== 1 ? "s" : ""} failed.`, { id: toastId, duration: 8000 });
      }
      onSaved();
    } catch (err) {
      onOptimisticBatchUpdate(() => snapshot);
      const detail = err.response?.data?.error;
      toast.error(detail ? `Failed to update batch: ${detail}` : "Failed to update batch — please try again.", { id: toastId, duration: 5000 });
    }
  };

  // Saves the Create form (one or many batches). It handles its own errors and
  // remembers which card failed.
  const saveCreate = async (adminId, toastId) => {
    let created = 0;
    let enrolledCount = 0;
    const enrollFailures = []; // [{ batch_num, count, error }]
    // The card being saved now, so an error message can name it.
    let failedAtRow = null;
    // Close the form at once; a message shows the progress while saving.
    onClose();
    try {
      for (const [i, row] of rows.entries()) {
        const progressLabel = rows.length > 1 ? `batch ${i + 1} of ${rows.length}` : "";
        if (rows.length > 1) setSavingProgress(progressLabel);
        failedAtRow = { index: i, batch_num: row.batch_num };
        toast.loading(rows.length > 1 ? `Saving ${progressLabel}...` : "Saving batch...", { id: toastId, duration: Infinity });

        // Show each batch in the table as soon as its own save starts. Done one at a
        // time, so if one fails, the cards after it are not left showing as saved.
        const tempId = `temp-${Date.now()}-${i}`;
        const optimisticBatch = buildOptimisticBatch(row, tempId);
        onOptimisticBatchUpdate((prev) => [optimisticBatch, ...prev]);

        let realBatchId;
        try {
          // (a) Create the batch first and get its real batch_id.
          const res = await createBatch(buildPayload(adminId, row));
          realBatchId = res.batch_id;
          onOptimisticBatchUpdate((prev) => prev.map((b) => (b.batch_id === tempId ? { ...b, batch_id: realBatchId } : b)));
        } catch (err) {
          // Remove only this card's temporary row; batches saved before stay.
          onOptimisticBatchUpdate((prev) => prev.filter((b) => b.batch_id !== tempId));
          throw err; // stop here; the error handler below names the failed card
        }
        created++;
        failedAtRow = null;

        // (b) After the batch is saved, save its picked employees. If that fails,
        // the other batches are still created; the failure is reported separately.
        if (row.stagedEnrollments?.length) {
          toast.loading(
            rows.length > 1 ? `Batch ${progressLabel} saved — enrolling employees...` : "Batch saved — enrolling employees...",
            { id: toastId, duration: Infinity }
          );
          try {
            const trainings = row.stagedEnrollments.map((r) => ({
              employee_id: Number(r.emp.id),
              area: row.area_name,
              subarea: row.sub_area_name,
              module: row.module_name,
              batch_num: row.batch_num,
              ...(r.nominatedByEmp ? { nominated_by: resolveNominatedBy(r.nominatedByEmp, r.emp) } : {}),
              ...(r.training_status ? { training_status: r.training_status } : {}),
            }));
            const enrollRes = await addTrainingBatch(adminId, trainings);
            const rowEnrolled = enrollRes?.summary?.created ?? 0;
            enrolledCount += rowEnrolled;
            // Update the "Enrollments (N)" count on screen at once.
            if (rowEnrolled > 0) {
              onOptimisticBatchUpdate((prev) => prev.map((b) => (
                b.batch_id === realBatchId ? { ...b, employee_count: Number(b.employee_count || 0) + rowEnrolled } : b
              )));
            }
            // Same as saveEdit's check above.
            refreshPendingApprovalsIfAffected(row.stagedEnrollments.map((r) => r.training_status));
          } catch (enrollErr) {
            enrollFailures.push({
              batch_num: row.batch_num,
              count: row.stagedEnrollments.length,
              error: enrollErr.response?.data?.error || "Failed to enroll employees.",
            });
          }
        }
      }

      // (c) A final message: names the batch for one save, or gives counts for
      // many. If adding employees failed, it says how many.
      const batchMsg = rows.length === 1 ? `Batch ${rows[0].batch_num} created` : `${created} batch${created !== 1 ? "es" : ""} created`;
      if (enrollFailures.length === 0) {
        toast.success(enrolledCount > 0 ? `${batchMsg} and ${enrolledCount} employee${enrolledCount !== 1 ? "s" : ""} enrolled.` : `${batchMsg}.`, { id: toastId, duration: 5000 });
      } else {
        const failedCount = enrollFailures.reduce((sum, f) => sum + f.count, 0);
        toast.error(`${batchMsg}. ${failedCount} enrollment${failedCount !== 1 ? "s" : ""} failed.`, { id: toastId, duration: 8000 });
      }
      // The form is already closed; just run the onSaved callback now.
      onSaved();
    } catch (err) {
      // If a card failed, the cards before it were already saved, so say that.
      const detail = err.response?.data?.error;
      if (failedAtRow && failedAtRow.index > 0) {
        toast.error(
          `${failedAtRow.index} batch${failedAtRow.index !== 1 ? "es" : ""} saved. Failed to save "${failedAtRow.batch_num}"${detail ? `: ${detail}` : " — please try again."}`,
          { id: toastId, duration: 8000 }
        );
      } else {
        toast.error(detail ? `Failed to save batch: ${detail}` : "Failed to save batch — please try again.", { id: toastId, duration: 5000 });
      }
    }
  };

  const handleSave = async () => {
    if (savingGuard.isLocked()) return;
    const adminId = getCurrentEmployeeId(user);
    if (!adminId) { toast.error("User not identified."); return; }
    const errs = validateRows(rows);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      // Each missing field already shows its own error under it, so this message
      // stays short.
      toast.error("Fix the highlighted fields before saving.");
      return;
    }
    savingGuard.lock();
    setSaving(true);
    // One message box that is updated at each step. Always pass `duration`:
    // react-hot-toast keeps the old duration when the same id is reused.
    const toastId = toast.loading(isEdit ? "Updating batch..." : "Saving batch...", { duration: Infinity });
    try {
      if (isEdit) {
        await saveEdit(adminId, toastId);
      } else {
        await saveCreate(adminId, toastId);
      }
    } finally {
      savingGuard.unlock();
      setSaving(false);
      setSavingProgress("");
    }
  };

  if (!open) return null;

  return (
    <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-900/10 overflow-hidden mb-3">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
        <span className="text-sm font-semibold text-blue-800 dark:text-blue-300">
          {isEdit ? "Edit Training Batch" : `Create Training Batch${rows.length !== 1 ? "es" : ""}`}
        </span>
        {!isEdit && (
          <>
            <input ref={importInputRef} type="file" accept=".json,application/json" className="hidden" onChange={handleImportFile} />
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              disabled={saving}
              title="Fill this form from an exported batch JSON file (e.g. the Training Calendar export)"
              className="ml-auto mr-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-900 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors disabled:opacity-50"
            >
              <FiUpload className="h-3.5 w-3.5" />
              Import JSON
            </button>
          </>
        )}
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-500 dark:text-blue-400 transition-colors"
          aria-label={isEdit ? "Close edit panel" : "Collapse create panel"}
        >
          <FiX className="h-4 w-4" />
        </button>
      </div>

      {/* One stacked card per batch */}
      <div className="p-4 space-y-3">
        {rows.map((row, idx) => (
          <div
            key={idx}
            className="relative rounded-lg border border-blue-100 dark:border-blue-900/40 bg-white/60 dark:bg-gray-900/30 p-3"
          >
            {rows.length > 1 && (
              <>
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Batch {idx + 1}</span>
                <button
                  type="button"
                  onClick={() => removeRow(idx)}
                  className="absolute top-2 right-2 p-1 rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  aria-label={`Remove batch ${idx + 1}`}
                >
                  <FiX className="h-3.5 w-3.5" />
                </button>
              </>
            )}

            {/* Row 1: Batch Number, Area, Sub Area, Module, Status. */}
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-5 gap-3">
              <div>
                <label className={CREATE_LABEL}>Batch Number <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={row.batch_num}
                  onChange={(e) => handleRowChange(idx, "batch_num", e.target.value)}
                  placeholder="e.g. 2026-07 or BATCH-42"
                  aria-label="Batch Number"
                  aria-invalid={Boolean(errors[idx]?.batch_num)}
                  className={`${CREATE_INPUT_BASE} ${errors[idx]?.batch_num ? "border-red-400 dark:border-red-500" : "border-gray-300 dark:border-gray-600"}`}
                />
                {errors[idx]?.batch_num && <p className={CREATE_ERROR_TEXT}>{errors[idx].batch_num}</p>}
              </div>
              <div className="[&_label:empty]:hidden [&>div>div>button]:py-1.5">
                <label className={CREATE_LABEL}>Area <span className="text-red-500">*</span></label>
                <SkillFilterDropdown label="" options={areas} value={row.area_name} onChange={(v) => handleRowChange(idx, "area_name", v)} placeholder="Area" />
                {errors[idx]?.area_name && <p className={CREATE_ERROR_TEXT}>{errors[idx].area_name}</p>}
              </div>
              <div className="[&_label:empty]:hidden [&>div>div>button]:py-1.5">
                <label className={CREATE_LABEL}>Sub Area <span className="text-red-500">*</span></label>
                <SkillFilterDropdown label="" options={getSubAreas(row.area_name)} value={row.sub_area_name} onChange={(v) => handleRowChange(idx, "sub_area_name", v)} placeholder="Sub Area" emptyMessage="Pick an Area first, or type a new sub area." />
                {errors[idx]?.sub_area_name && <p className={CREATE_ERROR_TEXT}>{errors[idx].sub_area_name}</p>}
              </div>
              <div className="[&_label:empty]:hidden [&>div>div>button]:py-1.5">
                <label className={CREATE_LABEL}>Module <span className="text-red-500">*</span></label>
                <SkillFilterDropdown label="" options={getModules(row.area_name, row.sub_area_name)} value={row.module_name} onChange={(v) => handleRowChange(idx, "module_name", v)} placeholder="Module" emptyMessage="Pick Area and Sub Area first, or type a new module." />
                {errors[idx]?.module_name && <p className={CREATE_ERROR_TEXT}>{errors[idx].module_name}</p>}
              </div>
              <div className="[&_label:empty]:hidden [&>div>div>button]:py-1.5">
                <label className={CREATE_LABEL}>Batch Status</label>
                {/* Same search dropdown as Area/Sub Area/Module. It has no "Loading…"
                    text, so while the list loads it just shows no options. */}
                <SkillFilterDropdown
                  label=""
                  options={batchStatusOptions}
                  value={row.batch_status}
                  onChange={(v) => handleRowChange(idx, "batch_status", v)}
                  placeholder="Batch Status"
                  emptyMessage="No batch statuses available."
                />
              </div>
            </div>

            {/* Row 2: Description, Status Remark, Start Date, End Date. */}
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-3">
                <label className={CREATE_LABEL}>Description</label>
                <textarea
                  ref={autoGrowTextarea}
                  rows={1}
                  value={row.batch_desc}
                  onChange={(e) => {
                    handleRowChange(idx, "batch_desc", e.target.value);
                    autoGrowTextarea(e.target);
                  }}
                  placeholder="Short description of this batch"
                  aria-label="Description"
                  className={`${CREATE_INPUT} resize-none overflow-hidden`}
                />
              </div>
              <div className="sm:col-span-3">
                <label className={CREATE_LABEL}>Status Remark</label>
                <textarea
                  ref={autoGrowTextarea}
                  rows={1}
                  value={row.batch_status_remarks}
                  onChange={(e) => {
                    handleRowChange(idx, "batch_status_remarks", e.target.value);
                    autoGrowTextarea(e.target);
                  }}
                  placeholder="Optional note about this batch's status"
                  aria-label="Status Remark"
                  className={`${CREATE_INPUT} resize-none overflow-hidden`}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={CREATE_LABEL}>Start Date</label>
                <input type="date" value={row.start_date} onChange={(e) => handleRowChange(idx, "start_date", e.target.value)} aria-label="Start Date" aria-invalid={Boolean(errors[idx]?.start_date)} className={`${CREATE_INPUT_BASE} [color-scheme:light] dark:[color-scheme:dark] ${errors[idx]?.start_date ? "border-red-400 dark:border-red-500" : "border-gray-300 dark:border-gray-600"}`} />
                {errors[idx]?.start_date && <p className={CREATE_ERROR_TEXT}>{errors[idx].start_date}</p>}
              </div>
              <div className="sm:col-span-2">
                <label className={CREATE_LABEL}>End Date</label>
                <input type="date" value={row.end_date} onChange={(e) => handleRowChange(idx, "end_date", e.target.value)} aria-label="End Date" aria-invalid={Boolean(errors[idx]?.end_date)} className={`${CREATE_INPUT_BASE} [color-scheme:light] dark:[color-scheme:dark] ${errors[idx]?.end_date ? "border-red-400 dark:border-red-500" : "border-gray-300 dark:border-gray-600"}`} />
                {errors[idx]?.end_date && <p className={CREATE_ERROR_TEXT}>{errors[idx].end_date}</p>}
              </div>
              <div className="sm:col-span-2">
                <label className={CREATE_LABEL}>Training Quarter</label>
                <div className="relative">
                  <input
                    type="month"
                    value={row.training_quarter}
                    onChange={(e) => handleRowChange(idx, "training_quarter", e.target.value)}
                    aria-label="Training Quarter"
                    className={`${CREATE_INPUT} [color-scheme:light] dark:[color-scheme:dark]`}
                  />
                  {!row.training_quarter && (
                    <span className="pointer-events-none absolute inset-y-px left-px right-8 rounded-l-lg flex items-center pl-2 bg-white dark:bg-gray-800 text-sm text-gray-400 dark:text-gray-500">
                      YYYY-QN
                    </span>
                  )}
                </div>
                {row.training_quarter && (
                  <span className="mt-1 inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 px-2 py-0.5 text-[11px] font-medium">
                    {getTrainingQuarterFromDate(row.training_quarter)}
                  </span>
                )}
              </div>
            </div>

            {/* "View More": all the other fields. */}
            <Collapse open={row.showMore} className="mt-3">
              <div className="space-y-3">
                {/* Row A: Training Mode, Batch Size, Trainer, Duration. 2 per line on
                    small screens, all 4 on one line on large screens. */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
                  <div className="lg:col-span-3">
                    <label className={CREATE_LABEL_COMPACT}>Training Mode</label>
                    {/* Same search dropdown as Area/Sub Area/Module. It has no "Loading…"
                        text, so while the list loads it just shows no options. */}
                    <div className="[&_label:empty]:hidden [&>div>div>button]:py-1.5">
                      <SkillFilterDropdown
                        label=""
                        options={trainingModeOptions}
                        value={row.training_mode}
                        onChange={(v) => handleRowChange(idx, "training_mode", v)}
                        placeholder="Training Mode"
                        emptyMessage="No training modes available."
                      />
                    </div>
                  </div>
                  <div className="lg:col-span-2">
                    <label className={CREATE_LABEL_COMPACT}>Batch Size</label>
                    <input type="number" min="0" value={row.batch_size} onChange={(e) => handleRowChange(idx, "batch_size", e.target.value)} placeholder="e.g. 25" aria-label="Batch Size" className={CREATE_INPUT_COMPACT} />
                  </div>
                  <div className="lg:col-span-4">
                    <label className={CREATE_LABEL_COMPACT}>Trainer</label>
                    <input type="text" value={row.trainer} onChange={(e) => handleRowChange(idx, "trainer", e.target.value)} placeholder="Trainer name" aria-label="Trainer" className={CREATE_INPUT_COMPACT} />
                  </div>
                  <div className="lg:col-span-3">
                    <label className={CREATE_LABEL_COMPACT}>Duration</label>
                    <input type="text" value={row.duration} onChange={(e) => handleRowChange(idx, "duration", e.target.value)} placeholder="e.g. 10 Days" aria-label="Duration" className={CREATE_INPUT_COMPACT} />
                  </div>
                </div>

                {/* Row C: Prerequisites, Resources, Content. These boxes grow with
                    their text; items-start keeps the short ones at the top as
                    Content grows. */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
                  <div>
                    <label className={CREATE_LABEL}>Prerequisites</label>
                    <textarea
                      ref={autoGrowTextarea}
                      rows={1}
                      value={row.prerequisite}
                      onChange={(e) => {
                        handleRowChange(idx, "prerequisite", e.target.value);
                        autoGrowTextarea(e.target);
                      }}
                      placeholder="e.g. Basic AWS knowledge"
                      aria-label="Prerequisites"
                      className={`${CREATE_INPUT} resize-none overflow-hidden`}
                    />
                  </div>
                  <div>
                    <label className={CREATE_LABEL}>Resources</label>
                    <textarea
                      ref={autoGrowTextarea}
                      rows={1}
                      value={row.resources}
                      onChange={(e) => {
                        handleRowChange(idx, "resources", e.target.value);
                        autoGrowTextarea(e.target);
                      }}
                      placeholder="e.g. Lab Guide, Practice Tests"
                      aria-label="Resources"
                      className={`${CREATE_INPUT} resize-none overflow-hidden`}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={CREATE_LABEL}>Content</label>
                    <textarea
                      ref={autoGrowTextarea}
                      rows={1}
                      value={row.content}
                      onChange={(e) => {
                        handleRowChange(idx, "content", e.target.value);
                        autoGrowTextarea(e.target);
                      }}
                      placeholder="Course content / syllabus"
                      aria-label="Content"
                      className={`${CREATE_INPUT} resize-none overflow-hidden`}
                    />
                  </div>
                </div>
              </div>
            </Collapse>
            <button
              type="button"
              ref={(el) => viewMoreToggleRefs.current.set(idx, el)}
              onClick={() => toggleMore(idx)}
              aria-expanded={row.showMore}
              className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
            >
              <FiChevronRight className={`h-3 w-3 transition-transform duration-150 ${row.showMore ? "rotate-90" : ""}`} />
              {row.showMore ? "View Less" : "View More"}
            </button>

            {/* "+ Add Enrollment" (Create only). A saved batch adds employees from its
                own row in the table instead. */}
            {!isEdit && (
              row.enrollOpen ? (
                // Same ref key as the closed version below, so toggleEnroll can scroll to it.
                <div ref={(el) => enrollToggleRefs.current.set(idx, el)} className="mt-3 rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-900/10 p-2.5">
                  <EnrollmentPanel
                    open={row.enrollOpen}
                    batchInfo={row}
                    enrolledIds={new Set()}
                    onClose={() => toggleEnroll(idx)}
                    deferSave
                    initialStaged={row.stagedEnrollments}
                    onStage={(staged) => handleStageEnrollment(idx, staged)}
                  />
                </div>
              ) : (
                // The whole row can be clicked, not only the icon or text.
                <div
                  ref={(el) => enrollToggleRefs.current.set(idx, el)}
                  onClick={() => toggleEnroll(idx)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleEnroll(idx); } }}
                  role="button"
                  tabIndex={0}
                  aria-expanded={false}
                  className="mt-3 flex items-center gap-1.5 rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-900/10 hover:bg-sky-100/70 dark:hover:bg-sky-900/20 transition-colors cursor-pointer p-2.5 text-xs font-medium text-sky-700 dark:text-sky-300"
                >
                  <FiUsers className="h-3.5 w-3.5" />
                  {row.stagedEnrollments.length > 0
                    ? `${row.stagedEnrollments.length} employee${row.stagedEnrollments.length !== 1 ? "s" : ""} selected — edit`
                    : "+ Add Enrollment"}
                </div>
              )
            )}

            {/* "+ Add Enrollment" (Edit). Added employees are saved after the
                batch update. Shows the saved and not-yet-saved counts. Batch
                details come from the saved batch, not from the form (the form
                may have unsaved changes). */}
            {isEdit && (
              row.enrollOpen ? (
                // Same ref key as the closed version, so toggleEnroll can scroll to it.
                // The list below has its own scrollbar, because the page scrollbar is hidden.
                <div ref={(el) => enrollToggleRefs.current.set(idx, el)} className="mt-3 rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-900/10 p-2.5">
                  <div className="max-h-[450px] overflow-y-auto">
                    <ErrorBoundary label="this batch's enrollments">
                      <BatchEnrollmentPanel
                        batchId={initialData.batch_id}
                        batchInfo={initialData}
                        addOpen={row.enrollOpen}
                        onAddClose={() => toggleEnroll(idx)}
                        onEnrollmentChange={(delta) => (
                          typeof delta === "number"
                            ? onEnrollmentCountDelta(initialData.batch_id, delta)
                            : onSaved()
                        )}
                        cachedEnrollments={cachedEnrollments}
                        hasEnrollmentsError={hasEnrollmentsError}
                        onFetchEnrollments={onFetchEnrollments}
                        onEnrollmentsCacheUpdate={onEnrollmentsCacheUpdate}
                        onInvalidateEnrollments={onInvalidateEnrollments}
                        deferSave
                        initialStaged={row.stagedEnrollments}
                        onStage={(staged) => handleStageEnrollment(idx, staged)}
                      />
                    </ErrorBoundary>
                  </div>
                </div>
              ) : (
                // The whole row can be clicked, not only the icon or text.
                <div
                  ref={(el) => enrollToggleRefs.current.set(idx, el)}
                  onClick={() => toggleEnroll(idx)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleEnroll(idx); } }}
                  role="button"
                  tabIndex={0}
                  aria-expanded={false}
                  className="mt-3 flex items-center gap-1.5 rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-900/10 hover:bg-sky-100/70 dark:hover:bg-sky-900/20 transition-colors cursor-pointer p-2.5 text-xs font-medium text-sky-700 dark:text-sky-300"
                >
                  <FiUsers className="h-3.5 w-3.5" />
                  {(() => {
                    const confirmed = Number(initialData?.employee_count ?? 0);
                    const pending = row.stagedEnrollments?.length ?? 0;
                    if (confirmed === 0 && pending === 0) return "+ Add Enrollment";
                    const parts = [];
                    if (confirmed > 0) parts.push(`${confirmed} enrolled`);
                    if (pending > 0) parts.push(`${pending} pending`);
                    return `${parts.join(", ")} — edit`;
                  })()}
                </div>
              )
            )}
          </div>
        ))}

        {/* "Add another batch" button (Create only; Edit always edits one batch). */}
        {!isEdit && (
          <button
            type="button"
            onClick={() => setRows((prev) => [...prev, emptyBatchRow()])}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-gray-400 dark:border-gray-500 text-gray-600 dark:text-gray-400 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 text-xs font-medium transition-colors"
          >
            <FiPlus className="h-3.5 w-3.5" />
            Add another batch
          </button>
        )}
      </div>

      {/* Bottom bar with Cancel/Save. Opened sections scroll this into view. */}
      <div ref={panelFooterRef} className="flex justify-end gap-2 px-4 py-2.5 border-t border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-900/10">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          {saving && (
            <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          )}
          {saving ? (savingProgress ? `Saving ${savingProgress}…` : "Saving…") : isEdit ? "Update Batch" : "Save Batches"}
        </button>
      </div>
    </div>
  );
}
