import React, { useMemo, useState } from "react";
import { FiBookOpen, FiAlertTriangle } from "react-icons/fi";
import { filterCatalog } from "../services/catalogFilters";
import { useTrainingCourses } from "../hooks/useTrainingCourses";
import CatalogFilterBar from "./CatalogFilterBar";
import CourseCard from "./CourseCard";
import CourseDetailModal from "./CourseDetailModal";

const EMPTY_FILTERS = { search: "", type: "", duration: "" };

export default function LearningCenterCatalog() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [activeCourse, setActiveCourse] = useState(null);
  const { courses, loading, error } = useTrainingCourses();

  const results = useMemo(() => filterCatalog(courses, filters), [courses, filters]);

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center gap-2 mb-4">
        <FiBookOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">Employee Learning Center</h1>
      </div>

      <CatalogFilterBar filters={filters} onChange={setFilters} courses={courses} />

      {loading ? (
        <p className="mt-10 text-center text-sm text-gray-500 dark:text-gray-400">Loading courses…</p>
      ) : error ? (
        <div className="mt-10 flex flex-col items-center justify-center gap-2 text-center">
          <FiAlertTriangle className="h-5 w-5 text-amber-500" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Couldn't load courses: {error}</p>
        </div>
      ) : (
        <>
          <p className="mt-4 mb-3 text-xs text-gray-500 dark:text-gray-400">
            {results.length} result{results.length !== 1 ? "s" : ""}
          </p>

          {results.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {results.map((course) => (
                <CourseCard key={course.id} course={course} onOpen={setActiveCourse} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No courses match your filters. Try clearing some of them.
              </p>
            </div>
          )}
        </>
      )}

      <CourseDetailModal course={activeCourse} onClose={() => setActiveCourse(null)} />
    </div>
  );
}
