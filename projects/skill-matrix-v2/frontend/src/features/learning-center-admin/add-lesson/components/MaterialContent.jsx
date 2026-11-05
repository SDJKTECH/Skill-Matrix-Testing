import React from "react";
import { FILE_TYPES, getMaterialType } from "../services/LessonMaterial";
import FileDropzone from "./FileDropZone";
import UploadedFileItem from "./UploadedFileItem";
import TextMaterialEditor from "./TextMaterialEditor";

// Renders the right input for the selected material type.
export default function MaterialContent({ form, errors, onFileSelect, onFileRemove, onChange }) {
  const type = getMaterialType(form.materialType);

  if (FILE_TYPES.includes(form.materialType)) {
    return (
      <div className="flex flex-col gap-2">
        <FileDropzone
          accept={type.accept}
          hint={type.hint}
          error={errors.file}
          onFileSelect={onFileSelect}
        />
        {form.file && <UploadedFileItem file={form.file} onRemove={onFileRemove} />}
      </div>
    );
  }

  if (form.materialType === "text") {
    return (
      <TextMaterialEditor
        value={form.textContent}
        error={errors.textContent}
        onChange={(v) => onChange("textContent", v)}
      />
    );
  }

  // Quiz lessons have no editor yet.
  return (
    <div className="py-8 text-center rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
      <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">Quiz builder coming soon</p>
      <p className="text-[10px] text-gray-400 dark:text-gray-500">
        Quiz lessons will be configurable in a future update.
      </p>
    </div>
  );
}