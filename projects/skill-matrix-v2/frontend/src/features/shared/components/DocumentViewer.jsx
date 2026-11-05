import React, { useEffect, useRef, useState } from "react";
import { Document, Page } from "react-pdf";
import {
  FiChevronLeft,
  FiChevronRight,
  FiZoomIn,
  FiZoomOut,
  FiDownload,
  FiExternalLink,
  FiAlertTriangle,
} from "react-icons/fi";
import { FOCUS_RING } from "../config/focusRing";
import { useProgressSync } from "../hooks/useProgressSync";
import VideoPlayer from "./VideoPlayer";

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg"];
const VIDEO_EXTENSIONS = ["mp4", "webm", "ogg", "mov"];
const MIN_SCALE = 0.5;
const MAX_SCALE = 2.5;
const SCALE_STEP = 0.25;

function inferFileType(fileUrl, explicitType) {
  if (explicitType) return explicitType;
  const ext = fileUrl?.split(".").pop()?.split("?")[0]?.toLowerCase();
  if (ext === "pdf") return "pdf";
  if (IMAGE_EXTENSIONS.includes(ext)) return "image";
  if (VIDEO_EXTENSIONS.includes(ext)) return "video";
  return "unsupported";
}

function ToolbarButton({ onClick, disabled, label, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${FOCUS_RING}`}
    >
      {children}
    </button>
  );
}

// Shown when the url has no renderer (e.g. .docx) or no url was given at all.
function OpenExternallyNotice({ fileUrl, title, message }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 h-full py-16 text-center text-sm text-gray-500 dark:text-gray-400">
      <FiAlertTriangle className="h-6 w-6" />
      <p>{message}</p>
      {fileUrl && (
        <a
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          download={title}
          className={`inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:underline ${FOCUS_RING}`}
        >
          <FiExternalLink className="h-4 w-4" /> Open in new tab
        </a>
      )}
    </div>
  );
}

/**
 * Read-only viewer for a PDF, image, or video, given just a `fileUrl`.
 * Renders standalone (drop it anywhere) or inside OverlayDialog.
 */
export default function DocumentViewer({
  fileUrl,
  fileType,
  mimeType,
  title,
  className = "h-[80vh]",
  allowDownload = false,
  onLastPageReached,
  courseId,
  lessonId,
  initialPosition,
}) {
  const type = inferFileType(fileUrl, fileType);

  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(initialPosition || 1);
  const [scale, setScale] = useState(1);
  const [failed, setFailed] = useState(false);
  const [pageSize, setPageSize] = useState(null);

  const { save } = useProgressSync("saveEmpCourseProgress", {
    course_id: courseId,
    lesson_id: lessonId,
  });

  // Skip on mount: Document's Suspense-resolved onLoadSuccess can fire before this
  // effect's commit, and an unconditional reset here would wipe the numPages it just set.
  const isMounted = useRef(false);
  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;
      return;
    }
    setNumPages(null);
    setPageNumber(initialPosition || 1);
    setScale(1);
    setFailed(false);
    setPageSize(null);
    // initialPosition deliberately excluded: only meant to seed state on a genuine
    // fileUrl change (a different document opened), not on every re-fetch of the
    // same course's progress (which would otherwise yank the page back mid-read).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUrl]);

  useEffect(() => {
    if (type !== "pdf" || !numPages) return;
    if (pageNumber >= numPages) onLastPageReached?.();
    save({
      position_seconds: pageNumber,
      progress_pct: Math.round((pageNumber / numPages) * 100),
      status: pageNumber >= numPages ? "Completed" : "In Progress",
    });
    // save is stable (see useProgressSync) — safe to omit from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, pageNumber, numPages, onLastPageReached]);

  // These fallbacks keep the same `className` sizing as the real player below them —
  // without it the content pane collapses to the message's own size instead of holding
  // its place, which shoves the lesson sidebar/layout out of shape around it.
  if (!fileUrl) {
    return (
      <div className={`flex flex-col ${className}`}>
        <OpenExternallyNotice message="No document to display." />
      </div>
    );
  }

  if (type === "unsupported") {
    return (
      <div className={`flex flex-col ${className}`}>
        <OpenExternallyNotice
          fileUrl={fileUrl}
          title={title}
          message="This file type can't be previewed here."
        />
      </div>
    );
  }

  if (failed) {
    return (
      <div className={`flex flex-col ${className}`}>
        <OpenExternallyNotice
          fileUrl={fileUrl}
          title={title}
          message="This document couldn't be loaded."
        />
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${className}`}>
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
          {type === "pdf" && numPages > 1 && (
            <>
              <ToolbarButton
                label="Previous page"
                disabled={pageNumber <= 1}
                onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
              >
                <FiChevronLeft className="h-4 w-4" />
              </ToolbarButton>
              <span className="px-1 tabular-nums">
                Page {pageNumber} of {numPages}
              </span>
              <ToolbarButton
                label="Next page"
                disabled={pageNumber >= numPages}
                onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
              >
                <FiChevronRight className="h-4 w-4" />
              </ToolbarButton>
            </>
          )}
        </div>

        <div className="flex items-center gap-1">
          {type !== "video" && (
            <>
              <ToolbarButton
                label="Zoom out"
                disabled={scale <= MIN_SCALE}
                onClick={() => setScale((s) => Math.max(MIN_SCALE, s - SCALE_STEP))}
              >
                <FiZoomOut className="h-4 w-4" />
              </ToolbarButton>
              <span className="px-1 text-xs text-gray-500 dark:text-gray-400 tabular-nums w-10 text-center">
                {Math.round(scale * 100)}%
              </span>
              <ToolbarButton
                label="Zoom in"
                disabled={scale >= MAX_SCALE}
                onClick={() => setScale((s) => Math.min(MAX_SCALE, s + SCALE_STEP))}
              >
                <FiZoomIn className="h-4 w-4" />
              </ToolbarButton>
            </>
          )}
          {allowDownload && (
            <a
              href={fileUrl}
              download={title}
              aria-label="Download"
              title="Download"
              className={`p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700 cursor-pointer ${FOCUS_RING}`}
            >
              <FiDownload className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto flex justify-center bg-gray-50 dark:bg-gray-900/40 rounded-b-lg">
        {type === "pdf" ? (
          <Document
            file={fileUrl}
            onLoadSuccess={({ numPages: n }) => setNumPages(n)}
            onLoadError={() => setFailed(true)}
            loading={<p className="py-16 text-sm text-gray-500 dark:text-gray-400">Loading document…</p>}
          >
            <div style={pageSize ? { minWidth: pageSize.width, minHeight: pageSize.height } : undefined}>
              <Page
                pageNumber={pageNumber}
                scale={scale}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                loading={null}
                onLoadSuccess={(page) => setPageSize({ width: page.width, height: page.height })}
              />
            </div>
          </Document>
        ) : type === "video" ? (
          <VideoPlayer
            fileUrl={fileUrl}
            mimeType={mimeType}
            onEnded={onLastPageReached}
            onError={() => setFailed(true)}
            courseId={courseId}
            lessonId={lessonId}
            initialPosition={initialPosition}
          />
        ) : (
          <img
            src={fileUrl}
            alt={title || "Document preview"}
            onLoad={() => onLastPageReached?.()}
            onError={() => setFailed(true)}
            style={{ transform: `scale(${scale})`, transformOrigin: "top center" }}
            className="max-w-full h-auto"
          />
        )}
      </div>
    </div>
  );
}
