import axios from "axios";
import { getApiUrl } from "../../../config/apiConfig";

const COURSE_URL = getApiUrl("add_training_course_v2");

/** Create a course, then its lessons, then upload each lesson's file. */
export const saveCourse = async (course) => {
  const { title, description, course_type, duration_minutes, course_status } = course;
  const { data: created } = await axios.post(COURSE_URL, {
    title,
    description,
    course_type,
    duration_minutes,
    course_status,
  });

  // Quiz lessons are not supported on the backend yet.
  for (const lesson of course.lessons.filter((item) => item.material_type !== "quiz")) {
    const { data } = await axios.post(`${COURSE_URL}/lessons`, {
      course_id: created.course_id,
      sequence: lesson.sequence,
      title: lesson.title,
      material_type: lesson.material_type.charAt(0).toUpperCase() + lesson.material_type.slice(1),
      duration_minutes: lesson.duration_minutes,
      text_body: lesson.text_body,
    });

    if (lesson.file instanceof File) {
      const file = lesson.file;
      // Upload straight to GCS via a signed URL instead of through the Cloud Run
      // function — a multipart POST of the file body hits Cloud Run's 32MB request
      // limit (413) for anything but small files.
      const { data: uploadInfo } = await axios.post(`${COURSE_URL}/upload-url`, {
        filename: file.name,
        content_type: file.type,
      });
      // GCS's resumable-upload completion response never carries CORS headers, so the browser
      // always flags this as a network error even on success — finalize's blob.exists() below is the real check.
      try {
        await axios.put(uploadInfo.upload_url, file, {
          headers: { "Content-Type": file.type },
        });
      } catch (uploadError) {
        if (uploadError.code !== "ERR_NETWORK") throw uploadError;
      }
      const finalizeRoute = lesson.material_type === "video" ? "finalize-video" : "finalize-document";
      await axios.post(`${COURSE_URL}/lessons/${finalizeRoute}`, {
        lesson_id: data.lesson_id,
        material_path: uploadInfo.material_path,
      });
    }
  }
  return { course_id: created.course_id };
};

// The endpoint has no filters or lesson types, so filter here.
// The Content filter is skipped.
export const listCourses = async (params = {}) => {
  const { search = "", courseTypes = [], statuses = [], trainingCategories = [] } = params;
  const { data } = await axios.get(COURSE_URL, { params: { mode: "all_course_list" } });
  const query = search.trim().toLowerCase();
  const courses = data.courses.filter(
    (course) =>
      (!query || `${course.title} ${course.description || ""}`.toLowerCase().includes(query)) &&
      (!courseTypes.length || courseTypes.includes(course.course_type)) &&
      (!statuses.length || statuses.includes(course.course_status)) &&
      (!trainingCategories.length || trainingCategories.includes("Not set"))
  );
  return { courses, shown: courses.length, total: data.total };
};
