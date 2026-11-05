import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import {
  FiEdit2,
  FiTrash2,
  FiX,
  FiCheck,
  FiPlus,
  FiUsers,
  FiInfo,
  FiSearch,
  FiChevronDown,
} from "react-icons/fi";
import {
  fetchBatchEnrollments,
  updateTraining,
  deleteTraining,
  suggestEmployees,
  addTrainingBatch,
} from "../../../../helper/addTrainingV2Api";
import { useAuth } from "../../../../hooks/useAuth";
import { useManagerApprovals } from "../../../../context/ManagerApprovalsContext";
import { getCurrentEmployeeId } from "../../../../helper/accessRoles";
import DetailPanel from "./DetailPanel";
import { ENROLLMENT_STATUS_COLORS, resolveNominatedBy, nominatedByValue } from "../services/trainingUtils";
import { useVisibleEnrollments } from "../services/enrollmentVisibility";
import { useRetryOnOpen } from "../hooks/useRetryOnOpen";
import { useTrainingReferenceData } from "../../../../context/TrainingReferenceDataContext";
import LiveSelect from "./LiveSelect";
import ColumnFilterIcon from "../../shared/components/filters/ColumnFilterIcon";
import SearchToggle from "../../shared/components/filters/SearchToggle";
import { useBatchPermissions, BATCH_ACTIONS } from "../services/batchPermissions";
import { enrollmentMatchesSearch } from "../services/batchSearch";
import HighlightMatch from "../../shared/components/HighlightMatch";
import CopyButton from "../../shared/components/CopyButton";
import { useSubmitGuard } from "../hooks/useSubmitGuard";
import { useScrollIntoViewOnOpen } from "../hooks/useScrollIntoViewOnOpen";

const ENROLLMENTS_PER_PAGE = 8;

function EnrollmentStatusBadge({ status }) {
  if (!status) return <span className="text-gray-400 dark:text-gray-500">—</span>;
  // String() so a non-text status from the server does not crash the page.
  const cls = ENROLLMENT_STATUS_COLORS[String(status).toLowerCase()] || "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300";
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{status}</span>;
}

// Fields shown in each employee's "More details" panel. To show a new field,
// add it here. Batch fields and columns already in the table row are left
// out, so nothing is shown twice.
const ENROLLMENT_DETAIL_SECTIONS = [
  { key: "employee", title: "Employee", fields: [
    { key: "emp_id", label: "Employee ID" },
    { key: "email",  label: "Email" },
    { key: "manager_email", label: "Manager Email" },
  ]},
];

// Add does not send a start date, so the backend always sets the new
// enrollment to "Not Started". We show that same status before saving.
const PREVIEW_AUTO_STATUS = "Not Started";

const rowFromEnrollment = (enr) => ({
  emp: { id: enr.employee_id, name: enr.employee_name, emp_id: enr.emp_id, department: enr.department },
  nominatedby: enr.nominated_by || "",
  training_status: enr.training_status || "",
  status_remarks: enr.status_remarks || "",
});

/**
 * Employee search box with a dropdown of matches. Used for the main
 * "Search employee" box and for the Nominated By box in each row.
 * With `value`, it keeps the chosen employee (Nominated By). Without it, it
 * clears after each pick (main search, where a pick adds a new row).
 * `getBadge(emp)` can mark matches as already taken ("Enrolled", "Added").
 */
