import { useCallback, useEffect, useRef, useState } from "react";
import { listCourses as fetchAdminCourses } from "../api/courseManagementApi";

/**
 * Loads the admin course list for the current filters. Keeps the previous rows on
 * screen while a new filter is loading, and ignores out-of-date responses.
 * `enabled=false` (no admin id / no access) skips the request.
 */
export function useAdminCourses({
  adminId,
  search,
  courseTypes,
  statuses,
  contentTypes,
  trainingCategories,
  enabled = true,
}) {
  const [data, setData] = useState({ courses: [], shown: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  const load = useCallback(async () => {
    if (!adminId || !enabled) {
      setLoading(false);
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const result = await fetchAdminCourses({
        adminId,
        search,
        courseTypes,
        statuses,
        contentTypes,
        trainingCategories,
      });
      if (id === requestId.current) setData(result);
    } catch (err) {
      if (id === requestId.current) {
        setError(err.response?.data?.error || "Couldn't load courses.");
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [
    adminId,
    enabled,
    search,
    courseTypes,
    statuses,
    contentTypes,
    trainingCategories,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...data, loading, error, reload: load };
}