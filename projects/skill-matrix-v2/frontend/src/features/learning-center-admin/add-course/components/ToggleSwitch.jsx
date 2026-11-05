import { FOCUS_RING } from "../../../shared/config/focusRing";

export default function ToggleSwitch({ checked, onChange, disabled = false, labelledBy }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING} ${
        checked ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-4.5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
