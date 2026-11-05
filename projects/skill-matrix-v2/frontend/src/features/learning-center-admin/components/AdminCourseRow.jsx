
import { useRef, useState } from "react";
import { FiInfo } from "react-icons/fi";

import HighlightMatch from "../../training/shared/components/HighlightMatch";
import InfoPopover from "../../training/shared/components/InfoPopover";
import { TypePill } from "./CourseDisplayComponents";
import { getCourseCardIcon } from "./courseCardIcons";
import {
  formatDuration,
  formatRelative,
  plural,
} from "./courseAdminUtils";

export default function AdminCourseRow({ course, search }) {
  const [infoOpen, setInfoOpen] = useState(false);
  const infoButtonRef = useRef(null);

  const courseType = String(course.course_type || "").toLowerCase();
  const trainingType = String(course.training_type || "")
    .trim()
    .toUpperCase();

  const isTraining = courseType === "training";
  const CourseCardIcon = getCourseCardIcon(
    course.card_icon,
    course.course_type
  ).icon;

  return (
    <div className="lca-course-row group px-3 py-3 transition-colors hover:bg-blue-50/40 dark:hover:bg-gray-700/30 sm:px-4">
      <div className="lca-course-grid">
        {/* Course title */}
        <div className="lca-course-title min-w-0">
          <span className="flex min-w-0 items-center gap-2">
            <CourseCardIcon
              className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400"
              aria-hidden="true"
            />
            <span className="block truncate text-sm font-semibold text-gray-900 dark:text-white">
            <HighlightMatch text={course.title} query={search} />
            </span>
          </span>
          {course.description && (
            <span className="lca-course-description mt-1 text-xs font-normal leading-4 text-gray-600 dark:text-gray-400">
              {course.description}
            </span>
          )}
        </div>

        {/* Course type */}
        <div className="lca-type-cell">
          <TypePill type={course.course_type} />
        </div>

        {/* DT / NDT */}
        <div className="lca-dt-cell">
          <span className="lca-mobile-label">DT/NDT</span>
          <TrainingTypeValue
            value={
              isTraining && ["DT", "NDT"].includes(trainingType)
                ? trainingType
                : "—"
            }
          />
        </div>

        {/* Duration */}
        <div className="lca-duration-cell text-sm text-gray-600 dark:text-gray-300">
          {course.duration_minutes != null
            ? formatDuration(course.duration_minutes)
            : "—"}
        </div>

        {/* Content */}
        <div className="lca-content-cell text-sm text-gray-600 dark:text-gray-300">
          <span>{plural(course.lesson_count ?? 0, "lesson")}</span>

          {(course.quiz_count ?? 0) > 0 && (
            <>
              <span className="mx-1 text-gray-300 dark:text-gray-600">
                ·
              </span>
              <span>{plural(course.quiz_count, "quiz")}</span>
            </>
          )}
        </div>

        {/* Status and last-updated information */}
        <div className="lca-actions shrink-0">
          <div className="relative">
            <button
              ref={infoButtonRef}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setInfoOpen((open) => !open);
              }}
              aria-expanded={infoOpen}
              aria-label={`Status and update information for ${course.title}`}
              className={`lca-icon-button inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-300`}
            >
              <FiInfo className="h-4 w-4" aria-hidden="true" />
            </button>

            {infoOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={(event) => {
                    event.stopPropagation();
                    setInfoOpen(false);
                  }}
                  aria-hidden="true"
                />

                <InfoPopover
                  triggerEl={infoButtonRef.current}
                  onClose={() => setInfoOpen(false)}
                  placement="top-left"
                >
                  <dl className="divide-y divide-gray-100 text-left dark:divide-gray-700">
                    <div className="flex items-center justify-between gap-4 py-2.5 first:pt-0">
                      <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Status
                      </dt>
                      <dd className="text-xs font-semibold text-gray-900 dark:text-white">
                        {course.course_status}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-4 py-2.5 last:pb-0">
                      <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Last updated
                      </dt>
                      <dd className="text-xs font-semibold text-gray-900 dark:text-white">
                        {formatRelative(course.updated_at)}
                      </dd>
                    </div>
                  </dl>
                </InfoPopover>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TrainingTypeValue({ value }) {
  return value !== "—" ? (
    <span className="inline-flex min-w-8 justify-center rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
      {value}
    </span>
  ) : (
    <span className="text-sm text-gray-400 dark:text-gray-500">
      —
    </span>
  );
}
