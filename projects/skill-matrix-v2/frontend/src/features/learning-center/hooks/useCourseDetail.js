import { useEffect, useState } from "react";
import { useAuth } from "../../../hooks/useAuth";
import { fetchEmpCourse, getDownloadContentUrl, getHlsManifestUrl } from "../api/trainingCourseApi";

// On-click lookup — fired when a course (or a specific lesson within it) is
// opened, not prefetched for the whole catalog. Returns null (not enrolled,
// or no content yet) until resolved, so the caller can show the existing
// "Coming Soon" state while loading and only flip to the viewer once
// content_url is confirmed. lessonId is optional — omitted, the backend
// defaults to that course's first lesson.
export function useCourseDetail(courseId, lessonId) {
  const { user } = useAuth();
  const employeeId = user?.dbEmployeeId ?? user?.employeeId;
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setDetail(null);
    if (!courseId || !employeeId) return;

    let cancelled = false;
    setLoading(true);

    fetchEmpCourse(employeeId, courseId, lessonId)
      .then((row) => {
        if (cancelled || !row) return;
        // Video is always proxied through stream-hls once Ready, never signed directly (see
        // fetch_emp_courses) — a signed URL breaks the moment the manifest's sibling references
        // get followed. Other material types keep the existing signed-URL / proxy-fallback behavior.
        const content_url =
          row.material_type === "Video"
            ? row.material_upload_status === "Ready"
              ? getHlsManifestUrl(employeeId, courseId, row.lesson_id)
              : null
            : row.content_proxy_required
              ? getDownloadContentUrl(employeeId, courseId, row.lesson_id)
              : row.content_url;
        setDetail({ ...row, content_url });
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [courseId, lessonId, employeeId]);

  return { detail, loading };
}
