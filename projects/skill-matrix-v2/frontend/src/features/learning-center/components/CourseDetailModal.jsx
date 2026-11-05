import React, { Suspense, lazy, useEffect, useState } from "react";
import { FiCheckCircle, FiChevronLeft, FiChevronRight } from "react-icons/fi";
import toast from "react-hot-toast";
import OverlayDialog from "../../shared/components/OverlayDialog";
import ErrorBoundary from "../../training/training-batch/components/ErrorBoundary";
import { formatDuration } from "../services/catalogFilters";
import { useCourseDetail } from "../hooks/useCourseDetail";
import { useCourseLessons } from "../hooks/useCourseLessons";

// react-pdf/pdfjs-dist is ~650KB gzipped — load it only when a course
// actually has a document to show, not in the app's initial bundle.
const DocumentViewer = lazy(() => import("../../shared/components/DocumentViewer"));

// DocumentViewer/VideoPlayer infer type from the URL's file extension, which the download_content
// proxy URL (local-dev signing fallback) doesn't have — pass both explicitly instead.
// Video is always the HLS manifest (see useCourseDetail), never a raw .mp4, so its mime type must
// tell video.js to use its HLS engine, not guess from the (extensionless) stream-hls URL.
const MATERIAL_TYPE_TO_FILE_TYPE = { Video: "video", Document: "pdf" };
const MATERIAL_TYPE_TO_MIME_TYPE = { Video: "application/x-mpegURL", Document: "application/pdf" };

// Shown instead of the player while a video lesson's transcode hasn't finished (or failed) — see
// material_upload_status in fetch_emp_courses. No content_url arrives from the backend in either case.
const VIDEO_STATUS_MESSAGES = {
  Processing: "This video is still processing — check back in a few minutes.",
  Failed: "This video couldn't be processed. Please contact your admin.",
};

// Content pane and sidebar share this height so the layout holds its shape
// whether the lesson is playing, loading, or failed to load.
const CONTENT_HEIGHT = "h-[60vh]";

