import React from "react";
import { useAddLesson } from "../hooks/UseAddLesson";
import LessonHeader from "./LessonHeader";
import LessonBasicsFields from "./LessonBasicsFields";
import CourseSelector from "./CourseSelector";
import MaterialTypeSelector from "./MaterialTypeSelector";
import MaterialContent from "./MaterialContent";

/**
 * Same props as before, plus `embedded`.
 *  - embedded=false (default): the original full page (breadcrumb header + form card).
 *  - embedded=true: compact version meant to sit INSIDE the white Lessons box of the
 *    course wizard. Fields on the left, upload / text area on the right (no divider),
 *    and the Cancel / Save Lesson buttons stay pinned at the top.
 */
export default function AddLessonPage({
  onBack,
  breadcrumbItems,
  initialForm,
  onSave,
  isEditing = false,
  courseName,
  embedded = false,
}) {
  const {
    form,
    errors,
    setField,
    setMaterialType,
    selectFile,
    removeFile,
    save,
  } = useAddLesson({ initialForm, onSaved: onSave });

  if (embedded) {
    return (
      // The [&_...] classes tighten the existing dropzone / text editor to fit the right column.
      <section className="flex max-h-full min-h-0 flex-col gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 [&_.py-8]:py-3 [&_.w-9]:h-7 [&_.w-9]:w-7 [&_button.mt-2]:mt-1 [&_textarea]:h-32">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
              {isEditing ? "Edit Lesson" : "Add Lesson"}
            </h2>
            {courseName && (
              <p className="truncate text-[11px] text-gray-500 dark:text-gray-400" title={courseName}>
                Course: <span className="font-semibold text-gray-700 dark:text-gray-200">{courseName}</span>
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              className="cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              className="cursor-pointer rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
            >
              {isEditing ? "Save Changes" : "Save Lesson"}
            </button>
          </div>
        </div>

        {/* Two columns, no divider line. Only this body scrolls (and only on a very short screen). */}
        <div className="grid min-h-0 flex-1 grid-cols-1 content-start gap-x-8 gap-y-3 overflow-y-auto md:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-3">
            <LessonBasicsFields form={form} errors={errors} onChange={setField} />
            <MaterialTypeSelector value={form.materialType} onChange={setMaterialType} />
          </div>
          <div className="min-w-0">
            <MaterialContent
              form={form}
              errors={errors}
              onFileSelect={selectFile}
              onFileRemove={removeFile}
              onChange={setField}
            />
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1 [scrollbar-width:thin]">
      <LessonHeader
        breadcrumbItems={breadcrumbItems}
        onCancel={onBack}
        onSave={save}
        isEditing={isEditing}
      />

      <div className="w-full bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 flex flex-col gap-4">
        {courseName && <CourseSelector courseName={courseName} />}
        <LessonBasicsFields form={form} errors={errors} onChange={setField} />
        <div className="border-t border-gray-100 dark:border-gray-700" />
        <MaterialTypeSelector value={form.materialType} onChange={setMaterialType} />
        <MaterialContent
          form={form}
          errors={errors}
          onFileSelect={selectFile}
          onFileRemove={removeFile}
          onChange={setField}
        />
      </div>
    </div>
  );
}