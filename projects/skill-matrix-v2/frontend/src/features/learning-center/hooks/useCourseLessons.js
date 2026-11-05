import { useEffect, useState } from "react";
import { useAuth } from "../../../hooks/useAuth";
import { fetchCourseLessons } from "../api/trainingCourseApi";

// Lesson list for the course sidebar — fired once per course open, separate from
// useCourseDetail (which fetches one lesson's actual content_url at a time).
export function useCourseLessons(courseId) {
  const { user } = useAuth();
  const employeeId = user?.dbEmployeeId ?? user?.employeeId;
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLessons([]);
    if (!courseId || !employeeId) return;

    let cancelled = false;
    setLoading(true);

    fetchCourseLessons(employeeId, courseId)
      .then((rows) => {
        if (!cancelled) setLessons(rows);
      })
      .catch(() => {
        if (!cancelled) setLessons([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [courseId, employeeId]);

  return { lessons, loading };
}
