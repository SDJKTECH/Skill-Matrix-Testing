import { useEffect, useState } from "react";
import { useAuth } from "../../../hooks/useAuth";
import { fetchEmpAllCourses } from "../api/trainingCourseApi";
import { adaptCourse } from "../services/courseAdapter";

// Bulk catalog fetch for the grid (mode=emp_all_course) — the per-course
// content_url is fetched on demand when a course is actually opened, not
// prefetched here (see useCourseDetail).
export function useTrainingCourses() {
  const { user } = useAuth();
  // dbEmployeeId is the resolved employee.id primary key; employeeId alone
  // is the raw HR code from the JWT/SSO profile and won't match DB rows —
  // same fallback every other feature in this app uses (see AuthContext.jsx).
  const employeeId = user?.dbEmployeeId ?? user?.employeeId;
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!employeeId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchEmpAllCourses(employeeId)
      .then((rows) => {
        if (!cancelled) setCourses(rows.map(adaptCourse));
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Failed to load courses");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  return { courses, loading, error };
}
