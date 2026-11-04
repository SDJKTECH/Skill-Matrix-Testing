import { useEffect, useMemo, useState } from "react";
import { fetchBatches } from "../../../../helper/trainingBatchesApi";
import { buildBatchByNumMap } from "../../shared/config/batchByNum";

/**
 * Fetches every training batch once and indexes it by batch_num — shared
 * across every Manager Dashboard surface that needs batch-level metadata
 * (trainer/duration/mode/seats) merged onto a raw training record:
 * Employee-view expanded cards (EmployeeExpandedRecords.jsx, via
 * trainingRecordAdapter's mergeBatchDetails), the "By Training"
 * batch-grouped view (useTrainingBatchGroups.js), and the Team Alerts
 * "associates currently undergoing training" card reveal
 * (ManagerDashboard.jsx). Promoted out of manager-dashboard/ (where it
 * started as one hook's private concern) once a second consumer appeared,
 * so none of them re-fetch the same batch list independently. Mirrors
 * EmployeeTrainingPanel.jsx's own fetch-on-mount pattern for the same
 * endpoint.
 */
export function useBatchByNum() {
  const [batches, setBatches] = useState([]);
  useEffect(() => {
    let cancelled = false;
    fetchBatches()
      .then(({ results }) => {
        if (!cancelled) setBatches(results);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => buildBatchByNumMap(batches, { requireBatchNum: true }), [batches]);
}
