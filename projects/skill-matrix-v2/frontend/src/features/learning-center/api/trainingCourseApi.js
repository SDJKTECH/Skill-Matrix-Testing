import axios from "axios";
import { getApiUrl } from "../../../config/apiConfig";

async function fetchCourses(mode, employeeId, courseId, lessonId) {
  const response = await axios.get(getApiUrl("get_emp_training_course_v2"), {
    params: {
      employee_id: employeeId,
      mode,
      ...(courseId != null ? { course_id: courseId } : {}),
      ...(lessonId != null ? { lesson_id: lessonId } : {}),
    },
  });
  return response.data?.results ?? [];
}

// mode=emp_all_course — full published catalog + this employee's enrollment status if any. Bulk, fetched once on page load.
export const fetchEmpAllCourses = (employeeId) => fetchCourses("emp_all_course", employeeId);

// mode=emp_course — on-demand, single-lesson lookup fired when a course/lesson is opened; returns its signed
// content_url. lessonId is optional — omitted, the backend defaults to that course's first lesson.
export const fetchEmpCourse = (employeeId, courseId, lessonId) =>
  fetchCourses("emp_course", employeeId, courseId, lessonId).then((rows) => rows[0] ?? null);

// mode=emp_course_lessons — every lesson in a course + this employee's per-lesson progress, for the lesson-list sidebar.
export const fetchCourseLessons = (employeeId, courseId) => fetchCourses("emp_course_lessons", employeeId, courseId);

// mode=download_content — built here (not returned by the backend) when content_proxy_required is true, i.e.
// the server couldn't sign a direct GCS URL (local dev ADC) and the file must be streamed through this function instead.
export const getDownloadContentUrl = (employeeId, courseId, lessonId) => {
  const params = new URLSearchParams({
    mode: "download_content",
    employee_id: employeeId,
    course_id: courseId,
    ...(lessonId != null ? { lesson_id: lessonId } : {}),
  });
  return `${getApiUrl("get_emp_training_course_v2")}?${params}`;
};

// A Video lesson's HLS manifest, once material_upload_status is Ready (see useCourseDetail).
// Path-based, not query-string: the manifest references sibling playlists/segments by relative filename,
// and relative-URL resolution drops a query string, so employee_id/course_id/lesson_id must live in the path
// for those follow-up requests to land back on this same route (see stream_hls_asset in the backend).
export const getHlsManifestUrl = (employeeId, courseId, lessonId) =>
  `${getApiUrl("get_emp_training_course_v2")}/stream-hls/${employeeId}/${courseId}/${lessonId}/master.m3u8`;

// Generic POST to get_emp_training_course_v2 — payload must carry its own
// `mode` (see main.py's handle_post dispatch); this function doesn't know or
// care which mode. useBeacon=true fires navigator.sendBeacon instead of
// axios — for the tab/app-close case, where an in-flight fetch would
// otherwise get cancelled mid-request before it lands.
function postEmpTrainingCourseAction(payload, { useBeacon = false } = {}) {
  const url = getApiUrl("get_emp_training_course_v2");
  if (useBeacon && navigator.sendBeacon) {
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    navigator.sendBeacon(url, blob);
    return;
  }
  return axios.post(url, payload);
}

// mode=saveEmpCourseProgress — resume position + status for a lesson, rolled up into the enrollment.
export const saveEmpCourseProgress = (payload, options) =>
  postEmpTrainingCourseAction({ mode: "saveEmpCourseProgress", ...payload }, options);