function LessonListItem({ lesson, active, completed, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors cursor-pointer ${
        active
          ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
          : "hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300"
      }`}
    >
      {completed ? (
        <FiCheckCircle className="h-4 w-4 mt-0.5 shrink-0 text-green-600 dark:text-green-400" />
      ) : (
        <span
          className={`h-4 w-4 mt-0.5 shrink-0 rounded-full border text-[10px] leading-none flex items-center justify-center ${
            active ? "border-blue-500 text-blue-600 dark:text-blue-400" : "border-gray-300 dark:border-gray-600 text-gray-400"
          }`}
        >
          {lesson.sequence}
        </span>
      )}
      <span className="min-w-0">
        <span className="block font-medium leading-snug line-clamp-2">{lesson.title}</span>
        <span className="block mt-0.5 text-xs text-gray-400 dark:text-gray-500">
          {lesson.material_type} · {formatDuration(lesson.duration_minutes)}
        </span>
      </span>
    </button>
  );
}

export default function CourseDetailModal({ course, onClose }) {
  const [selectedLessonId, setSelectedLessonId] = useState(null);
  const [reachedEnd, setReachedEnd] = useState(false);
  // Lessons already Completed server-side (resumed course) are read straight off `lessons`;
  // this only tracks ones completed just now, in this viewing session.
  const [sessionCompletedIds, setSessionCompletedIds] = useState(() => new Set());

  const { lessons, loading: lessonsLoading } = useCourseLessons(course?.id);
  const { detail, loading: contentLoading } = useCourseDetail(course?.id, selectedLessonId);
  const contentUrl = detail?.content_url ?? null;

  // New course opened — clear per-session state; the lessons-loaded effect below picks a starting lesson.
  useEffect(() => {
    setSelectedLessonId(null);
    setReachedEnd(false);
    setSessionCompletedIds(new Set());
  }, [course?.id]);

  // Once lessons load, land on the first not-yet-completed one (or the first lesson if none/all done).
  useEffect(() => {
    if (!lessons.length || selectedLessonId) return;
    const firstIncomplete = lessons.find((l) => l.progress_status !== "Completed");
    setSelectedLessonId((firstIncomplete ?? lessons[0]).lesson_id);
  }, [lessons, selectedLessonId]);

  useEffect(() => {
    setReachedEnd(false);
  }, [selectedLessonId]);

  if (!course) return null;

  const currentIndex = lessons.findIndex((l) => l.lesson_id === selectedLessonId);
  const isLessonComplete = (lessonId) =>
    sessionCompletedIds.has(lessonId) || lessons.find((l) => l.lesson_id === lessonId)?.progress_status === "Completed";
  const currentComplete = isLessonComplete(selectedLessonId);
  const canGoPrevious = currentIndex > 0;
  const canGoNext = currentIndex >= 0 && currentIndex < lessons.length - 1 && currentComplete;
  const showMarkComplete = reachedEnd || currentComplete;

  const goToLesson = (lessonId) => setSelectedLessonId(lessonId);
  const handlePrevious = () => canGoPrevious && goToLesson(lessons[currentIndex - 1].lesson_id);
  const handleNext = () => canGoNext && goToLesson(lessons[currentIndex + 1].lesson_id);
  const handleComplete = () => {
    setSessionCompletedIds((prev) => new Set(prev).add(selectedLessonId));
    toast.success("Marked as complete!");
  };

  return (
    <OverlayDialog open={!!course} onClose={onClose} title={course.title} size="xl">
      <div className="flex flex-col gap-4">
        <div className="flex gap-5">
          <ErrorBoundary label="the course material">
            <Suspense
              fallback={
                <div className={`${CONTENT_HEIGHT} flex-1 min-w-0 flex items-center justify-center text-sm text-gray-500 dark:text-gray-400`}>
                  Loading the content
                </div>
              }
            >
              {contentUrl ? (
                <DocumentViewer
                  fileUrl={contentUrl}
                  fileType={MATERIAL_TYPE_TO_FILE_TYPE[detail?.material_type]}
                  mimeType={MATERIAL_TYPE_TO_MIME_TYPE[detail?.material_type]}
                  title={detail?.title || course.title}
                  className={`${CONTENT_HEIGHT} flex-1 min-w-0`}
                  onLastPageReached={() => setReachedEnd(true)}
                  courseId={course.id}
                  lessonId={detail?.lesson_id}
                  initialPosition={detail?.last_position_seconds}
                />
              ) : (
                <div className={`${CONTENT_HEIGHT} flex-1 min-w-0 flex items-center justify-center text-sm text-gray-500 dark:text-gray-400`}>
                  {contentLoading || lessonsLoading
                    ? "Loading the content"
                    : VIDEO_STATUS_MESSAGES[detail?.material_upload_status] || "This lesson has no content available."}
                </div>
              )}
            </Suspense>
          </ErrorBoundary>

          <div className="w-72 shrink-0 flex flex-col">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 line-clamp-3">{course.description}</p>
            <div className={`flex-1 overflow-y-auto space-y-1 pr-1 ${CONTENT_HEIGHT}`}>
              {lessons.length > 0 ? (
                lessons.map((lesson) => (
                  <LessonListItem
                    key={lesson.lesson_id}
                    lesson={lesson}
                    active={lesson.lesson_id === selectedLessonId}
                    completed={isLessonComplete(lesson.lesson_id)}
                    onClick={() => goToLesson(lesson.lesson_id)}
                  />
                ))
              ) : (
                <p className="text-xs text-gray-400 dark:text-gray-500 py-2">
                  {lessonsLoading ? "Loading lessons…" : "No lessons available for this course yet."}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          <button
            type="button"
            onClick={handlePrevious}
            disabled={!canGoPrevious}
            className="inline-flex items-center gap-1.5 rounded-lg text-sm font-medium px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <FiChevronLeft className="h-4 w-4" />
            Previous
          </button>

          <div className="flex items-center gap-2">
            {showMarkComplete && (
              <button
                type="button"
                onClick={handleComplete}
                disabled={currentComplete}
                className={`inline-flex items-center gap-1.5 rounded-lg text-sm font-medium px-4 py-2.5 ${
                  currentComplete
                    ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400 cursor-default"
                    : "bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
                }`}
              >
                <FiCheckCircle className="h-4 w-4" />
                {currentComplete ? "Completed" : "Mark as Complete"}
              </button>
            )}
            <button
              type="button"
              onClick={handleNext}
              disabled={!canGoNext}
              title={!currentComplete ? "Complete this lesson to continue" : undefined}
              className="inline-flex items-center gap-1.5 rounded-lg text-sm font-medium px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              Next
              <FiChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </OverlayDialog>
  );
}
