import {
  FiAlertTriangle,
  FiAlignLeft,
  FiCheck,
  FiEdit2,
  FiFileText,
  FiHelpCircle,
  FiLayers,
  FiPlus,
  FiTrash2,
  FiVideo,
} from "react-icons/fi";
import { FOCUS_RING } from "../../../shared/config/focusRing";

const TYPE_META = {
  video: { label: "Video", icon: FiVideo, tone: "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400" },
  document: { label: "Document", icon: FiFileText, tone: "bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400" },
  text: { label: "Text", icon: FiAlignLeft, tone: "bg-teal-50 text-teal-600 dark:bg-teal-900/20 dark:text-teal-400" },
  quiz: { label: "Quiz", icon: FiHelpCircle, tone: "bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400" },
};
const typeMeta = (type) => TYPE_META[String(type).toLowerCase()] ?? TYPE_META.document;

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function MaterialStatus({ lesson }) {
  if (!lesson.materialUploaded) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-orange-600 dark:text-orange-400">
        <FiAlertTriangle className="h-3 w-3" aria-hidden="true" />
        No material
      </span>
    );
  }
  const label = lesson.material_type === "text" ? "Text added" : "File attached";
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-medium text-green-600 dark:text-green-400"
      title={lesson.material_path || undefined}
    >
      <FiCheck className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  );
}

const iconButton = `flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-gray-400 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`;

export default function LessonList({
  lessons,
  onAddLesson,
  onEditLesson,
  onDeleteLesson,
  addDisabled = false,
  showAddButton = true,
}) {
  const totalDuration = lessons.reduce((sum, lesson) => sum + (Number(lesson.duration) || 0), 0);

  const addButton = (
    <button
      type="button"
      onClick={onAddLesson}
      disabled={addDisabled}
      className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40 ${FOCUS_RING}`}
    >
      <FiPlus className="h-3.5 w-3.5" aria-hidden="true" />
      Add Lesson
    </button>
  );

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Lessons</h2>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            {lessons.length === 0
              ? "Employees take lessons in the order shown."
              : `${plural(lessons.length, "lesson")} · ${totalDuration} min total`}
          </p>
        </div>
        {showAddButton && lessons.length > 0 && addButton}
      </div>

      {lessons.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-200 px-4 py-4 text-center dark:border-gray-700">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-50 text-gray-400 dark:bg-gray-900/40">
            <FiLayers className="h-4 w-4" aria-hidden="true" />
          </span>
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">No lessons yet</p>
          <p className="max-w-xs text-[11px] text-gray-500 dark:text-gray-400">
            Add a video, document or text lesson. You can reorder them with the sequence number.
          </p>
          {showAddButton && addButton}
        </div>
      ) : (
        <ol className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-100 dark:divide-gray-700 dark:border-gray-700">
          {lessons.map((lesson, index) => {
            const meta = typeMeta(lesson.type);
            return (
              <li
                key={lesson.id}
                className="grid shrink-0 grid-cols-[28px_1fr_auto] items-center gap-3 px-3 py-2 transition-colors hover:bg-gray-50 sm:grid-cols-[28px_1fr_110px_70px_110px_auto] dark:hover:bg-gray-700/40"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gray-100 text-[11px] font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                  {index + 1}
                </span>

                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-gray-900 dark:text-white" title={lesson.title}>
                    {lesson.title}
                  </p>
                  {/* Compact meta line on small screens; columns take over from sm up. */}
                  <p className="text-[10px] text-gray-400 sm:hidden">
                    {meta.label} · {lesson.duration ? `${lesson.duration} min` : "—"}
                  </p>
                </div>

                <span className={`hidden w-fit items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium sm:inline-flex ${meta.tone}`}>
                  <meta.icon className="h-3 w-3" aria-hidden="true" />
                  {meta.label}
                </span>

                <span className="hidden text-[11px] text-gray-600 sm:block dark:text-gray-300">
                  {lesson.duration ? `${lesson.duration} min` : "—"}
                </span>

                <span className="hidden sm:block">
                  <MaterialStatus lesson={lesson} />
                </span>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onEditLesson(lesson)}
                    disabled={addDisabled}
                    title={`Edit ${lesson.title}`}
                    aria-label={`Edit ${lesson.title}`}
                    className={`${iconButton} hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/20 dark:hover:text-blue-400`}
                  >
                    <FiEdit2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteLesson(lesson.id)}
                    disabled={addDisabled}
                    title={`Delete ${lesson.title}`}
                    aria-label={`Delete ${lesson.title}`}
                    className={`${iconButton} hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400`}
                  >
                    <FiTrash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
