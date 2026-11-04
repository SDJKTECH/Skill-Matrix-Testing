import React, { useId, useState } from "react";
import { FiAlertCircle, FiChevronDown } from "react-icons/fi";
import Collapse from "../../shared/components/Collapse";
import StatusPill from "../../shared/components/StatusPill";
import BatchLink from "../../shared/components/BatchLink";
import { FOCUS_RING } from "../../shared/config/focusRing";
import { ENROLLMENT_STATUS_ICONS } from "../../training-batch/services/trainingUtils";

const REASON_MIN_LENGTH = 5;
const REASON_MAX_LENGTH = 240;
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function validateReason(text) {
  const trimmed = text.trim();
  if (!trimmed) return "A reason is required.";
  if (trimmed.length < REASON_MIN_LENGTH) return `Please add a little more detail (at least ${REASON_MIN_LENGTH} characters).`;
  return null;
}

/**
 * Collapsible list of incomplete trainings on the nomination panel
 * (OpenEnrollmentGrid.jsx), each needing a delay reason before Submit.
 * `items` ({ id, name, batch, reason }) come ready from the parent; a
 * row's name links to its batch via `onViewBatch`. `blockSignal`
 * is a counter the parent bumps on a blocked Submit: the card then expands
 * and opens the first row missing a reason.
 */
export default function IncompleteTrainingCard({ items, totalCount, onSaveReason, blockSignal, onViewBatch }) {
  const bodyId = useId();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState(null);
  // A Submit blocked before this card mounted shouldn't expand it.
  const [mountSignal] = useState(blockSignal);
  const [seenSignal, setSeenSignal] = useState(blockSignal);
  const blocked = blockSignal !== mountSignal;
  const missing = items.filter((t) => !t.reason);

  const startEdit = (t) => {
    setEditingId(t.id);
    setDraft(t.reason || "");
    setError(null);
  };

  // New blocked Submit: expand and open the first row missing a reason.
  // Adjusted during render (React's recommended alternative to an effect).
  if (blockSignal !== seenSignal) {
    setSeenSignal(blockSignal);
    if (missing.length > 0) {
      setOpen(true);
      startEdit(missing[0]);
    }
  }

  if (items.length === 0) return null;

  const handleSave = () => {
    const err = validateReason(draft);
    if (err) {
      setError(err);
      return;
    }
    onSaveReason(editingId, draft.trim());
    setEditingId(null);
  };

  return (
    <div className="mt-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/10">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left rounded-lg cursor-pointer ${FOCUS_RING}`}
      >
        <FiAlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-gray-800 dark:text-gray-100">{items.length} of your {plural(totalCount, "training")} {items.length === 1 ? "is" : "are"} not completed yet</span>
          <span className="block text-[11px] text-gray-500 dark:text-gray-400">
            Please review your incomplete trainings and provide the reason for each.
          </span>
        </span>
        <FiChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {blocked && missing.length > 0 && (
        <p role="alert" className="px-3 pb-2 text-[11px] text-amber-800 dark:text-amber-300">
          Please add a reason for {plural(missing.length, "incomplete training")} first.
        </p>
      )}

      <Collapse open={open}>
        <ul id={bodyId} className="divide-y divide-amber-100 dark:divide-amber-900/40 px-3 pb-2">
          {items.map((t) => (
            <li key={t.id} className="py-2">
              <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
                <p className="min-w-0 flex-1 text-xs font-medium text-gray-800 dark:text-gray-100 line-clamp-2 break-words" title={t.name}>
                  {t.batch && onViewBatch ? (
                    <BatchLink batchNum={t.batch} onClick={onViewBatch}>
                      {t.name} (Batch {t.batch})
                    </BatchLink>
                  ) : t.name}
                </p>
                <StatusPill size="sm" status="Not Completed" icon={ENROLLMENT_STATUS_ICONS["not completed"]} />
              </div>

              {editingId === t.id ? (
                <div className="mt-1.5">
                  <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300">
                    Please share why this training wasn't completed <span className="text-red-500">*</span>
                    <textarea
                      autoFocus
                      rows={2}
                      required
                      maxLength={REASON_MAX_LENGTH}
                      value={draft}
                      onChange={(e) => {
                        setDraft(e.target.value);
                        if (error) setError(validateReason(e.target.value));
                      }}
                      placeholder="A short note helps your manager plan support."
                      aria-invalid={Boolean(error)}
                      className={`mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2.5 py-1.5 text-sm font-normal text-gray-900 dark:text-gray-100 resize-none ${FOCUS_RING}`}
                    />
                  </label>
                  {error && <p role="alert" className="mt-0.5 text-[11px] text-red-600 dark:text-red-400">{error}</p>}
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] text-gray-400 dark:text-gray-500">{draft.trim().length}/{REASON_MAX_LENGTH}</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer ${FOCUS_RING}`}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSave}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium bg-blue-600 hover:bg-blue-700 text-white cursor-pointer ${FOCUS_RING}`}
                      >
                        {t.reason ? "Update" : "Save"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
                  {t.reason ? (
                    <p className="min-w-0 flex-1 text-[11px] text-gray-600 dark:text-gray-300 break-words">
                      <span className="font-medium">Reason:</span> {t.reason}
                    </p>
                  ) : (
                    <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300">Reason required</span>
                  )}
                  <button
                    type="button"
                    onClick={() => startEdit(t)}
                    className={`text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer rounded ${FOCUS_RING}`}
                  >
                    {t.reason ? "Update" : "Help us understand the delay"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Collapse>
    </div>
  );
}
