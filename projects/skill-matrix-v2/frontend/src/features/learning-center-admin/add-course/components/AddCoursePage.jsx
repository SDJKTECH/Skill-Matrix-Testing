import { createElement, useEffect, useRef, useState } from "react";
import {
  FiAlertCircle,
  FiAlertTriangle,
  FiCheck,
  FiChevronLeft,
  FiChevronRight,
  FiEdit2,
  FiEye,
  FiHelpCircle,
  FiPlay,
} from "react-icons/fi";
 
import CourseDetails, { CourseVisibility } from "./CourseDetails";
import LessonList from "./LessonList";
import { AddLessonPage } from "../../add-lesson";
import { saveCourse } from "../../api/courseManagementApi";
import { FOCUS_RING } from "../../../shared/config/focusRing";
import Breadcrumb from "../../../training/shared/components/Breadcrumb";
import OverlayDialog from "../../../shared/components/OverlayDialog";
 
const EMPTY_COURSE = {
  title: "",
  description: "",
  courseType: "training",
  duration: "",
  isVisible: false,
  courseClass: "",
  version: "",
  cardIcon: "book-open",
};
 
const COURSE_STEPS = [
  { title: "Basics", icon: FiEdit2 },
  { title: "Lessons", icon: FiPlay },
  { title: "Quiz", icon: FiHelpCircle },
  { title: "Publish", icon: FiEye },
];
 
// LessonList row -> Add Lesson form values (for editing).
const toLessonForm = (lesson, sequence) => ({
  title: lesson?.title ?? "",
  sequence,
  duration: lesson?.duration_minutes ?? "",
  materialType: lesson?.material_type ?? "video",
  file: lesson?.file ?? (lesson?.material_path ? { name: lesson.material_path, size: null } : null),
  textContent: lesson?.text_body ?? "",
});
 
