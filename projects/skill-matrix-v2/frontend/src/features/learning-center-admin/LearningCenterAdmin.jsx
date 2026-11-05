
import React, { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  FiPlus,
  FiSearch,
  FiAlertTriangle,
  FiX,
  FiInbox,
  FiArrowDown,
  FiArrowUp,
  FiChevronLeft,
  FiChevronRight,
  FiGrid,
  FiList,
} from "react-icons/fi";

import { useAuth } from "../../hooks/useAuth";
import {
  getCurrentEmployeeId,
  hasFullAccessRole,
} from "../../helper/accessRoles";
import { useAdminCourses } from "./hooks/useAdminCourses";
import { useDebouncedValue } from "../training/shared/hooks/useDebouncedValue";
import { FOCUS_RING } from "../shared/config/focusRing";
import Breadcrumb from "../training/shared/components/Breadcrumb";
import AdminCourseRow from "./components/AdminCourseRow";
import AdminCourseCard from "./components/AdminCourseCard";
import CourseHeaderFilter from "./components/CourseHeaderFilter";

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */


const LearningCenterAdminStyles = () => (
  <style>{`
    .lca-column-header,
    .lca-course-grid {
      display: grid;
      grid-template-columns:
        minmax(220px, 2fr)
        minmax(85px, .8fr)
        minmax(75px, .65fr)
        minmax(85px, .7fr)
        minmax(120px, 1.1fr)
        48px;
      align-items: center;
      column-gap: .7rem;
    }

    .lca-column-header {
      padding: 0 .2rem;
    }

    .lca-course-grid {
      min-width: 0;
    }

    .lca-mobile-label {
      display: none;
    }

    .lca-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: .1rem;
    }

    .lca-icon-button {
      flex: 0 0 auto;
      border: 1px solid transparent;
    }

    .lca-icon-button:focus-visible {
      outline: 2px solid #2563eb;
      outline-offset: 2px;
    }

    .lca-course-row {
      transition: background-color 160ms ease;
    }

    .lca-course-description {
      display: none;
      overflow: hidden;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }

    .lca-card-panel {
      container: lca-card-panel / inline-size;
    }

    .lca-card-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      align-items: start;
      gap: 1rem;
    }

    @container lca-card-panel (min-width: 520px) {
      .lca-card-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @container lca-card-panel (min-width: 900px) {
      .lca-card-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }

    .lca-card-slot {
      position: relative;
      min-width: 0;
    }

    .lca-course-card {
      position: relative;
      isolation: isolate;
      overflow: hidden;
      min-height: 15.5rem;
      border: 1px solid rgba(255, 255, 255, .08);
      border-radius: 20px;
      background: linear-gradient(145deg, #211a72, #171044);
      color: white;
      box-shadow: 0 8px 18px -10px rgba(15, 23, 42, .42);
      transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
    }

    .lca-course-card-training {
      --lca-card-accent: 99, 102, 241;
      --lca-card-accent-solid: #4f46e5;
      background: linear-gradient(145deg, #5b145f, #42103e);
    }

    .lca-course-card-policy {
      --lca-card-accent: 168, 85, 247;
      --lca-card-accent-solid: #9333ea;
      background: linear-gradient(145deg, #5b145f, #42103e);
    }

    .lca-card-slot:nth-child(3n + 2) .lca-course-card-training,
    .lca-card-slot:nth-child(3n + 2) .lca-course-card-policy {
      --lca-card-accent: 192, 132, 252;
      --lca-card-accent-solid: #c084fc;
      background: linear-gradient(145deg, #571254, #3e103d);
    }

    .lca-card-slot:nth-child(3n) .lca-course-card-training,
    .lca-card-slot:nth-child(3n) .lca-course-card-policy {
      --lca-card-accent: 129, 140, 248;
      --lca-card-accent-solid: #a5b4fc;
      background: linear-gradient(145deg, #1b185e, #35104f);
    }

    .lca-course-card-header {
      position: relative;
      display: flex;
      min-height: 3.75rem;
      align-items: center;
      justify-content: space-between;
      gap: .75rem;
      overflow: hidden;
      padding: .75rem 1rem 0;
    }

    .lca-course-card-footer {
      border-color: rgba(255, 255, 255, .2);
    }

    .lca-course-card-header::after {
      position: absolute;
      right: -1rem;
      top: -2rem;
      width: 7rem;
      height: 7rem;
      border-radius: 1.5rem;
      background: rgba(255, 255, 255, .06);
      transform: rotate(12deg);
      content: "";
      pointer-events: none;
    }

    .lca-course-card-watermark {
      position: absolute;
      right: .8rem;
      top: 50%;
      z-index: 0;
      width: 8.5rem;
      height: 8.5rem;
      color: white;
      opacity: .13;
      pointer-events: none;
      transform: translateY(-40%);
    }

    .lca-course-card-type {
      letter-spacing: .01em;
    }

    .lca-course-card-type > span {
      border-radius: 9999px;
      padding: .3rem .7rem;
      font-size: 11px;
      font-weight: 700;
      border: 1px solid rgba(255, 255, 255, .25);
      background: rgba(255, 255, 255, .13);
      color: white;
      box-shadow: none;
    }

    .lca-card-slot:hover > .lca-course-card,
    .lca-card-slot:focus-within > .lca-course-card {
      transform: translateY(-3px);
      border-color: rgba(var(--lca-card-accent), .32);
      box-shadow: 0 16px 30px -14px rgba(15, 23, 42, .55);
    }

    .dark .lca-course-card {
      border-color: rgba(255, 255, 255, .08);
      color: white;
    }

    .dark .lca-course-card-header {
      background: transparent;
    }

    .dark .lca-course-card-footer {
      border-color: rgba(255, 255, 255, .2);
    }

    .lca-card-description {
      display: grid;
      grid-template-rows: 0fr;
      margin-top: 0;
      opacity: 0;
      transition: grid-template-rows 220ms ease, opacity 180ms ease, margin 220ms ease;
    }

    .lca-card-description > span {
      min-height: 0;
      overflow: hidden;
      color: rgba(255, 255, 255, .9);
    }

    .dark .lca-card-description > span {
      color: rgba(255, 255, 255, .9);
    }

    .lca-card-slot:hover .lca-card-description,
    .lca-card-slot:focus-within .lca-card-description {
      grid-template-rows: 1fr;
      margin-top: .75rem;
      opacity: 1;
      transition-delay: 100ms, 100ms, 100ms;
    }

    @media (hover: none) {
      .lca-card-description {
        grid-template-rows: 1fr;
        margin-top: .75rem;
        opacity: 1;
      }

      .lca-card-description > span {
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
      }
    }

    .lca-card-fact-icon {
      color: var(--lca-card-accent-solid);
    }

    .lca-course-card-fact {
      display: inline-flex;
      min-height: 1.8rem;
      align-items: center;
      gap: .35rem;
      border: 1px solid rgba(255, 255, 255, .22);
      border-radius: 9999px;
      background: rgba(255, 255, 255, .1);
      padding: .25rem .6rem;
      color: rgba(255, 255, 255, .92);
    }

    .dark .lca-course-card-fact {
      border-color: rgba(255, 255, 255, .22);
      background: rgba(255, 255, 255, .1);
      color: rgba(255, 255, 255, .92);
    }

    .lca-course-card-details {
      border: 1px solid rgba(255, 255, 255, .3);
      color: white;
      background: rgba(255, 255, 255, .14);
    }

    .lca-course-card-details:hover {
      background: rgba(255, 255, 255, .24);
    }

    .lca-card-title button:hover,
    .lca-card-title button:focus-visible {
      text-decoration: underline;
      text-decoration-thickness: 2px;
      text-underline-offset: 3px;
    }

    @media (prefers-reduced-motion: reduce) {
      .lca-course-card,
      .lca-card-description {
        transition: none;
      }

      .lca-card-slot:hover > .lca-course-card,
      .lca-card-slot:focus-within > .lca-course-card {
        transform: none;
      }
    }

    .lca-course-title:hover .lca-course-description,
    .lca-course-title:focus-visible .lca-course-description {
      display: -webkit-box;
    }

    .lca-expanded-panel {
      width: 100%;
      box-sizing: border-box;
      scroll-margin-top: 10px;
      border-left: 3px solid #60a5fa;
      background: #fff;
      padding: .25rem .4rem .4rem;
      animation: lca-expand-in 160ms ease-out;
    }

    .dark .lca-expanded-panel {
      background: #1f2937;
      border-left-color: #3b82f6;
    }

    .lca-expanded-card {
      overflow: hidden;
      border: 1px solid #e5e7eb;
      border-radius: 7px;
      background: #fff;
      box-shadow: none;
    }

    .dark .lca-expanded-card {
      background: #1f2937;
      border-color: #374151;
    }

    .lca-expanded-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: .4rem;
      padding: .35rem .6rem;
      border-bottom: 1px solid #f3f4f6;
      background: rgba(249, 250, 251, .6);
    }

    .dark .lca-expanded-heading {
      border-bottom-color: #374151;
      background: rgba(17, 24, 39, .35);
    }

    .lca-lesson-row {
      display: flex;
      align-items: center;
      gap: .45rem;
      padding: .35rem .6rem;
      border-bottom: 1px solid #f3f4f6;
      transition: background-color 140ms ease;
    }

    .lca-lesson-row:last-child {
      border-bottom: 0;
    }

    .lca-lesson-row:hover {
      background: #eff6ff;
    }

    .dark .lca-lesson-row {
      border-bottom-color: #374151;
    }

    .dark .lca-lesson-row:hover {
      background: rgba(55, 65, 81, .5);
    }

    .lca-lesson-number {
      display: flex;
      width: 1.35rem;
      height: 1.35rem;
      flex: 0 0 auto;
      align-items: center;
      justify-content: center;
      border-radius: .35rem;
      background: #eff6ff;
      color: #2563eb;
      font-size: .65rem;
      font-weight: 700;
    }

    .dark .lca-lesson-number {
      background: rgba(30, 58, 138, .35);
      color: #93c5fd;
    }

    @keyframes lca-expand-in {
      from {
        opacity: 0;
        transform: translateY(-3px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @media (max-width: 840px) {
      .lca-column-header {
        display: none;
      }

      .lca-course-grid {
        grid-template-columns: minmax(0, 1fr) auto;
        column-gap: .5rem;
        row-gap: .35rem;
      }

      .lca-course-title {
        grid-column: 1;
        grid-row: 1;
      }

      .lca-type-cell,
      .lca-dt-cell,
      .lca-duration-cell,
      .lca-content-cell {
        grid-column: 1;
      }

      .lca-type-cell {
        grid-row: 2;
      }

      .lca-dt-cell {
        grid-row: 3;
      }

      .lca-duration-cell {
        grid-row: 4;
      }

      .lca-content-cell {
        grid-row: 5;
      }

      .lca-dt-cell,
      .lca-duration-cell,
      .lca-content-cell {
        display: flex;
        align-items: center;
        gap: .35rem;
      }

      .lca-mobile-label {
        display: inline-block;
        width: 2.75rem;
        color: #6b7280;
        font-size: .7rem;
      }

      .dark .lca-mobile-label {
        color: #9ca3af;
      }

      .lca-actions {
        grid-column: 2;
        grid-row: 1 / span 5;
      }
    }

    @media (max-width: 640px) {
      .lca-actions {
        gap: 0;
      }

      .lca-icon-button {
        width: 2.1rem;
        height: 2.1rem;
      }

      .lca-expanded-panel {
        padding: .25rem;
      }

      .lca-expanded-heading,
      .lca-lesson-row {
        padding-left: .45rem;
        padding-right: .45rem;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .lca-course-row,
      .lca-expanded-panel {
        animation: none;
        transition: none;
      }
    }
  `}</style>
);


