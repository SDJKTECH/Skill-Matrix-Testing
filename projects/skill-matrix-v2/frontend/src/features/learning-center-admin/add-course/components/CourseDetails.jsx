import { createElement } from "react";
import {
  FiAlertCircle,
  FiBookOpen,
  FiEdit2,
  FiEye,
  FiShield,
} from "react-icons/fi";
import { FOCUS_RING } from "../../../shared/config/focusRing";
import { COURSE_CARD_ICONS } from "../../components/courseCardIcons";
// Uncomment this import and the JSX alternative below to use the popup card-icon picker.
// import CourseCardIconPicker from "./CourseCardIconPicker";
 // Uncomment this import and the JSX alternative below to use the popup card-icon picker.
// import CourseCardIconPicker from "./CourseCardIconPicker";

const inputClass =
  "w-full rounded-lg border bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60";
 
const borderFor = (error) =>
  error ? "border-red-400 dark:border-red-500" : "border-gray-200 dark:border-gray-700";
 
function Field({ label, htmlFor, hint, required = false, className = "", children }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={htmlFor} className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">
        {label}
        {required && <span className="ml-1 text-red-600" aria-hidden="true">*</span>}
        {required && <span className="ml-1 text-red-600" aria-hidden="true">*</span>}
      </label>
      {children}
      {hint && <span className="text-[10px] text-gray-400 dark:text-gray-500">{hint}</span>}
    </div>
  );
}

const COURSE_TYPES = [
  { key: "training", label: "Training", icon: FiBookOpen,  },
  { key: "policy", label: "Policy", icon: FiShield,  },
];
 
