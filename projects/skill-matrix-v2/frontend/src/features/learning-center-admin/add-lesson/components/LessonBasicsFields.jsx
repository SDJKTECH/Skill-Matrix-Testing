import React from "react";

const inputClass =
  "w-full rounded-lg border bg-white dark:bg-gray-900 px-3 py-2 text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500";

function Field({ label, error, className = "", children }) {
  return (
    <label className={`flex flex-col gap-1 text-[11px] font-semibold text-gray-700 dark:text-gray-300 ${className}`}>
      {label}
      {children}
      {error && <span className="text-[10px] font-normal text-red-500">{error}</span>}
    </label>
  );
}

const borderFor = (error) =>
  error ? "border-red-400 dark:border-red-500" : "border-gray-200 dark:border-gray-700";

export default function LessonBasicsFields({ form, errors, onChange }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_6rem_8rem] gap-3">
      <Field label="Lesson Title" error={errors.title}>
        <input
          value={form.title}
          onChange={(e) => onChange("title", e.target.value)}
          placeholder="e.g. Why Phishing Works"
          className={`${inputClass} ${borderFor(errors.title)}`}
        />
      </Field>

      <Field label="Sequence" error={errors.sequence}>
        <input
          type="number"
          min="1"
          value={form.sequence}
          onChange={(e) => onChange("sequence", e.target.value)}
          className={`${inputClass} ${borderFor(errors.sequence)}`}
        />
      </Field>

      <Field label="Duration" error={errors.duration}>
        <div className="relative">
          <input
            type="number"
            min="1"
            placeholder="e.g. 10"
            value={form.duration}
            onChange={(e) => onChange("duration", e.target.value)}
            className={`${inputClass} ${borderFor(errors.duration)} pr-9`}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">
            min
          </span>
        </div>
      </Field>
    </div>
  );
}