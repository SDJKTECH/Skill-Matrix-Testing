// Maps a raw get_emp_training_course_v2 row (emp_all_course, the catalog
// fetch) to the shape CourseCard/CourseDetailModal expect. materialUrl is
// always null here — content_url only ever comes from the on-demand
// emp_course lookup fired when a course is opened (see useCourseDetail).
export function adaptCourse(row) {
  return {
    id: row.course_id,
    title: row.title,
    description: row.description || "",
    type: row.course_type,
    category: row.course_type,
    level: null,
    durationMinutes: row.duration_minutes ?? 0,
    enrollmentStatus: row.enrollment_status ?? null,
    progressPct: row.progress_pct ?? null,
    materialUrl: null,
  };
}
