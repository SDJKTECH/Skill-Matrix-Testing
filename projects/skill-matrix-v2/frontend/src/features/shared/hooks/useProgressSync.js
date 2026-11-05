import { useCallback, useRef } from "react";
import { useAuth } from "../../../hooks/useAuth";
import { useFlushOnExit } from "../../../hooks/useFlushOnExit";
import { saveEmpCourseProgress } from "../../learning-center/api/trainingCourseApi";

// Generic "save state, don't lose it on exit" hook — lives in shared/ (not
// learning-center/) because it's meant to back any viewer that needs resume
// progress, not just training courses. `mode` picks which API call handles
// the save — add a branch here when this hook starts backing a certificate
// page or other document page's own progress, rather than rewriting the
// exit-safety plumbing (that part, useFlushOnExit, stays the same regardless
// of mode). `context` is the fixed identifying fields for that mode (e.g.
// {course_id, lesson_id}); callers supply the fields that actually change
// over time via save()/flush(update).
export function useProgressSync(mode, context = {}) {
  const { user } = useAuth();
  const employeeId = user?.dbEmployeeId ?? user?.employeeId;

  // Refs so the exit listener (registered once by useFlushOnExit) always
  // sees the latest values without needing to resubscribe on every render.
  const contextRef = useRef(context);
  contextRef.current = context;
  const updateRef = useRef({});

  const sendPayload = useCallback(
    (payload, useBeacon) => {
      if (mode === "saveEmpCourseProgress") {
        // Best-effort background save — swallow failures here so a backend
        // hiccup can't surface as an unhandled rejection and blank the page.
        Promise.resolve(saveEmpCourseProgress(payload, { useBeacon })).catch((err) => {
          console.warn("useProgressSync: failed to save progress", err);
        });
      } else {
        throw new Error(`useProgressSync: no handler wired for mode "${mode}"`);
      }
    },
    [mode]
  );

  const buildPayload = useCallback(() => {
    if (!employeeId || Object.keys(updateRef.current).length === 0) return null;
    return { employee_id: employeeId, ...contextRef.current, ...updateRef.current };
  }, [employeeId]);

  const send = useCallback(
    (update, useBeacon) => {
      if (update) updateRef.current = { ...updateRef.current, ...update };
      const payload = buildPayload();
      if (payload) sendPayload(payload, useBeacon);
    },
    [buildPayload, sendPayload]
  );

  const save = useCallback((update) => send(update, false), [send]);
  const flush = useCallback((update) => send(update, true), [send]);

  useFlushOnExit(flush);

  return { save, flush };
}
