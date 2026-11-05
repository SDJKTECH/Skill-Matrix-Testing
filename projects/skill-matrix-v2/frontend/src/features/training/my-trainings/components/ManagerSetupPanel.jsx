import React, { useState } from "react";
import { FiAlertCircle } from "react-icons/fi";
import EmployeeSearchField from "../../shared/components/EmployeeSearchField";
import { FOCUS_RING } from "../../shared/config/focusRing";
import { useAuth } from "../../../../hooks/useAuth";

const SELF_BADGE = { label: "You", className: "shrink-0 text-[10px] text-gray-400" };

/** Asks for a manager before a nomination, since the request email goes to them.
 * Once saved, `user.managerEmail` is filled and the parent shows the note box. */
export default function ManagerSetupPanel({ onCancel }) {
  const { user, updateManagerEmail } = useAuth();
  const [manager, setManager] = useState(null);
  const [saving, setSaving] = useState(false);
  const myEmail = (user?.mail || user?.userPrincipalName || "").toLowerCase();

  // updateManagerEmail shows its own success/error toasts.
  const handleSave = async () => {
    setSaving(true);
    try {
      await updateManagerEmail(manager.email);
    } finally {
      setSaving(false);
    }
  };

  return (
    // Escape cancels, like the note panel. The first Escape only closes
    // the search dropdown.
    <div
      onKeyDown={(e) => { if (e.key === "Escape" && !saving) onCancel?.(); }}
      className="mt-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/10 p-2.5"
    >
      <p className="flex items-start gap-1.5 text-xs text-gray-700 dark:text-gray-200 mb-1.5">
        <FiAlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
        <span>Your reporting manager is missing. Add them (as in Keka) to continue — your request is sent to them for approval.</span>
      </p>
      <EmployeeSearchField
        value={manager}
        onSelect={setManager}
        getBadge={(emp) => ((emp.email || "").toLowerCase() === myEmail ? SELF_BADGE : null)}
        placeholder="Type name, ID, or email…"
        ariaLabel="Search reporting manager"
        autoFocus
      />
      <div className="flex justify-end gap-2 mt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className={`px-2.5 py-1 rounded-md text-[11px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${FOCUS_RING}`}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!manager?.email || saving}
          className={`px-2.5 py-1 rounded-md text-[11px] font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${FOCUS_RING}`}
        >
          {saving ? "Saving…" : "Save & continue"}
        </button>
      </div>
    </div>
  );
}
