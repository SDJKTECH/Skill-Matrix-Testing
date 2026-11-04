import React, { useEffect, useRef, useState } from "react";

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-gray-800";

// One color per action: approve is green, reject is red and a nomination
// request is blue, so the user can tell them apart quickly.
const TONE_STYLES = {
  approve: {
    panel: "border-green-200 dark:border-green-800 bg-green-50/60 dark:bg-green-900/10",
    ring: "focus-visible:ring-green-500",
    confirmBtn: "bg-green-600 hover:bg-green-700 text-white",
  },
  reject: {
    panel: "border-red-200 dark:border-red-800 bg-red-50/60 dark:bg-red-900/10",
    ring: "focus-visible:ring-red-500",
    confirmBtn: "bg-red-600 hover:bg-red-700 text-white",
  },
  request: {
    panel: "border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-900/10",
    ring: "focus-visible:ring-blue-500",
    confirmBtn: "bg-blue-600 hover:bg-blue-700 text-white",
  },
};

/**
 * A small text box with Confirm and Cancel buttons. It opens inside the page,
 * not as a popup. The user types an approve note, a reject reason or a
 * nomination note here. The parent decides the words and color. This part
 * only calls onSubmit(text) on Confirm, or onCancel() on Cancel.
 */
export default function InlineDecisionPanel({
  tone = "request",
  prompt,
  helper,
  fieldLabel,
  placeholder = "",
  required = false,
  minLength = 0,
  maxLength,
  confirmLabel = "Confirm",
  submittingLabel,
  cancelLabel = "Cancel",
  submitting = false,
  onSubmit,
  onCancel,
}) {
  const [value, setValue] = useState("");
  const textareaRef = useRef(null);
  const panelRef = useRef(null);
  const styles = TONE_STYLES[tone] || TONE_STYLES.request;

  // The panel shows only when the user opens it, so put the cursor in the box.
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const trimmed = value.trim();
  const overLimit = typeof maxLength === "number" && value.length > maxLength;
  const tooShort = required && (trimmed.length === 0 || (minLength > 0 && trimmed.length < minLength));
  const isValid = !tooShort && !overLimit && (required ? trimmed.length > 0 : true);

  const handleSubmit = () => {
    if (!isValid || submitting) return;
    onSubmit?.(trimmed || null);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel?.();
      return;
    }
    // Ctrl+Enter (Cmd+Enter on Mac) sends the note. Enter alone makes a new
    // line, because a note can be more than one line.
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      ref={panelRef}
      onKeyDown={handleKeyDown}
      className={`mt-2 rounded-lg border p-2.5 ${styles.panel}`}
    >
      {prompt && <p className="text-xs text-gray-700 dark:text-gray-200 mb-1.5">{prompt}</p>}
      {helper && <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-1.5">{helper}</p>}

      {fieldLabel && (
        <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
          {fieldLabel} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <textarea
        ref={textareaRef}
        rows={2}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2.5 py-1.5 text-sm text-gray-900 dark:text-gray-100 resize-none ${FOCUS_RING} ${styles.ring}`}
        aria-invalid={tooShort || overLimit}
      />

      <div className="flex items-center justify-between mt-1">
        <p className="text-[11px] text-gray-400 dark:text-gray-500">
          {required && minLength > 0
            ? `${trimmed.length}/${minLength} characters minimum`
            : typeof maxLength === "number"
              ? `${value.length}/${maxLength}`
              : ""}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${FOCUS_RING} focus-visible:ring-gray-400`}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid || submitting}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${FOCUS_RING} ${styles.ring} ${styles.confirmBtn}`}
          >
            {submitting && (
              <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            )}
            {submitting ? submittingLabel || "Submitting…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