function EmployeeSearchField({
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
                  No match — select an employee or Self nomination.
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

// One row in the Add/Edit table. `locked` (edit) hides the Remove button.
// `showTrainingStatus` (edit) shows the status dropdown. `previewStatus` (add)
// shows the status the backend will set.
function EmployeeRow({ row, idx, onFieldChange, onRemove, locked, showTrainingStatus, previewStatus, trainingStatusOptions, trainingStatusState, existingNominators = [], defaultNominator = null }) {
  const emp = row.emp;
  // The backend needs a reason of at least 10 characters when the status is
  // "Not Completed". We show a hint here; the server still checks it.
  const effectiveStatus = row.training_status || previewStatus || "";
  const noteRequired = effectiveStatus === "Not Completed";
  const noteTooShort = noteRequired && (row.status_remarks || "").trim().length < 10;
  // Same shape as the panel's default value (displayName is only for showing).
  const selfNominationOption = defaultNominator ? { ...defaultNominator, displayName: "Self nomination" } : null;
  return (
    <tr>
      <td className="px-3 py-1.5">
        <div className="font-medium text-gray-900 dark:text-gray-100">{emp.name || emp.emp_id}</div>
        <div className="text-[10px] text-gray-500 dark:text-gray-400">
          {emp.emp_id}{emp.department ? ` · ${emp.department}` : ""}
        </div>
      </td>
      {showTrainingStatus && (
        <td className="px-3 py-1.5 whitespace-nowrap">
          {/* inline-block keeps the arrow icon next to the dropdown. */}
          <div className="relative inline-block">
            <LiveSelect
              state={trainingStatusState}
              options={trainingStatusOptions}
              value={row.training_status}
              onChange={(e) => onFieldChange(idx, "training_status", e.target.value)}
              aria-label={`Training status for ${emp.name || emp.emp_id}`}
              className="w-32 pl-2 pr-6 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-gray-100 appearance-none cursor-pointer"
            />
            <FiChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 h-3 w-3" />
          </div>
        </td>
      )}
      {previewStatus && (
        <td className="px-3 py-1.5 whitespace-nowrap">
          {/* inline-block, same reason as above. */}
          <div className="relative inline-block">
            {/* Always add the selected value as an option, so the dropdown is never
                blank before the status list has loaded. */}
            <select
              value={row.training_status || previewStatus}
              onChange={(e) => onFieldChange(idx, "training_status", e.target.value)}
              aria-label={`Training status for ${emp.name || emp.emp_id}`}
              title="Defaults to Not Started — pick a different value to override"
              className="w-32 pl-2 pr-6 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-gray-100 appearance-none cursor-pointer"
            >
              {!trainingStatusOptions.includes(row.training_status || previewStatus) && (
                <option value={row.training_status || previewStatus}>{row.training_status || previewStatus}</option>
              )}
              {trainingStatusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <FiChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 h-3 w-3" />
          </div>
        </td>
      )}
      <td className="px-3 py-1.5">
        <input
          type="text"
          value={row.status_remarks || ""}
          onChange={(e) => onFieldChange(idx, "status_remarks", e.target.value)}
          placeholder={noteRequired ? "Reason required (min 10 characters)" : "Optional note"}
          aria-label={`Status remark for ${emp.name || emp.emp_id}${noteRequired ? " (required)" : ""}`}
          aria-required={noteRequired}
          aria-invalid={noteTooShort}
          title={noteTooShort ? "Required, min 10 characters, when status is Not Completed" : undefined}
          className={`w-full px-2 py-1 rounded border bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-gray-100 ${
            noteTooShort
              ? "border-red-400 dark:border-red-500 focus:ring-1 focus:ring-red-400"
              : "border-gray-300 dark:border-gray-600"
          }`}
        />
      </td>
      <td className="pl-10 pr-3 py-1.5">
        {locked ? (
          // Edit mode: nominated_by is plain text, so wrap it as { name, emp_id }.
          // Names already used in this batch are added to the search results.
          <EmployeeSearchField
            compact
            value={row.nominatedby ? { name: row.nominatedby, emp_id: null } : null}
            onSelect={(nominator) => onFieldChange(idx, "nominatedby", nominator ? (nominatedByValue(nominator, defaultNominator) || "") : "")}
            placeholder="Search…"
            ariaLabel={`Nominated by for ${emp.name || emp.emp_id}`}
            extraOptions={existingNominators}
            selfNominationOption={selfNominationOption}
          />
        ) : (
          // If left empty, the logged-in user is saved, so the placeholder says that.
          <EmployeeSearchField
            compact
            value={row.nominatedByEmp}
            onSelect={(nominator) => onFieldChange(idx, "nominatedByEmp", nominator)}
            placeholder="Self nomination"
            ariaLabel={`Nominated by for ${emp.name || emp.emp_id}`}
            extraOptions={existingNominators}
            selfNominationOption={selfNominationOption}
          />
        )}
      </td>
      {!locked && (
        <td className="px-3 py-1.5">
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => onRemove(idx)}
              aria-label={`Remove ${emp.name || emp.emp_id} from the list`}
              className="p-1 rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <FiTrash2 className="h-3 w-3" />
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}

/* ── Add/Edit Enrollment inline panel (within expanded batch row) ──────────
   "add": search and add employees (the backend sets their status).
   "edit": one row for an existing record, with a status dropdown. */
// Empty list made once: a new [] on every render made the setup effect run
// again and again.
const EMPTY_STAGED = [];

export function EnrollmentPanel({
  open, batchInfo, enrolledIds, onClose, onSaved, mode = "add", initialData,
  // deferSave: the batch does not exist yet (Create form), so added rows are
  // passed to onStage and saved together with the batch. initialStaged brings
  // them back when the panel opens again.
  deferSave = false, onStage, initialStaged = EMPTY_STAGED,
  // Only used in edit mode.
  existingNominators = EMPTY_STAGED,
  // From BatchTable: updates the shared enrollment data, so saves show on
  // screen before the server answers. Not set in deferSave mode.
  onEnrollmentsCacheUpdate,
}) {
  const { user } = useAuth();
  const { refreshPendingApprovalsIfAffected } = useManagerApprovals();
  const isEdit = mode === "edit";
  const [staged, setStaged] = useState([]); // [{ emp, nominatedby, nominatedByEmp, training_status? }]
  const [saving, setSaving] = useState(false);
  const savingGuard = useSubmitGuard();

  // Status list from the shared context. If it failed to load, try once more
  // when this panel opens.
  const {
    trainingStatusOptions, trainingStatusState, retryTrainingStatuses,
  } = useTrainingReferenceData();
  useRetryOnOpen(open, trainingStatusState, retryTrainingStatuses);

  const defaultNominator = useMemo(() => {
    const id = getCurrentEmployeeId(user);
    if (!id) return null;
    return {
      id: Number(id),
      name: user?.displayName || "",
      emp_id: user?.employeeId ? String(user.employeeId) : String(id),
    };
  }, [user]);

  // Fill the rows again when the panel opens or switches between Add and Edit.
  // deferSave and initialStaged are left out of the list on purpose: the
  // parent passes `staged` back, which would make this run in a loop.
  useEffect(() => {
    if (!open) return;
    setStaged(
      isEdit && initialData ? [rowFromEnrollment(initialData)]
        : deferSave ? initialStaged
        : []
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEdit, initialData]);

  // deferSave: send the rows to the parent every time they change. onStage is
  // read from a ref, because callers pass a new function on every render.
  const onStageRef = useRef(onStage);
  useEffect(() => { onStageRef.current = onStage; });
  useEffect(() => {
    if (deferSave) onStageRef.current?.(staged);
  }, [deferSave, staged]);

  // Close on Escape, like other panels in the app.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const stagedIds = new Set(staged.map((s) => s.emp.id));

  const handleStage = (emp) => {
    if (enrolledIds?.has(emp.id) || stagedIds.has(emp.id)) return;
    setStaged((prev) => [...prev, {
      emp,
      // Shows "Self nomination" by default; the logged-in user's real record is
      // what gets saved.
      nominatedByEmp: defaultNominator ? { ...defaultNominator, displayName: "Self nomination" } : null,
      training_status: "", // empty = use the status preview until the user picks one
      status_remarks: "",
    }]);
  };

  const setStagedField = (idx, key, value) => {
    setStaged((prev) => prev.map((s, i) => (i === idx ? { ...s, [key]: value } : s)));
  };

  const removeRow = (idx) => {
    setStaged((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (savingGuard.isLocked()) return;
    const adminId = getCurrentEmployeeId(user);
    if (!adminId) { toast.error("User not identified."); return; }
    if (!staged.length) { toast.error("Select at least one employee."); return; }
    savingGuard.lock();
    setSaving(true);
    try {
      if (isEdit) {
        // Update the shared data and close the panel at once, then save to the
        // server in the background.
        const r = staged[0];
        const targetId = initialData.employee_training_id;
        const resolvedNominatedBy = resolveNominatedBy(r.nominatedby, {
          id: initialData.employee_id,
          name: initialData.employee_name,
          emp_id: initialData.emp_id,
        });
        const optimisticRecord = {
          ...initialData,
          training_status: r.training_status || initialData.training_status,
          nominated_by: resolvedNominatedBy,
          status_remarks: r.status_remarks,
        };
        const snapshot = onEnrollmentsCacheUpdate(batchInfo.batch_id, (prev) => (
          prev.map((e) => (e.employee_training_id === targetId ? optimisticRecord : e))
        ));
        onSaved(0);
        onClose();

        const toastId = toast.loading("Updating enrollment...", { duration: Infinity });
        try {
          await updateTraining({
            employee_training_id: targetId,
            admin_id: adminId,
            training_status: r.training_status,
            nominated_by: resolvedNominatedBy,
            status_remarks: r.status_remarks,
          });
          toast.success("Enrollment updated.", { id: toastId, duration: 5000 });
          // Changing a pending record's status here skips Approve/Reject, so refresh
          // the pending counts too.
          refreshPendingApprovalsIfAffected([initialData.training_status]);
        } catch (err) {
          onEnrollmentsCacheUpdate(batchInfo.batch_id, () => snapshot);
          toast.error(err.response?.data?.error || "Failed to update enrollment — please try again.", { id: toastId, duration: 5000 });
        }
        return;
      } else if (deferSave) {
        // deferSave: give the rows to the parent; it saves them after the batch is
        // created. No message yet, because nothing is saved yet.
        onStage(staged);
        onClose();
        return;
      } else {
        // Show the new rows at once with temporary ids. Email and manager email come
        // from the search result.
        const tempRecords = staged.map((r, idx) => {
          const nominator = r.nominatedByEmp || defaultNominator;
          return {
            employee_training_id: `temp-${Date.now()}-${idx}`,
            employee_id: Number(r.emp.id),
            employee_name: r.emp.name,
            emp_id: r.emp.emp_id,
            department: r.emp.department,
            email: r.emp.email,
            manager_email: r.emp.manager_email,
            training_status: r.training_status || PREVIEW_AUTO_STATUS,
            status_remarks: r.status_remarks || "",
            nominated_by: nominatedByValue(nominator, defaultNominator, r.emp) || "",
          };
        });
        // Add them at the top, because the backend sends the newest first.
        const snapshot = onEnrollmentsCacheUpdate(batchInfo.batch_id, (prev) => [...tempRecords, ...prev]);
        onSaved(tempRecords.length);
        onClose();

        const toastId = toast.loading("Enrolling employees...", { duration: Infinity });
        try {
          const trainings = staged.map((r) => {
            const nominator = r.nominatedByEmp || defaultNominator;
            return {
              employee_id: Number(r.emp.id),
              area: batchInfo.area_name,
              subarea: batchInfo.sub_area_name,
              module: batchInfo.module_name,
              batch_num: batchInfo.batch_num,
              ...(nominator ? { nominated_by: nominatedByValue(nominator, defaultNominator, r.emp) } : {}),
              // No start date is sent, so the backend sets "Not Started" unless a status
              // is chosen.
              ...(r.training_status ? { training_status: r.training_status } : {}),
              ...(r.status_remarks ? { status_remarks: r.status_remarks } : {}),
            };
          });
          const res = await addTrainingBatch(adminId, trainings);
          const created = res?.summary?.created ?? 0;
          const skipped = res?.summary?.already_exists ?? 0;

          // Replace temporary ids with real ones for rows that were "created"; remove
          // rows that came back "already_exists" or "error". The backend counts rows
          // from 1, but our list counts from 0, so add 1.
          const resultsByIndex = new Map((res?.results || []).map((entry) => [entry.index, entry]));
          let removedForDedup = 0;
          onEnrollmentsCacheUpdate(batchInfo.batch_id, (prev) => prev.flatMap((e) => {
            const tempIdx = tempRecords.findIndex((t) => t.employee_training_id === e.employee_training_id);
            if (tempIdx === -1) return [e];
            const result = resultsByIndex.get(tempIdx + 1);
            if (result?.status === "created") return [{ ...e, employee_training_id: result.employee_training_id }];
            removedForDedup++;
            return [];
          }));
          if (removedForDedup > 0) onSaved(-removedForDedup);

          toast.success(`${created} enrolled${skipped ? `, ${skipped} already existed` : ""}.`, { id: toastId, duration: 5000 });
          // Add can also set "Pending Approval" directly, so refresh the pending counts.
          refreshPendingApprovalsIfAffected(staged.map((r) => r.training_status));
        } catch (err) {
          onEnrollmentsCacheUpdate(batchInfo.batch_id, () => snapshot);
          onSaved(-tempRecords.length);
          toast.error(err.response?.data?.error || "Failed to enroll employees — please try again.", { id: toastId, duration: 5000 });
        }
        return;
      }
    } finally {
      savingGuard.unlock();
      setSaving(false);
    }
  };

  if (!open) return null;

  // The panel opens inside the page (not a popup). Edit has no search box.
  return (
    /* No overflow-hidden here: it cut off the search dropdown. The header and
       footer round their own corners instead. */
    <div
      className="mt-2 rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-900/10"
      aria-label={isEdit ? "Edit enrollment" : "Add employees to this batch"}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 rounded-t-lg border-b border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20">
        <p className="text-xs font-semibold text-sky-700 dark:text-sky-300">{isEdit ? "Edit Enrollment" : "Add Employees"}</p>
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="p-1 rounded-md hover:bg-sky-100 dark:hover:bg-sky-900/40 text-sky-500 dark:text-sky-400 transition-colors disabled:opacity-50"
          aria-label={isEdit ? "Close edit enrollment panel" : "Close add employees panel"}
        >
          <FiX className="h-4 w-4" />
        </button>
      </div>

      {/* Body: search + table (add), or just the table (edit) */}
      <div className="p-3 space-y-3">
        {/* Employee search box, full width (add only). */}
        {!isEdit && (
          <div>
            <label className="block text-[10px] font-medium text-gray-600 dark:text-gray-300 mb-1">
              Search Employee
            </label>
            <div className="max-w-sm">
              <EmployeeSearchField
                autoFocus
                onSelect={handleStage}
                placeholder="Search employee…"
                getBadge={(emp) =>
                  enrolledIds?.has(emp.id)
                    ? { label: "Enrolled", className: "shrink-0 text-[10px] font-medium text-gray-400 dark:text-gray-500" }
                    : stagedIds.has(emp.id)
                      ? { label: "Added", className: "shrink-0 text-[10px] font-medium text-green-600 dark:text-green-400" }
                      : null
                }
              />
            </div>
          </div>
        )}

        {/* Picked employees show here to check before saving. In edit mode there is
            one locked row with the current values. */}
        {staged.length === 0 ? (
          <p className="text-[11px] text-gray-500 dark:text-gray-400 px-0.5 py-1">
            {deferSave
              ? "Search above and pick employees — they'll appear here for review, and are saved automatically when you save the batch."
              : "Search above and pick employees — they'll appear here for review before saving. Add as many as you need before hitting Enroll."}
          </p>
        ) : (
          // No overflow-x-auto here: it cut off the Nominated By dropdown. The header
          // cells round their own corners instead.
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
            <table className="w-full table-fixed text-xs text-left">
              <thead className="bg-gray-50 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700">
                <tr className="text-[10px] font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                  <th className="px-3 py-1.5 rounded-tl-lg w-[30%]">Employee</th>
                  <th className="px-3 py-1.5 w-[18%]">Training Status</th>
                  <th className={`px-3 py-1.5 w-[18%] ${isEdit ? "rounded-tr-lg" : ""}`}>Status Remark</th>
                  <th className="pl-10 pr-3 py-1.5 w-[22%]">Nominated By</th>
                  {!isEdit && <th className="px-3 py-1.5 text-right rounded-tr-lg w-[12%]">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {staged.map((s, idx) => (
                  <EmployeeRow
                    key={s.emp.id}
                    row={s}
                    idx={idx}
                    onFieldChange={setStagedField}
                    onRemove={removeRow}
                    locked={isEdit}
                    showTrainingStatus={isEdit}
                    previewStatus={!isEdit ? PREVIEW_AUTO_STATUS : null}
                    trainingStatusOptions={trainingStatusOptions}
                    trainingStatusState={trainingStatusState}
                    existingNominators={existingNominators}
                    defaultNominator={defaultNominator}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-b-lg border-t border-sky-200 dark:border-sky-800 bg-sky-50/60 dark:bg-sky-900/10">
        <span className="text-[11px] text-gray-500 dark:text-gray-400">
          {!isEdit && staged.length > 0 ? `${staged.length} employee${staged.length !== 1 ? "s" : ""} selected` : ""}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          {/* No Enroll button when adding inside the Create/Edit batch form: the rows
              are saved by that form's Save button. */}
          {(isEdit || !deferSave) && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || staged.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors disabled:opacity-50"
            >
              {saving && (
                <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              )}
              {saving ? (isEdit ? "Saving…" : "Enrolling…") : isEdit ? "Save Changes" : `Enroll${staged.length ? ` (${staged.length})` : ""}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Expanded enrollment sub-table for a single batch ── */
// Rows approved/rejected in this visit (see BatchTable.jsx's reviewedByBatch).
const REVIEWED_ROW_CLASS = {
  approved: "bg-green-50/60 dark:bg-green-900/10",
  rejected: "bg-rose-50/60 dark:bg-rose-900/10",
};

export default function BatchEnrollmentPanel({
  batchId, batchInfo, addOpen, onAddClose, onEnrollmentChange,
  // Shared enrollment data from BatchTable. All optional; without them this
  // table loads its own data.
  cachedEnrollments, hasEnrollmentsError, onFetchEnrollments, onEnrollmentsCacheUpdate, onInvalidateEnrollments,
  // The page search text, passed only when the match is an employee inside
  // this batch, so that employee's row can be highlighted.
  highlightQuery = "",
  reviewedDecisions,
  // Used by the Edit batch form: rows are kept and saved with the batch.
  // By default, rows are saved at once.
  deferSave = false, onStage, initialStaged = EMPTY_STAGED,
}) {
  const { user } = useAuth();
  const { trainingStatusOptions } = useTrainingReferenceData();
  const { refreshPendingApprovalsIfAffected } = useManagerApprovals();
  const { can } = useBatchPermissions();
  const canEditEnrollment = can(BATCH_ACTIONS.EDIT_ENROLLMENT);
  const canDeleteEnrollment = can(BATCH_ACTIONS.DELETE_ENROLLMENT);
  const { canViewAll: canViewAllEnrollments, filterVisible } = useVisibleEnrollments();
  const [enrollments, setEnrollments] = useState(cachedEnrollments || []);
  const [loading, setLoading] = useState(!cachedEnrollments);
  // True only when loading failed (an empty list is a normal result).
  const [loadError, setLoadError] = useState(false);
  const [editTarget, setEditTarget] = useState(null); // enrollment being edited, or null
  const [deletingId, setDeletingId] = useState(null);
  const deleteGuard = useSubmitGuard(); // stops a double click on "Yes"
  const [detailId, setDetailId] = useState(null); // row with "More details" open

  // Filters and page number for this table only.
  const [filters, setFilters] = useState({ search: "", status: [] });
  const [page, setPage] = useState(1);
  const totalCols = 6;
  // The search box starts open if a search is already set, so the text is
  // not hidden.
  const [employeeSearchOpen, setEmployeeSearchOpen] = useState(() => Boolean(filters.search.trim()));

  // Add and Edit use the same panel, so opening Add closes Edit.
  useEffect(() => { if (addOpen) setEditTarget(null); }, [addOpen]);
  const editPanelRef = useScrollIntoViewOnOpen(editTarget);

  // Copy the shared enrollment data into this table whenever it changes.
  useEffect(() => {
    if (!onFetchEnrollments) return;
    if (cachedEnrollments) {
      setEnrollments(cachedEnrollments);
      setLoading(false);
      setLoadError(false);
    } else if (hasEnrollmentsError) {
      // The shared load failed, so stop the spinner and show the error.
      setLoading(false);
      setLoadError(true);
    }
  }, [cachedEnrollments, hasEnrollmentsError, onFetchEnrollments]);

  const load = useCallback(async () => {
    if (onFetchEnrollments) {
      // Already loaded by someone else; the effect above fills the table.
      if (cachedEnrollments) { setLoading(false); return; }
      setLoading(true);
      setLoadError(false);
      onFetchEnrollments([batchId]);
      return;
    }
    // No shared data given: load it here.
    setLoading(true);
    try {
      const results = await fetchBatchEnrollments(batchId);
      setEnrollments(results);
      setLoadError(false);
    } catch {
      toast.error("Failed to load enrollments.");
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [batchId, onFetchEnrollments, cachedEnrollments]);

  useEffect(() => { load(); }, [load]);

  // Load fresh data after a save (or a normal load if there is no shared data).
  const reload = useCallback(() => {
    if (onFetchEnrollments) {
      onInvalidateEnrollments?.(batchId);
      setLoading(true);
      setLoadError(false);
      onFetchEnrollments([batchId]);
    } else {
      load();
    }
  }, [batchId, onFetchEnrollments, onInvalidateEnrollments, load]);

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));
  const clearFilters = () => setFilters({ search: "", status: [] });
  const hasFilters = Boolean(filters.search || filters.status.length);

  // nominated_by names used by other rows in this batch (no server call).
  const existingNominators = useMemo(() => {
    const others = editTarget ? enrollments.filter((e) => e.employee_training_id !== editTarget.employee_training_id) : enrollments;
    return [...new Set(others.map((e) => e.nominated_by).filter(Boolean))].sort();
  }, [enrollments, editTarget]);

  // Users who are not admin/dept/hr see only their own and their direct
  // reports' rows (see enrollmentVisibility.js).
  const visibleEnrollments = useMemo(
    () => filterVisible(enrollments),
    [enrollments, filterVisible]
  );

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return visibleEnrollments.filter((e) => {
      if (q) {
        const hay = `${e.employee_name || ""} ${e.emp_id || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.status.length && !filters.status.some((s) => s.toLowerCase() === (e.training_status || "").toLowerCase())) return false;
      return true;
    });
  }, [visibleEnrollments, filters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ENROLLMENTS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * ENROLLMENTS_PER_PAGE, safePage * ENROLLMENTS_PER_PAGE);
  const showPagination = filtered.length > ENROLLMENTS_PER_PAGE;

  const filterChips = [];
  if (filters.search) filterChips.push({ key: "search", label: `Search: ${filters.search}`, clear: () => setFilter("search", "") });
  filters.status.forEach((s) => filterChips.push({
    key: `status:${s}`,
    label: `Training Status: ${s}`,
    clear: () => setFilter("status", filters.status.filter((v) => v !== s)),
  }));

  // Filtering goes back to page 1.
  useEffect(() => { setPage(1); }, [filters]);

  // Remove the row at once and delete it in the background. If it fails, put
  // the row back and show a message. onEnrollmentChange(-1) lowers the batch's
  // count on screen.
  const handleDeleteEnrollment = async (enrollment) => {
    if (deleteGuard.isLocked()) return;
    const adminId = getCurrentEmployeeId(user);
    if (!adminId) { toast.error("User not identified."); return; }
    deleteGuard.lock();

    const originalIndex = enrollments.findIndex((e) => e.employee_training_id === enrollment.employee_training_id);
    const withoutRemoved = enrollments.filter((e) => e.employee_training_id !== enrollment.employee_training_id);
    setEnrollments(withoutRemoved);
    onEnrollmentsCacheUpdate?.(batchId, withoutRemoved); // keep the shared data the same
    setDeletingId(null);
    onEnrollmentChange?.(-1);

    const toastId = toast.loading("Removing enrollment...", { duration: Infinity });
    try {
      await deleteTraining({ id: enrollment.employee_training_id, admin_id: adminId });
      toast.success("Enrollment removed.", { id: toastId, duration: 5000 });
      // Pending counts come from another context, so refresh them if this record
      // was pending.
      refreshPendingApprovalsIfAffected([enrollment.training_status]);
    } catch (err) {
      let restored;
      setEnrollments((prev) => {
        if (prev.some((e) => e.employee_training_id === enrollment.employee_training_id)) { restored = prev; return prev; }
        const next = [...prev];
        next.splice(Math.min(originalIndex, next.length), 0, enrollment);
        restored = next;
        return next;
      });
      onEnrollmentsCacheUpdate?.(batchId, restored);
      onEnrollmentChange?.(1);
      toast.error(err.response?.data?.error || "Failed to remove enrollment — please try again.", { id: toastId, duration: 5000 });
    } finally {
      deleteGuard.unlock();
    }
  };

  return (
    <div className="pt-3 pb-1">
      {loading ? (
        <div className="text-xs text-gray-400 dark:text-gray-500 py-3 flex items-center gap-1.5">
          <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
          </svg>
          Loading enrollments…
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center justify-center gap-1.5 py-4 text-center text-xs">
          <p className="text-gray-500 dark:text-gray-400">Couldn't load enrollments.</p>
          <button type="button" onClick={reload} className="text-blue-600 dark:text-blue-400 hover:underline">
            Retry
          </button>
        </div>
      ) : (
        <>
          {/* Add/Edit panel, shown right under the header (add) or the row (edit). */}
          <div ref={editPanelRef} id={`addemp-${batchId}`}>
            <EnrollmentPanel
              open={addOpen || !!editTarget}
              mode={editTarget ? "edit" : "add"}
              initialData={editTarget}
              batchInfo={batchInfo}
              enrolledIds={new Set(enrollments.map((e) => e.employee_id))}
              onClose={() => { if (editTarget) setEditTarget(null); else onAddClose(); }}
              // Saves already update the shared data, so no reload is needed.
              onSaved={(delta) => { onEnrollmentChange?.(delta); }}
              deferSave={deferSave}
              onStage={onStage}
              initialStaged={initialStaged}
              existingNominators={existingNominators}
              onEnrollmentsCacheUpdate={onEnrollmentsCacheUpdate}
            />
          </div>

          {/* Filter chips, shown only when a filter is on. */}
          {filterChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              {filterChips.map((chip) => (
                <span key={chip.key} className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 pl-2.5 pr-1 py-0.5 text-[11px]">
                  {chip.label}
                  <button type="button" onClick={chip.clear} aria-label={`Remove ${chip.label} filter`} className="p-0.5 rounded-full hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors">
                    <FiX className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <button type="button" onClick={clearFilters} className="text-[11px] text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 ml-1">
                Clear all
              </button>
            </div>
          )}

          {/* The table shows 8 rows per page, so it needs no scrollbar. Filter icons
              are in the column headers. */}
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 mb-2">
            <table className="w-full table-fixed text-xs text-left">
              <thead className="bg-gray-50 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700">
                {/* Fixed column widths (table-fixed). No filter icons when the user can
                    see only one row (their own). */}
                <tr className="text-[10px] font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                  <th className="px-3 py-2 w-[18%]">
                    {canViewAllEnrollments ? (
                      <span className="inline-flex items-center gap-1 normal-case">
                        {!employeeSearchOpen && <span className="uppercase">Employee</span>}
                        <SearchToggle
                          value={filters.search}
                          onChange={(v) => setFilter("search", v)}
                          open={employeeSearchOpen}
                          onOpenChange={setEmployeeSearchOpen}
                          placeholder="Search employee…"
                          ariaLabel="Filter enrollments by employee name or ID"
                          size="compact"
                        />
                      </span>
                    ) : (
                      "Employee"
                    )}
                  </th>
                  <th className="px-3 py-2 w-[16%]">Manager Email</th>
                  <th className="px-3 py-2 w-[16%]">
                    <span className="inline-flex items-center gap-1 normal-case">
                      <span>Training Status</span>
                      {canViewAllEnrollments && (
                        <ColumnFilterIcon
                          mode="multiple"
                          label="training status"
                          options={trainingStatusOptions}
                          value={filters.status}
                          count={filters.status.length}
                          onChange={(values) => setFilter("status", values)}
                        />
                      )}
                    </span>
                  </th>
                  <th className="px-3 py-2 w-[18%]">Status Remark</th>
                  <th className="pl-10 pr-3 py-2 w-[16%]">Nominated By</th>
                  <th className="px-3 py-2 w-[16%] text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={totalCols} className="px-3 py-6 text-center text-gray-500 dark:text-gray-400">
                      <FiUsers className="h-4 w-4 mx-auto mb-1 opacity-40" />
                      {hasFilters ? (
                        <>
                          No enrollments match these filters
                          <button type="button" onClick={clearFilters} className="block mx-auto mt-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline">
                            Clear filters
                          </button>
                        </>
                      ) : canViewAllEnrollments ? (
                        "No employees enrolled yet"
                      ) : (
                        "You are not enrolled in this batch"
                      )}
                    </td>
                  </tr>
                ) : paged.map((enr) => {
                  const deleting = deletingId === enr.employee_training_id;
                  const detailOpen = detailId === enr.employee_training_id;
                  const editOpen = editTarget?.employee_training_id === enr.employee_training_id;
                  const rowClickable = !deleting;
                  const toggleDetail = () => setDetailId((id) => (id === enr.employee_training_id ? null : enr.employee_training_id));
                  // This row matched the search. Screen readers are told, because they cannot
                  // see the highlight.
                  const searchMatch = enrollmentMatchesSearch(enr, highlightQuery);
                  const reviewedRowClass = REVIEWED_ROW_CLASS[reviewedDecisions?.get(String(enr.employee_training_id))];
                  return (
                    <React.Fragment key={enr.employee_training_id}>
                    <tr
                      onClick={rowClickable ? toggleDetail : undefined}
                      onKeyDown={rowClickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleDetail(); } } : undefined}
                      tabIndex={rowClickable ? 0 : undefined}
                      role={rowClickable ? "button" : undefined}
                      aria-expanded={rowClickable ? detailOpen : undefined}
                      aria-label={`${rowClickable ? `${detailOpen ? "Hide" : "View"} details for` : ""} ${enr.employee_name || enr.emp_id}${searchMatch ? " — matches your search" : ""}`}
                      className={`transition-colors ${rowClickable ? "cursor-pointer" : ""} ${deleting ? "bg-red-50/60 dark:bg-red-900/10" : editOpen || detailOpen ? "bg-blue-50/40 dark:bg-blue-900/10" : reviewedRowClass || "hover:bg-gray-50/50 dark:hover:bg-gray-800/20"}`}
                    >
                      <td className="px-3 py-1.5">
                        <div className={`font-medium ${detailOpen && rowClickable ? "text-blue-700 dark:text-blue-400" : "text-gray-900 dark:text-gray-100"}`}>
                          <HighlightMatch text={enr.employee_name || ""} query={highlightQuery} />
                        </div>
                        {enr.emp_id && (
                          <div className="text-[10px] text-gray-500 dark:text-gray-400">
                            <HighlightMatch text={enr.emp_id} query={highlightQuery} />
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        {enr.manager_email && (
                          // stop keyDown, so Enter copies the value instead of opening the row
                          <div className="group flex items-center gap-1 min-w-0 text-gray-600 dark:text-gray-300" onKeyDown={(e) => e.stopPropagation()}>
                            <span className="truncate" title={enr.manager_email}>{enr.manager_email}</span>
                            <CopyButton text={enr.manager_email} label="Copy manager email" />
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        <EnrollmentStatusBadge status={enr.training_status} />
                      </td>
                      <td className="px-3 py-1.5">
                        {enr.status_remarks && (
                          <span
                            className="block truncate text-gray-600 dark:text-gray-300"
                            title={enr.status_remarks}
                          >
                            <HighlightMatch text={enr.status_remarks} query={highlightQuery} />
                          </span>
                        )}
                      </td>
                      <td className="pl-10 pr-3 py-1.5">
                        {enr.nominated_by && (
                          <span
                            className="block truncate text-gray-600 dark:text-gray-300"
                            title={enr.nominated_by}
                          >
                            {/* Shown as saved. The saving code already writes the final text
                                ("Self nomination", or the reviewer's name). */}
                            {enr.nominated_by}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                          {deleting ? (
                            <>
                              <span className="text-[10px] text-red-600 dark:text-red-400 font-medium mr-1">Remove?</span>
                              <button type="button" onClick={() => handleDeleteEnrollment(enr)} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-white bg-red-600 hover:bg-red-700">
                                <FiCheck className="h-3 w-3" /> Yes
                              </button>
                              <button type="button" onClick={() => setDeletingId(null)} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
                                No
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => setDetailId((id) => (id === enr.employee_training_id ? null : enr.employee_training_id))}
                                aria-expanded={detailId === enr.employee_training_id}
                                aria-controls={`enr-detail-${enr.employee_training_id}`}
                                title={detailId === enr.employee_training_id ? "Hide details" : "View full details"}
                                className={`p-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors ${detailId === enr.employee_training_id ? "text-blue-600 dark:text-blue-400" : "text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"}`}
                                aria-label={`View full details for ${enr.employee_name}`}
                              >
                                <FiInfo className="h-3 w-3" />
                              </button>
                              {canEditEnrollment && (
                                <button
                                  type="button"
                                  onClick={() => setEditTarget(enr)}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium hover:bg-blue-50 dark:hover:bg-blue-900/20 ${editOpen ? "text-blue-700 dark:text-blue-300" : "text-blue-600 dark:text-blue-400"}`}
                                  aria-label={`Edit enrollment for ${enr.employee_name}`}
                                >
                                  <FiEdit2 className="h-3 w-3" /> Edit
                                </button>
                              )}
                              {canDeleteEnrollment && (
                                <button
                                  type="button"
                                  onClick={() => setDeletingId(enr.employee_training_id)}
                                  className="p-1 rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                                  title="Remove from batch"
                                  aria-label={`Remove ${enr.employee_name} from batch`}
                                >
                                  <FiTrash2 className="h-3 w-3" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Row details panel, same color as its row so they look like one block. */}
                    {detailId === enr.employee_training_id && (
                      <tr className="bg-blue-50/40 dark:bg-blue-900/10 border-b border-blue-200 dark:border-blue-800">
                        <td colSpan={totalCols} className="p-0">
                          <div className="ml-3 pl-3 border-l-2 border-blue-300 dark:border-blue-700">
                            <DetailPanel
                              id={`enr-detail-${enr.employee_training_id}`}
                              title={enr.employee_name || enr.emp_id}
                              sections={ENROLLMENT_DETAIL_SECTIONS}
                              data={enr}
                              onClose={() => setDetailId(null)}
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* "Employees X–Y of Z"; page buttons only when there is more than one page. */}
          {filtered.length > 0 && (
            <div className="flex items-center justify-between mb-2 text-[11px] text-gray-500 dark:text-gray-400">
              <span aria-live="polite">
                Employees {(safePage - 1) * ENROLLMENTS_PER_PAGE + 1}–{Math.min(safePage * ENROLLMENTS_PER_PAGE, filtered.length)} of {filtered.length}
              </span>
              {showPagination && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    className="px-2 py-0.5 rounded border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    aria-label="Previous page of enrollments"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <span className="px-1.5 tabular-nums">{safePage} / {totalPages}</span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage >= totalPages}
                    className="px-2 py-0.5 rounded border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    aria-label="Next page of enrollments"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