/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const CONTENT_TYPE_OPTIONS = ["Video", "Document", "Text", "Quiz"];
const COURSE_TYPE_FILTERS = ["Training", "Policy"];
const TRAINING_CATEGORY_FILTERS = ["DT", "NDT", "Not set"];
const PUBLISH_STATUS_FILTERS = ["Published", "Draft"];

function SkeletonRows() {
  return (
    <div
      className="divide-y divide-gray-100 dark:divide-gray-700/60"
      aria-busy="true"
      aria-label="Loading courses"
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex animate-pulse items-center gap-3 px-3 py-3"
        >
          <div className="h-8 w-8 shrink-0 rounded-lg bg-gray-100 dark:bg-gray-700/60" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-2.5 w-2/3 rounded bg-gray-100 dark:bg-gray-700/60" />
          </div>
          <div className="hidden h-5 w-16 rounded-full bg-gray-100 dark:bg-gray-700/60 md:block" />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Learning Center Admin                                               */
/* ------------------------------------------------------------------ */

export default function LearningCenterAdmin({
  onAddCourse,
  breadcrumbItems,
}) {
  const { user } = useAuth();

  const adminId = getCurrentEmployeeId(user);
  const canManage = hasFullAccessRole(user?.role);

  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [courseTypes, setCourseTypes] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [contentTypes, setContentTypes] = useState([]);
  const [trainingCategories, setTrainingCategories] = useState([]);
  const [activeFilter, setActiveFilter] = useState(null);
  const [viewMode, setViewMode] = useState("list");
  const [cardPage, setCardPage] = useState(1);
  const cardsPerPage = 3;

  const [debouncedSearch] = useDebouncedValue(search, 300);

  const {
    courses,
    shown,
    total,
    loading,
    error,
    reload,
  } = useAdminCourses({
    adminId,
    search: debouncedSearch,
    courseTypes,
    statuses,
    contentTypes,
    trainingCategories,
    enabled: canManage,
  });

  const [sort, setSort] = useState({ key: "title", dir: "asc" });

  const handleSort = (key) => {
    setSort((previous) => ({
      key,
      dir:
        previous.key === key && previous.dir === "asc" ? "desc" : "asc",
    }));
  };

  const sortedCourses = useMemo(() => {
    return [...courses].sort((first, second) => {
      if (sort.key === "duration") {
        const firstDuration = first.duration_minutes;
        const secondDuration = second.duration_minutes;
        if (firstDuration == null && secondDuration == null) return 0;
        if (firstDuration == null) return 1;
        if (secondDuration == null) return -1;
        const result = firstDuration - secondDuration;
        return sort.dir === "asc" ? result : -result;
      }

      const result = first.title.localeCompare(second.title, undefined, {
        sensitivity: "base",
      });
      return sort.dir === "asc" ? result : -result;
    });
  }, [courses, sort.key, sort.dir]);

  const cardPageCount = Math.max(
    1,
    Math.ceil(sortedCourses.length / cardsPerPage)
  );
  const currentCardPage = Math.min(cardPage, cardPageCount);
  const firstCardIndex = (currentCardPage - 1) * cardsPerPage;
  const cardPageCourses = sortedCourses.slice(
    firstCardIndex,
    firstCardIndex + cardsPerPage
  );

  useEffect(() => {
    setCardPage(1);
  }, [courses, sort.key, sort.dir]);

  const activeFilterCount = [
    courseTypes,
    statuses,
    contentTypes,
    trainingCategories,
  ].filter((selection) => selection.length > 0).length;
  const filtersActive = search !== "" || activeFilterCount > 0;

  const clearFilters = () => {
    setSearch("");
    setCourseTypes([]);
    setStatuses([]);
    setContentTypes([]);
    setTrainingCategories([]);
  };

  const handleAdd = () =>
    onAddCourse
      ? onAddCourse()
      : toast("Add Course isn't connected yet.");

  const card =
    "bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm";

  const link =
    `text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer ${FOCUS_RING}`;

  const header = (
    <div className="flex shrink-0 flex-col gap-1.5">
      <Breadcrumb items={breadcrumbItems} maxVisible={5} />

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-tight text-gray-900 dark:text-white">
            Manage Courses
          </h1>

          <p className="truncate text-xs text-gray-500 dark:text-gray-400">
            Create and manage the training courses and policies employees see in their catalog.
          </p>
        </div>

        {canManage && (
          <div className="flex shrink-0 items-center gap-2">
            <span
              className="whitespace-nowrap text-xs text-gray-500 dark:text-gray-400"
              aria-live="polite"
            >
              {shown} of {total} courses
            </span>
            {filtersActive && (
              <button
                type="button"
                onClick={clearFilters}
                className={`whitespace-nowrap text-xs ${link}`}
              >
                Clear filters
              </button>
            )}
            {searchOpen && (
              <label className="relative w-48 sm:w-56">
                <span className="sr-only">Search courses</span>
                <input
                  autoFocus
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setSearchOpen(false);
                  }}
                  placeholder="Search courses..."
                  className={`w-full rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-xs text-gray-900 placeholder-gray-400 shadow-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white ${FOCUS_RING}`}
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  >
                    <FiX className="h-3.5 w-3.5" />
                  </button>
                )}
              </label>
            )}
            <button
              type="button"
              onClick={() => setSearchOpen((open) => !open)}
              aria-label={searchOpen ? "Hide course search" : "Search courses"}
              aria-expanded={searchOpen}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 ${FOCUS_RING}`}
            >
              <FiSearch className="h-4 w-4" aria-hidden="true" />
            </button>
            <CourseHeaderFilter
              id="publish-status"
              label=""
              options={PUBLISH_STATUS_FILTERS}
              selected={statuses}
              activeFilter={activeFilter}
              onToggle={setActiveFilter}
              onApply={setStatuses}
            />
            <div
              className="inline-flex items-center rounded-full bg-gray-100 p-0.5 dark:bg-gray-900/40"
              role="group"
              aria-label="Course view"
            >
              <button
                type="button"
                aria-label="Card view"
                aria-pressed={viewMode === "cards"}
                onClick={() => setViewMode("cards")}
                className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                  viewMode === "cards"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700"
                } ${FOCUS_RING}`}
              >
                <FiGrid className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="List view"
                aria-pressed={viewMode === "list"}
                onClick={() => setViewMode("list")}
                className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                  viewMode === "list"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700"
                } ${FOCUS_RING}`}
              >
                <FiList className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <button
              type="button"
              onClick={handleAdd}
              className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 ${FOCUS_RING}`}
            >
              <FiPlus className="h-4 w-4" aria-hidden="true" />
              Add Course
            </button>
          </div>
        )}
      </div>
    </div>
  );

  if (!canManage) {
    return (
      <>
        <LearningCenterAdminStyles />
        {header}

        <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
          Only Admin, Department, or HR can manage courses.
        </p>
      </>
    );
  }

  const firstLoad = loading && courses.length === 0 && !error;

  return (
    <>
      <LearningCenterAdminStyles />

      {header}

      {/* Course list. Do not create a separate scrolling region here. */}
      <div className={`${card} shrink-0 overflow-visible`}>
        {firstLoad ? (
          <SkeletonRows />
        ) : error && courses.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-gray-500 dark:text-gray-400">
            <FiAlertTriangle
              className="h-6 w-6 text-amber-500"
              aria-hidden="true"
            />

            <p className="text-sm font-medium">{error}</p>

            <button
              type="button"
              onClick={reload}
              className={link}
            >
              Try again
            </button>
          </div>
        ) : courses.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500">
              <FiInbox className="h-5 w-5" aria-hidden="true" />
            </span>

            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
              {total === 0
                ? "No courses yet"
                : "No courses match these filters"}
            </p>

            <p className="max-w-xs text-xs text-gray-500 dark:text-gray-400">
              {total === 0
                ? "Add your first course to build the catalog employees see."
                : "Try a different search, or clear the filters to see every course."}
            </p>

            {total === 0 ? (
              <button
                type="button"
                onClick={handleAdd}
                className={`mt-1 inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 ${FOCUS_RING}`}
              >
                <FiPlus className="h-4 w-4" aria-hidden="true" />
                Add Course
              </button>
            ) : (
              filtersActive && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className={`mt-1 ${link}`}
                >
                  Clear filters
                </button>
              )
            )}
          </div>
        ) : viewMode === "cards" ? (
          <div className="lca-card-panel p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                Courses
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Showing {Math.min(cardsPerPage, sortedCourses.length)} of{" "}
                {shown} courses
              </span>
            </div>
            <div className="lca-card-grid">
              {cardPageCourses.map((course) => (
                <AdminCourseCard
                  key={course.course_id}
                  course={course}
                />
              ))}
            </div>
            {cardPageCount > 1 && (
              <nav
                className="mt-5 flex items-center justify-end gap-3 border-t border-gray-100 pt-4 dark:border-gray-700"
                aria-label="Course card pages"
              >
                <span className="mr-auto text-xs text-gray-500 dark:text-gray-400">
                  {firstCardIndex + 1}–
                  {Math.min(firstCardIndex + cardsPerPage, sortedCourses.length)}{" "}
                  of {sortedCourses.length} courses
                </span>
                <button
                  type="button"
                  onClick={() => setCardPage((page) => Math.max(1, page - 1))}
                  disabled={currentCardPage === 1}
                  aria-label="Previous course cards"
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 ${FOCUS_RING}`}
                >
                  <FiChevronLeft className="h-4 w-4" aria-hidden="true" />
                </button>
                <span
                  className="min-w-12 text-center text-sm font-medium tabular-nums text-gray-600 dark:text-gray-300"
                  aria-live="polite"
                >
                  {currentCardPage} / {cardPageCount}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setCardPage((page) => Math.min(cardPageCount, page + 1))
                  }
                  disabled={currentCardPage === cardPageCount}
                  aria-label="Next course cards"
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 ${FOCUS_RING}`}
                >
                  <FiChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </nav>
            )}
          </div>
        ) : (
          <div
            className={`transition-opacity ${
              loading ? "opacity-60" : ""
            }`}
          >
            {/* Column headings */}
            <div className="border-b border-gray-100 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:border-gray-700/60 dark:text-gray-400">
              <div className="lca-column-header">
                <button
                  type="button"
                  onClick={() => handleSort("title")}
                  aria-label={`Sort course name ${sort.key === "title" && sort.dir === "asc" ? "descending" : "ascending"}`}
                  className={`inline-flex items-center gap-1 text-left ${FOCUS_RING}`}
                >
                  Course
                  {sort.key === "title" &&
                    (sort.dir === "asc" ? (
                      <FiArrowUp className="h-3 w-3" aria-hidden="true" />
                    ) : (
                      <FiArrowDown className="h-3 w-3" aria-hidden="true" />
                    ))}
                </button>
                <CourseHeaderFilter
                  id="course-type"
                  label="Type"
                  options={COURSE_TYPE_FILTERS}
                  selected={courseTypes}
                  activeFilter={activeFilter}
                  onToggle={setActiveFilter}
                  onApply={setCourseTypes}
                />
                <CourseHeaderFilter
                  id="training-category"
                  label="DT/NDT"
                  options={TRAINING_CATEGORY_FILTERS}
                  selected={trainingCategories}
                  activeFilter={activeFilter}
                  onToggle={setActiveFilter}
                  onApply={setTrainingCategories}
                />
                <button
                  type="button"
                  onClick={() => handleSort("duration")}
                  aria-label={`Sort duration ${sort.key === "duration" && sort.dir === "asc" ? "descending" : "ascending"}`}
                  className={`inline-flex items-center gap-1 text-left ${FOCUS_RING}`}
                >
                  Duration
                  {sort.key === "duration" &&
                    (sort.dir === "asc" ? (
                      <FiArrowUp className="h-3 w-3" aria-hidden="true" />
                    ) : (
                      <FiArrowDown className="h-3 w-3" aria-hidden="true" />
                    ))}
                </button>
                <CourseHeaderFilter
                  id="content-type"
                  label="Content"
                  options={CONTENT_TYPE_OPTIONS}
                  selected={contentTypes}
                  activeFilter={activeFilter}
                  onToggle={setActiveFilter}
                  onApply={setContentTypes}
                />
                <span className="text-right">Info</span>
              </div>
            </div>

            <div className="divide-y divide-gray-100 dark:divide-gray-700/60">
              {sortedCourses.map((course) => (
                <AdminCourseRow
                  key={course.course_id}
                  course={course}
                  search={debouncedSearch}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
