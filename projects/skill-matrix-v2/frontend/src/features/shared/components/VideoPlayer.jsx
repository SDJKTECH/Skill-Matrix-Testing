import React, { useEffect, useRef } from "react";
import videojs from "video.js";
import "video.js/dist/video-js.css";
import "./VideoPlayer.css";
import { useProgressSync } from "../hooks/useProgressSync";

// Grace window for a seek: anything past "furthest watched + this" gets snapped back.
const SEEK_TOLERANCE_SECONDS = 0.5;
const SAVE_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

// Wraps video.js: tracks furthest-watched time in-memory (seeded from
// initialPosition — server-provided resume point, see employee_course_progress),
// resumes there on load, and snaps any seek past that point back — so
// finishing requires actually watching. Progress is saved to the backend on
// a 2-minute interval while playing, on pause/ended, and flushed on tab/app
// close via useProgressSync (not localStorage anymore — that broke resume
// every time the signed content_url was re-issued, since the url itself was
// the old cache key).
export default function VideoPlayer({ fileUrl, mimeType, courseId, lessonId, initialPosition = 0, onEnded, onError }) {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const { save, flush } = useProgressSync("saveEmpCourseProgress", {
    course_id: courseId,
    lesson_id: lessonId,
  });

  useEffect(() => {
    const maxWatched = { current: initialPosition || 0 };

    const videoEl = document.createElement("video-js");
    videoEl.classList.add("vjs-big-play-centered");
    containerRef.current.appendChild(videoEl);

    const player = videojs(videoEl, {
      controls: true,
      fill: true,
      preload: "auto",
      // type matters — without it video.js guesses from the URL extension and silently treats extension-less URLs as unplayable.
      sources: [{ src: fileUrl, ...(mimeType ? { type: mimeType } : {}) }],
    });
    playerRef.current = player;

    const progressFields = () => {
      const duration = player.duration();
      const pct = duration ? Math.round((maxWatched.current / duration) * 100) : 0;
      return {
        position_seconds: Math.floor(maxWatched.current),
        progress_pct: pct,
        status: pct >= 95 ? "Completed" : "In Progress",
      };
    };

    player.ready(() => {
      if (maxWatched.current > 0) {
        player.currentTime(maxWatched.current);
      }
    });

    player.on("timeupdate", () => {
      const t = player.currentTime();
      if (t > maxWatched.current) {
        maxWatched.current = t;
      }
    });

    player.on("seeking", () => {
      const t = player.currentTime();
      if (t > maxWatched.current + SEEK_TOLERANCE_SECONDS) {
        player.currentTime(maxWatched.current);
      }
    });

    const saveInterval = setInterval(() => save(progressFields()), SAVE_INTERVAL_MS);

    player.on("pause", () => save(progressFields()));
    player.on("ended", () => {
      flush({ position_seconds: Math.floor(maxWatched.current), progress_pct: 100, status: "Completed" });
      onEnded?.();
    });
    player.on("error", () => onError?.());

    return () => {
      clearInterval(saveInterval);
      flush(progressFields()); // unmount (e.g. modal closed) while still playing — capture the live position
      player.dispose();
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUrl]);

  return (
    // fill mode: stretches to this box's exact size, whatever that turns out to be —
    // object-fit: contain (VideoPlayer.css) keeps the video in proportion inside it.
    <div data-vjs-player className="w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
