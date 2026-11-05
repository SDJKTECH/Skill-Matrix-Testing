import { useRef, useState } from "react";
import { FiBookOpen, FiClock, FiInfo } from "react-icons/fi";

import InfoPopover from "../../training/shared/components/InfoPopover";
import { FOCUS_RING } from "../../shared/config/focusRing";
import { TypePill } from "./CourseDisplayComponents";
import { getCourseCardIcon } from "./courseCardIcons";
import { formatDuration, formatRelative, plural } from "./courseAdminUtils";

export default function AdminCourseCard({ course }) {
  const [infoOpen, setInfoOpen] = useState(false);
  const infoButtonRef = useRef(null);
  const isTraining =
    String(course.course_type || "").toLowerCase() === "training";
  const trainingType = String(course.training_type || "")
    .trim()
    .toUpperCase();
  const CourseCardIcon = getCourseCardIcon(
    course.card_icon,
    course.course_type
  ).icon;

  return (
    <div className="lca-card-slot">
      <article
        className={`lca-course-card ${
          isTraining ? "lca-course-card-training" : "lca-course-card-policy"
        }`}
        aria-label={course.title}
      >
        <header className="lca-course-card-header">
          <CourseCardIcon
            className="relative z-10 h-9 w-9 text-white"
            aria-hidden="true"
          />
          <div className="relative z-10 ml-auto">
            <span className="lca-course-card-type">
              <TypePill type={course.course_type} />
            </span>
          </div>
        </header>

        <div className="relative flex min-h-[11rem] flex-col px-5 pb-0 pt-5">
          <CourseCardIcon
            className="lca-course-card-watermark"
            aria-hidden="true"
          />
          <h3 className="relative z-10 break-words text-base font-semibold leading-6 text-white">
            {course.title}
          </h3>

          <div className="relative z-10 mt-3 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="lca-course-card-fact font-semibold">
              {isTraining && ["DT", "NDT"].includes(trainingType)
                ? trainingType
                : "—"}
            </span>
            <span className="lca-course-card-fact">
              <FiClock
                className="lca-card-fact-icon h-3.5 w-3.5 shrink-0"
                aria-hidden="true"
              />
              {course.duration_minutes != null
                ? formatDuration(course.duration_minutes)
                : "—"}
            </span>
            <span className="lca-course-card-fact">
              <FiBookOpen
                className="lca-card-fact-icon h-3.5 w-3.5 shrink-0"
                aria-hidden="true"
              />
              {plural(course.lesson_count ?? 0, "lesson")}
              {(course.quiz_count ?? 0) > 0 &&
                ` · ${plural(course.quiz_count, "quiz", "quizzes")}`}
            </span>
          </div>

          <div className="lca-card-description">
            <span className="text-sm leading-5">
              {course.description || "No description added yet."}
            </span>
          </div>

          <footer className="lca-course-card-footer relative z-10 mt-auto flex min-h-[3.75rem] items-center gap-1.5 border-t border-gray-100 py-2 dark:border-gray-700">
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
                title="Status and last updated"
                className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/15 hover:text-white ${FOCUS_RING}`}
              >
                <FiInfo className="h-4 w-4" aria-hidden="true" />
              </button>
              {infoOpen && (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-40"
                    aria-label={`Close status information for ${course.title}`}
                    onClick={() => setInfoOpen(false)}
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
          </footer>
        </div>
      </article>
    </div>
  );
}
