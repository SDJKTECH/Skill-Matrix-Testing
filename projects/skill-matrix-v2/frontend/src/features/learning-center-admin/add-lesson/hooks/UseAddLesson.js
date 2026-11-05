import { useState, useCallback } from "react";
import { FILE_TYPES, getMaterialType } from "../services/LessonMaterial";

const INITIAL_FORM = {
  title: "",
  sequence: 1,
  duration: "",
  materialType: "video",
  file: null,
  textContent: "",
};

export function useAddLesson({ onSaved, initialForm } = {}) {
  const [form, setForm] = useState(() => ({ ...INITIAL_FORM, ...initialForm }));
  const [errors, setErrors] = useState({});

  const setField = useCallback((name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
  }, []);

  // Switching material type drops the previous type's content.
  const setMaterialType = useCallback((materialType) => {
    setForm((prev) => ({ ...prev, materialType, file: null, textContent: "" }));
    setErrors((prev) => ({ ...prev, file: undefined, textContent: undefined }));
  }, []);

  const selectFile = useCallback(
    (file) => {
      if (!file) return;
      const type = getMaterialType(form.materialType);
      if (type?.maxMB && file.size > type.maxMB * 1024 * 1024) {
        setErrors((prev) => ({ ...prev, file: `File is larger than ${type.maxMB}MB.` }));
        return;
      }
      setField("file", file);
    },
    [form.materialType, setField]
  );

  const removeFile = useCallback(() => setField("file", null), [setField]);

  const validate = () => {
    const next = {};
    if (!form.title.trim()) next.title = "Lesson title is required.";
    if (!form.sequence || Number(form.sequence) < 1) next.sequence = "Min 1.";
    if (!form.duration || Number(form.duration) < 1) next.duration = "Required.";
    if (FILE_TYPES.includes(form.materialType) && !form.file) {
      next.file = "Please attach a file.";
    }
    if (form.materialType === "text" && !form.textContent.trim()) {
      next.textContent = "Please enter the lesson text.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const save = () => {
    if (!validate()) return;
    // The course page keeps the lesson until the course itself is saved.
    onSaved?.(form);
  };

  return { form, errors, setField, setMaterialType, selectFile, removeFile, save };
}