/** Props: onBack(), onSaved(course) — called after a successful save. */
export default function AddCoursePage({ onBack, onSaved, breadcrumbItems = [] }) {
  const [course, setCourse] = useState(EMPTY_COURSE);
  const [dirty, setDirty] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [furthestStep, setFurthestStep] = useState(0);

  const [lessons, setLessons] = useState([]);
  const [showAddLesson, setShowAddLesson] = useState(false);
  const [lessonFormKey, setLessonFormKey] = useState(0);
  const [savingCourse, setSavingCourse] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [validationNotice, setValidationNotice] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [editingLessonId, setEditingLessonId] = useState(null);
  const nextLessonId = useRef(0);
  // { title, message, confirmLabel, onConfirm } while a confirm dialog is open.
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const confirmCancelRef = useRef(null);
  // Duration follows the lesson total until the admin types their own value.
  const durationOverridden = useRef(false);
  const lessonMinutes = lessons.reduce((sum, lesson) => sum + (Number(lesson.duration) || 0), 0);
 
  useEffect(() => {
    if (durationOverridden.current || lessons.length === 0) return;
    setCourse((prev) => ({ ...prev, duration: String(lessonMinutes) }));
  }, [lessonMinutes, lessons.length]);
 
  useEffect(() => {
    if (activeStep !== 0) return;
    const invalidField = fieldErrors.title
      ? "course-title"
      : fieldErrors.version
        ? "course-version"
        : fieldErrors.duration
          ? "course-duration"
          : null;
    if (invalidField) document.getElementById(invalidField)?.focus({ preventScroll: true });
  }, [activeStep, fieldErrors.duration, fieldErrors.title, fieldErrors.version]);

  const leaveGuarded = (action) => {
    if (!dirty) {
      action();
      return;
    }
    setPendingConfirm({
      title: "Leave without saving?",
      message: "Your changes to this course will be lost.",
      confirmLabel: "Leave",
      onConfirm: action,
    });
  };
 
  const handleFieldChange = (field, value) => {
    if (field === "duration") durationOverridden.current = true;
    setCourse((prev) => ({
      ...prev,
      [field]: value,
    }));
    setDirty(true);
    setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
    if (fieldErrors[field]) setValidationNotice("");
    setSaveError("");
  };
 
  // Add Lesson form values -> lesson draft.
  const handleLessonFormSaved = (form) => {
    const isText = form.materialType === "text";
    handleLessonSaved({
      title: form.title,
      material_type: form.materialType,
      duration_minutes: form.duration,
      material_path: isText ? null : form.file?.name ?? null,
      text_body: isText ? form.textContent : null,
      file: isText ? null : form.file,
      sequence: Number(form.sequence),
    });
  };
 
  // Moves the lesson to its requested position and renumbers the list.
  const placeLesson = (list, id, sequence) => {
    const moving = list.find((l) => l.id === id);
    const rest = list.filter((l) => l.id !== id);
    const index = Math.min(Math.max((sequence || rest.length + 1) - 1, 0), rest.length);
    rest.splice(index, 0, moving);
    return rest.map((l, i) => ({ ...l, sequence: i + 1 }));
  };
 
  // The Add Lesson form already validates title, type and duration.
  const handleLessonSaved = (lessonDraft) => {
    const title = lessonDraft.title.trim();
    const materialType = lessonDraft.material_type;
    const duration = Number(lessonDraft.duration_minutes);
 
    const editingLesson = lessons.find(
      (existingLesson) => existingLesson.id === editingLessonId
    );
 
    if (editingLesson) {
      setLessons((currentLessons) =>
        currentLessons.map((existingLesson) =>
          existingLesson.id === editingLessonId
            ? {
                ...existingLesson,
                title,
                type: materialType,
                duration,
                materialUploaded: Boolean(lessonDraft.material_path || lessonDraft.text_body),
                material_type: materialType,
                duration_minutes: duration,
                material_path: lessonDraft.material_path || null,
                text_body: lessonDraft.text_body || null,
                file: lessonDraft.file || null,
              }
            : existingLesson
        )
      );
      setLessons((current) => placeLesson(current, editingLessonId, lessonDraft.sequence));
    } else {
      const sequence = lessons.length + 1;
      const id = `draft-${++nextLessonId.current}`;
      setLessons((currentLessons) => [
        ...currentLessons,
        {
          id,
          sequence,
          title,
          type: materialType,
          duration,
          materialUploaded: Boolean(lessonDraft.material_path || lessonDraft.text_body),
          material_type: materialType,
          duration_minutes: duration,
          material_path: lessonDraft.material_path || null,
          text_body: lessonDraft.text_body || null,
          file: lessonDraft.file || null,
        },
      ]);
      setLessons((current) => placeLesson(current, id, lessonDraft.sequence));
    }
 
    setEditingLessonId(null);
    setLessonFormKey((key) => key + 1);
    setShowAddLesson(false);
    setDirty(true);
    setSaveError("");
  };
 
  const handleEditLesson = (lesson) => {
    setEditingLessonId(lesson.id);
    setSaveError("");
    setShowAddLesson(true);
  };
 
  const removeLesson = (lessonId) => {
    setLessons((currentLessons) =>
      currentLessons
        .filter((lesson) => lesson.id !== lessonId)
        .map((lesson, index) => ({ ...lesson, sequence: index + 1 }))
    );
    setDirty(true);
    setSaveError("");
  };
 
  const handleDeleteLesson = (lessonId) => {
    const lesson = lessons.find((l) => l.id === lessonId);
    setPendingConfirm({
      title: "Delete lesson?",
      message: `“${lesson.title}” will be removed from this course.`,
      confirmLabel: "Delete lesson",
      onConfirm: () => removeLesson(lessonId),
    });
  };
 
  const validateCourseFields = () => {
    const duration = course.duration === "" ? null : Number(course.duration);
    const errors = {};
    if (!course.title.trim()) errors.title = "Course title is required.";
    if (course.version.trim() && !/^\d+(\.\d+){0,2}$/.test(course.version.trim())) {
      errors.version = "Use a version like 1.0 or 2.1.3.";
    }
    if (duration !== null && (!Number.isFinite(duration) || duration < 0)) {
      errors.duration = "Enter 0 or more minutes.";
    }
    setFieldErrors(errors);
    return { duration, errors };
  };
 
  const handleSaveCourse = async () => {
    if (savingCourse) return;
 
    const { duration, errors } = validateCourseFields();
    if (Object.keys(errors).length) {
      setValidationNotice(Object.values(errors)[0]);
      if (activeStep !== 0) setActiveStep(0);
      return;
    }
 
    try {
      setSavingCourse(true);
      setSaveError("");
      setValidationNotice("");

      const payload = {
        title: course.title.trim(),
        description: course.description,
        course_type: course.courseType === "policy" ? "Policy" : "Training",
        course_class: course.courseClass || null,
        version: course.version.trim() || null,
        card_icon: course.cardIcon,
        duration_minutes: duration,
        course_status: course.isVisible ? "Published" : "Draft",
        lessons: lessons.map((lesson) => ({
          lesson_id: lesson.lesson_id ?? null,
          sequence: lesson.sequence,
          title: lesson.title,
          material_type: lesson.material_type,
          duration_minutes: lesson.duration_minutes,
          material_path: lesson.material_path,
          text_body: lesson.text_body,
          file: lesson.file,
        })),
      };
      await saveCourse(payload);
 
      setDirty(false);
      onSaved?.(payload);
    } catch (error) {
      console.error("Failed to save course:", error);
      setSaveError(error.message || "Unable to save the course. Please try again.");
    } finally {
      setSavingCourse(false);
    }
  };
 
  const handleDiscard = () => leaveGuarded(() => onBack?.());
 
  // Leaving the editor through any earlier crumb goes through the unsaved-changes check.
  const guardedTrail = breadcrumbItems.map((crumb) => ({
    ...crumb,
    onClick: () => leaveGuarded(() => crumb.onClick?.()),
  }));
  const closeLesson = () => {
    setEditingLessonId(null);
    setShowAddLesson(false);
  };
  const goToStep = (step) => {
    if (step < 0 || step >= COURSE_STEPS.length || step > furthestStep) return;
    if (activeStep === 0 && step > 0) {
      const { errors } = validateCourseFields();
      if (Object.keys(errors).length) {
        setValidationNotice(Object.values(errors)[0]);
        return;
      }
      setValidationNotice("");
    }
    setActiveStep(step);
    if (step === 1) {
      setEditingLessonId(null);
      setShowAddLesson(false);
    }
  };
  const goToNextStep = () => {
    if (activeStep === 0) {
      const { errors } = validateCourseFields();
      if (Object.keys(errors).length) {
        setValidationNotice(Object.values(errors)[0]);
        return;
      }
      setSaveError("");
      setValidationNotice("");
    }
    const nextStep = Math.min(activeStep + 1, COURSE_STEPS.length - 1);
    setActiveStep(nextStep);
    setFurthestStep((furthest) => Math.max(furthest, nextStep));
    if (nextStep === 1) {
      setEditingLessonId(null);
      setShowAddLesson(false);
    }
  };
  const confirmDialog = (
    <OverlayDialog
      open={!!pendingConfirm}
      onClose={() => setPendingConfirm(null)}
      title={pendingConfirm?.title}
      initialFocusRef={confirmCancelRef}
    >
      {pendingConfirm && (
        <>
          <div className="flex gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400">
              <FiAlertTriangle className="h-4 w-4" aria-hidden="true" />
            </span>
            <p className="min-w-0 text-sm text-gray-600 dark:text-gray-300">{pendingConfirm.message}</p>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              ref={confirmCancelRef}
              type="button"
              onClick={() => setPendingConfirm(null)}
              className={`cursor-pointer rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700 ${FOCUS_RING}`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                const { onConfirm } = pendingConfirm;
                setPendingConfirm(null);
                onConfirm();
              }}
              className={`cursor-pointer rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 ${FOCUS_RING}`}
            >
              {pendingConfirm.confirmLabel}
            </button>
          </div>
        </>
      )}
    </OverlayDialog>
  );
  const busy = savingCourse;
  const editingIndex = lessons.findIndex((lesson) => lesson.id === editingLessonId);
  const editingLesson = lessons[editingIndex];
  const lessonsReady = lessons.every(
    (lesson) =>
      lesson.materialUploaded &&
      Number(lesson.duration) >= 1 &&
      Number(lesson.duration) <= 600
  );
  const publishChecks = [
    {
      complete: course.title.trim().length > 0,
      label: course.title.trim() ? "Title added" : "Title required",
    },
    {
      complete: course.description.trim().length > 0,
      label: course.description.trim() ? "Description added" : "Description required",
    },
    {
      complete: lessons.length > 0,
      label: lessons.length > 0 ? "At least one lesson added" : "At least one lesson or quiz required",
    },
    ...(lessons.length
      ? [{
          complete: lessonsReady,
          label: lessonsReady
            ? "All lessons have material and valid duration"
            : "Every lesson needs material and valid duration",
        }]
      : []),
  ];

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden pr-1">
        <header className="flex w-full shrink-0 flex-col gap-1.5 border-b border-gray-200 bg-gray-50 pb-3 dark:border-gray-700 dark:bg-gray-900">
          <Breadcrumb
            maxVisible={5}
            items={[...guardedTrail, { key: "course", label: "Add Course" }]}
          />
 
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold leading-tight text-gray-900 dark:text-white">
                  Add Course
                </h1>
                {dirty && !savingCourse && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                    Unsaved changes
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                Complete the course basics, add lessons, and choose who can see it. Create or save the course on the Publish step.
              </p>
            </div>
 
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={handleDiscard}
                disabled={savingCourse}
                className={`cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 ${FOCUS_RING}`}
              >
                {dirty ? "Discard" : "Cancel"}
              </button>
            </div>
          </div>
        </header>
 
        <div className="flex min-h-0 w-full flex-1 flex-col gap-3 overflow-hidden pb-2 pt-3">
          {saveError && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
            >
              <FiAlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {saveError}
            </div>
          )}
 
          <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-blue-200 bg-blue-50/40 dark:border-blue-800 dark:bg-blue-900/10">
              <header className="flex shrink-0 flex-col gap-3 rounded-t-xl border-b border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800 dark:bg-gray-900 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="shrink-0 text-sm font-semibold text-blue-800 dark:text-blue-300">
                  Create Course
                </h2>
                <ol aria-label="Course setup steps" className="flex min-w-0 flex-wrap items-center gap-1">
                  {COURSE_STEPS.map(({ title, icon: StepIcon }, index) => {
                    const current = activeStep === index;
                    const completed = index < activeStep;
                    const reachable = index <= furthestStep;
                    return (
                      <li
                        key={title}
                        className="flex shrink-0 items-center gap-1"
                      >
                        <button
                          type="button"
                          onClick={() => goToStep(index)}
                          disabled={!reachable || busy}
                          aria-current={current ? "step" : undefined}
                          className={`inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING} ${
                            current
                              ? "bg-white text-blue-800 shadow-sm dark:bg-gray-800 dark:text-blue-200"
                              : "text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900/40"
                          }`}
                        >
                          <span
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                              current
                                ? "bg-blue-600 text-white"
                                : completed
                                  ? "bg-green-600 text-white"
                                  : "border border-blue-200 bg-white text-blue-700 dark:border-blue-800 dark:bg-gray-900 dark:text-blue-300"
                            }`}
                            aria-hidden="true"
                          >
                            {completed
                              ? <FiCheck className="h-3 w-3" />
                              : createElement(StepIcon, { className: "h-3 w-3" })}
                          </span>
                          {title}
                        </button>
                        {index < COURSE_STEPS.length - 1 && (
                          <span
                            className={`h-px w-3 sm:w-6 ${completed ? "bg-green-500" : "bg-blue-200 dark:bg-blue-800"}`}
                            aria-hidden="true"
                          />
                        )}
                      </li>
                    );
                  })}
                </ol>
              </header>
 
              <div
                role="group"
                aria-label={`Step ${activeStep + 1} of ${COURSE_STEPS.length}: ${COURSE_STEPS[activeStep].title}`}
                className={`flex min-h-0 flex-1 flex-col gap-3 ${
                  activeStep === 0 || activeStep === 3
                    ? "overflow-y-auto p-2"
                    : "overflow-hidden p-3"
                }`}
              >
                {activeStep === 0 && (
                  <CourseDetails
                    values={course}
                    errors={fieldErrors}
                    lessonMinutes={lessonMinutes}
                    lessonCount={lessons.length}
                    onChange={handleFieldChange}
                    disabled={busy}
                    showVisibility={false}
                  />
                )}
 
                {activeStep === 1 && (
                  showAddLesson ? (
                    <div className={`grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] gap-3 ${lessons.length ? "lg:grid-cols-[minmax(0,1fr)_19rem]" : ""}`}>
                      <div className="flex min-h-0 flex-col">
                        <AddLessonPage
                          embedded
                          key={`${lessonFormKey}-${editingLessonId ?? "new"}`}
                          courseName={course.title.trim()}
                          isEditing={Boolean(editingLesson)}
                          initialForm={toLessonForm(
                            editingLesson,
                            editingLesson ? editingIndex + 1 : lessons.length + 1
                          )}
                          onSave={handleLessonFormSaved}
                          onBack={closeLesson}
                        />
                      </div>
                      {lessons.length > 0 && (
                        <div className="flex min-h-0 overflow-hidden">
                          <LessonList
                            lessons={lessons}
                            onEditLesson={handleEditLesson}
                            onDeleteLesson={handleDeleteLesson}
                            showAddButton={false}
                          />
                        </div>
                      )}
                    </div>
                  ) : (

                    <LessonList
                      lessons={lessons}
                      addDisabled={busy}
                      onAddLesson={() => {
                        setEditingLessonId(null);
                        setShowAddLesson(true);
                      }}
                      onEditLesson={handleEditLesson}
                      onDeleteLesson={handleDeleteLesson}
                    />
                  )
                )}
 
                {activeStep === 2 && (
                  <section className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                    <div className="flex items-center gap-2">
                      <FiHelpCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Quiz</h3>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                        Coming soon
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Quiz creation is not available yet. No quiz content will be created or saved.
                    </p>
                  </section>
                )}
 
                {activeStep === 3 && (
                  <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 content-start items-start gap-2 overflow-y-auto lg:grid-cols-[minmax(15rem,0.85fr)_minmax(0,1.15fr)]">
                    <CourseVisibility
                      values={course}
                      onChange={handleFieldChange}
                      lessonCount={lessons.length}
                      disabled={busy}
                    />
                    <section className="min-w-0 rounded-lg border border-blue-200 bg-white shadow-sm dark:border-blue-800 dark:bg-gray-800">
                      <div className="rounded-t-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-2 text-white">
                        <div className="flex min-w-0 items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="rounded-t-lg text-[10px] font-semibold uppercase tracking-wide text-blue-100">Course review</span>
                            <h3 className="truncate text-sm font-bold leading-tight">
                              {course.title.trim() || "Untitled course"}
                            </h3>
                          </div>
                          <span className="shrink-0 rounded-full bg-white/15 px-2 py-1 text-[10px] font-semibold">
                            {course.isVisible ? "Published" : "Draft"}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-blue-100">
                          {course.description.trim() || "No description added yet."}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 p-2">
                        <div className="flex flex-wrap gap-1.5" aria-label="Course metadata">
                          {[course.courseType === "policy" ? "Policy" : "Training", course.courseClass || "Class not set", course.version.trim() ? `Version ${course.version.trim()}` : "Version not set"].map((label) => (
                            <span key={label} className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                              {label}
                            </span>
                          ))}
                        </div>
                        <dl className="grid grid-cols-2 gap-1.5">
                          <div className="flex items-center justify-between gap-2 rounded-md bg-gray-50 px-2 py-1.5 dark:bg-gray-900/50">
                            <dt className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Lessons</dt>
                            <dd className="text-sm font-bold tabular-nums text-gray-900 dark:text-white">{lessons.length}</dd>
                          </div>
                          <div className="flex items-center justify-between gap-2 rounded-md bg-gray-50 px-2 py-1.5 dark:bg-gray-900/50">
                            <dt className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Duration</dt>
                            <dd className="text-sm font-bold tabular-nums text-gray-900 dark:text-white">
                              {lessons.length > 0 ? `${lessonMinutes} min` : "Not set"}
                            </dd>
                          </div>
                        </dl>
                        <div className="border-t border-gray-100 pt-1.5 dark:border-gray-700">
                          <h4 className="text-[11px] font-semibold text-gray-900 dark:text-white">Before you publish</h4>
                          <ul className="mt-1 grid gap-1 sm:grid-cols-2" aria-label="Publish checklist">
                            {publishChecks.map(({ label, complete }) => (
                              <li
                                key={label}
                                className={`flex min-w-0 items-start gap-1 rounded-md px-2 py-1.5 text-[10px] font-medium leading-snug ${
                                  complete
                                    ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300"
                                    : "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
                                }`}
                              >
                                {complete ? (
                                  <FiCheck className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                                ) : (
                                  <FiAlertCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                                )}
                                <span>{label}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </section>
                  </div>
                )}
              </div>
 
              <footer className="flex shrink-0 flex-wrap items-center gap-2 rounded-b-xl border-t border-blue-200 bg-blue-50 px-4 py-2.5 dark:border-blue-800 dark:bg-gray-900">
                <span className="mr-auto text-xs text-gray-500 dark:text-gray-400" aria-live="polite">
                  {activeStep === COURSE_STEPS.length - 1
                    ? "Create the course when you’re ready."
                    : `Step ${activeStep + 1} of ${COURSE_STEPS.length}`}
                </span>
                <button
                  type="button"
                  onClick={() => goToStep(activeStep - 1)}
                  disabled={activeStep === 0 || busy}
                  className={`inline-flex cursor-pointer items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 ${FOCUS_RING}`}
                >
                  <FiChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  Back
                </button>
                {activeStep < COURSE_STEPS.length - 1 ? (
                  <button
                    type="button"
                    onClick={goToNextStep}
                    disabled={busy}
                    className={`inline-flex cursor-pointer items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
                  >
                    Next
                    <FiChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSaveCourse}
                    disabled={busy}
                    className={`inline-flex cursor-pointer items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
                  >
                    {savingCourse ? "Saving…" : course.isVisible ? "Create and publish" : "Create Course"}
                  </button>
                )}
              </footer>
              {validationNotice && (
                <p
                  role="alert"
                  className="absolute bottom-16 right-4 z-20 max-w-[calc(100%-2rem)] rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700 shadow dark:border-red-800 dark:bg-red-900/90 dark:text-red-200"
                >
                  {validationNotice}
                </p>
              )}
            </section>
        </div>
      </div>
      {confirmDialog}
    </>
  );
}