export function CourseVisibility({ values, onChange, lessonCount = 0, disabled = false }) {
  const options = [
    { value: false, label: "Draft", description: "Hidden. Finish later.", icon: FiEdit2 },
    { value: true, label: "Published", description: "Visible to employees.", icon: FiEye },
  ];
 
  return (
    <section className="flex flex-col gap-1.5 rounded-xl border border-gray-200 bg-white p-2 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Who can see it?</h2>
        <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
          Choose whether employees can find this course in their catalog.
        </p>
      </div>
      <div role="radiogroup" aria-label="Course visibility" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map(({ value, label, description, icon: OptionIcon }) => {
          const selected = values.isVisible === value;
          return (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange("isVisible", value)}
              className={`flex min-h-14 items-start gap-2 rounded-lg border p-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING} ${
                selected
                  ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500 dark:bg-blue-900/20"
                  : "border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700/50"
              }`}
            >
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                selected
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300"
              }`}>
                {createElement(OptionIcon, {
                  className: "h-3.5 w-3.5",
                  "aria-hidden": true,
                })}
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-gray-900 dark:text-white">{label}</span>
                <span className="mt-0.5 block text-[11px] text-gray-500 dark:text-gray-400">{description}</span>
              </span>
              <span className={`ml-auto mt-1 h-4 w-4 shrink-0 rounded-full border-2 ${
                selected ? "border-blue-600 bg-blue-600 shadow-[inset_0_0_0_3px_white]" : "border-gray-300 dark:border-gray-600"
              }`} aria-hidden="true" />
            </button>
          );
        })}
      </div>
      {values.isVisible && lessonCount === 0 && (
        <p role="status" className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-[10px] text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
          <FiAlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Visible but no lessons yet — employees would see an empty course.
        </p>
      )}
    </section>
  );
}
 
export default function CourseDetails({
  values,
  onChange,
  errors = {},
  lessonMinutes = 0,
  lessonCount = 0,
  disabled = false,
  showVisibility = true,
}) {
  const activeType = COURSE_TYPES.find((t) => t.key === values.courseType);
  const activeIcon =
    COURSE_CARD_ICONS.find((icon) => icon.key === values.cardIcon) ||
    COURSE_CARD_ICONS[0];
  const durationHint =
    lessonCount > 0 && String(lessonMinutes) !== String(values.duration)
      ? `Overridden — lessons add up to ${lessonMinutes} min.`
      : "Total of all lessons. Edit to override.";

  return (
    <div className="grid min-w-0 grid-cols-1 items-start gap-2 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <section className="flex min-w-0 flex-col gap-2 rounded-xl border border-gray-200 bg-white p-2 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Course Details</h2>
 
        <div className="grid gap-x-3 gap-y-2 sm:grid-cols-[minmax(0,1fr)_13rem]">
          <div className="flex min-w-0 flex-col gap-2">
            <Field label="Title" htmlFor="course-title" required>
              <input
                id="course-title"
                type="text"
                value={values.title}
                placeholder="e.g. Information Security Awareness"
                disabled={disabled}
                required
                maxLength={150}
                onChange={(e) => onChange("title", e.target.value)}
                aria-invalid={Boolean(errors.title)}
                className={`${inputClass} ${borderFor(errors.title)}`}
              />
            </Field>
 
            <Field label="Description" htmlFor="course-description" hint="Optional — a sentence or two on what employees will learn.">
              <textarea
                id="course-description"
                rows={4}
                value={values.description}
                placeholder="What will employees learn in this course?"
                disabled={disabled}
                onChange={(e) => onChange("description", e.target.value)}
                className={`${inputClass} ${borderFor()} resize-none`}
              />
            </Field>
          </div>
 
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-col gap-1">
              <span id="course-type-label" className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">
                Course Type
              </span>
              <div role="radiogroup" aria-labelledby="course-type-label" className="flex flex-wrap gap-2">
                {COURSE_TYPES.map((type) => {
                  const active = type.key === values.courseType;
                  return (
                    <button
                      key={type.key}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={disabled}
                      onClick={() => onChange("courseType", type.key)}
                      className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING} ${
                        active
                          ? "border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
                          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                      }`}
                    >
                      <type.icon className="h-3.5 w-3.5" aria-hidden="true" />
                      {type.label}
                    </button>
                  );
                })}
              </div>
              {activeType && <span className="text-[10px] text-gray-400 dark:text-gray-500">{activeType.hint}</span>}
            </div>
 
            <Field label="DT / NDT" htmlFor="course-class" >
              <select
                id="course-class"
                value={values.courseClass}
                disabled={disabled}
                onChange={(e) => onChange("courseClass", e.target.value)}
                className={`${inputClass} ${borderFor()}`}
              >
                <option value="">Not set</option>
                <option value="DT">DT · Digital Training</option>
                <option value="NDT">NDT · Non-Digital Training</option>
              </select>
            </Field>
 
            <Field label="Version" htmlFor="course-version" >
              <input
                id="course-version"
                type="text"
                value={values.version}
                placeholder="1.0"
                disabled={disabled}
                maxLength={10}
                onChange={(e) => onChange("version", e.target.value)}
                aria-invalid={Boolean(errors.version)}
                className={`${inputClass} ${borderFor(errors.version)}`}
              />
            </Field>

            <Field
              label="Duration (minutes)"
              htmlFor="course-duration"
              hint={durationHint}
            >
              <input
                id="course-duration"
                type="number"
                min="0"
                value={values.duration}
                placeholder="Calculated from lessons"
                disabled={disabled}
                onChange={(e) => onChange("duration", e.target.value)}
                aria-invalid={Boolean(errors.duration)}
                className={`${inputClass} ${borderFor(errors.duration)}`}
              />
            </Field>
          </div>
        </div>
 
        {showVisibility && (
          <div className="border-t border-gray-100 pt-3 dark:border-gray-700">
            <CourseVisibility
              values={values}
              onChange={onChange}
              lessonCount={lessonCount}
              disabled={disabled}
            />
          </div>
        )}
      </section>
 
      <section className="flex min-w-0 flex-col gap-2 rounded-xl border border-gray-200 bg-white p-2 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Card Icon</h2>
        <div className="flex items-center gap-3">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white" aria-hidden="true">
            <activeIcon.icon className="h-7 w-7" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white">{activeIcon.label}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Shown on the course card.</p>
          </div>
        </div>
        <Field label="Choose icon" htmlFor="course-card-icon">
          <select
            id="course-card-icon"
            value={activeIcon.key}
            disabled={disabled}
            onChange={(e) => onChange("cardIcon", e.target.value)}
            className={`${inputClass} ${borderFor()}`}
          >
            {COURSE_CARD_ICONS.map((icon) => (
              <option key={icon.key} value={icon.key}>{icon.label}</option>
            ))}
          </select>
        </Field>
      </section>
    </div>
  );
}
