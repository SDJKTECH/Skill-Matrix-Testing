import React from "react";

/**
 * Self/Manager view-mode control — shared between SelfDashboard.jsx (Home)
 * and ManagerDashboard.jsx so switching between the two pages shows the
 * exact same control, not two independently-styled toggles for the same
 * conceptual action. A small "View as" prefix names its purpose without
 * requiring the switch state to be read first; one dynamic label names
 * whichever mode is active instead of two static labels competing for
 * attention.
 *
 * Props: { value: "self"|"manager", onChange: (value) => void }
 */
export default function SelfManagerToggle({ value, onChange }) {
  // Named for the toggle's own position, not a person — this file has no
  // employee/user in scope at all, unlike the various user.isManager /
  // employee.isManager org-chart flags elsewhere in this feature area.
  const isManagerPosition = value === "manager";
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500">View as</span>

      <button
        type="button"
        role="switch"
        aria-checked={isManagerPosition}
        onClick={() => onChange(isManagerPosition ? "self" : "manager")}
        title={isManagerPosition ? "Switch to Self View" : "Switch to Manager View"}
        className={`relative flex items-center w-10 h-[22px] rounded-full shadow-inner focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 shrink-0 cursor-pointer transition-colors duration-300 ${
          isManagerPosition ? "bg-indigo-500" : "bg-gray-300 dark:bg-gray-600"
        }`}
      >
        <span
          className={`absolute top-[2px] left-[2px] w-[18px] h-[18px] rounded-full bg-white shadow-md transition-transform duration-300 ease-in-out ${
            isManagerPosition ? "translate-x-[18px]" : "translate-x-0"
          }`}
        />
      </button>

      <span className={`text-[11px] font-semibold w-14 ${isManagerPosition ? "text-indigo-600 dark:text-indigo-400" : "text-blue-600 dark:text-blue-400"}`}>
        {isManagerPosition ? "Manager" : "Self"}
      </span>
    </div>
  );
}
