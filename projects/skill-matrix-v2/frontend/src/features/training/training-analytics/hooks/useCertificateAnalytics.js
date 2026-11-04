import { useCallback, useEffect, useState } from "react";
import { fetchCertificateAnalytics } from "../api/certificateAnalyticsApi";

/**
 * Fetches the raw employee-certificate record set once on mount. Mirrors
 * useTrainingAnalytics.js but hits a separate endpoint.
 * @returns {{ records: Array<object>, loading: boolean, error: string|null, refetch: () => void }}
 */
export function useCertificateAnalytics() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchCertificateAnalytics()
      .then(({ records: fetched }) => {
        if (cancelled) return;
        setRecords(fetched);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.response?.data?.error || err?.message || "Failed to load certificate analytics");
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
