import { useCallback, useEffect, useState } from "react";
import { fetchTrainingAnalytics } from "../api/trainingAnalyticsApi";

/**
 * Fetches the raw training-analytics record set once on mount. Deliberately
 * owns no filter/selection state — that lives in the dashboard component so
 * aggregation stays a pure, independently-driven computation.
 * @returns {{ records: Array<object>, loading: boolean, error: string|null, refetch: () => void }}
 */
export function useTrainingAnalytics() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchTrainingAnalytics()
      .then(({ records: fetched }) => {
        if (cancelled) return;
        setRecords(fetched);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.response?.data?.error || err?.message || "Failed to load training analytics");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const refetch = useCallback(() => setReloadKey((key) => key + 1), []);

  return { records, loading, error, refetch };
}
