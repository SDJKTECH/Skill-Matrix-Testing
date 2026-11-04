import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  suggestTrainingHierarchies,
  suggestTrainingModes,
  suggestBatchStatuses,
  suggestTrainingStatuses,
} from "../helper/addTrainingV2Api";
import { sortAlpha, sortByWorkflowOrder } from "../features/training/training-batch/services/trainingUtils";

// Loads the dropdown lists for Training Batches (batch status, training mode,
// training status and the area/sub-area/module list) once per session, so
// each panel does not load them again.
const TrainingReferenceDataContext = createContext(null);

// The status and mode lists change only when the database changes, so they
// load once per session. The area/sub-area/module list can grow ("+ Add new"),
// so it is loaded again after a save.
function useResource(fetchFn, sortFn) {
  const [state, setState] = useState("loading"); // "loading" | "ready" | "empty" | "error"
  const [data, setData] = useState([]);
  // Keep fetchFn/sortFn in refs, so `load` stays the same function and is safe
  // to use in effects.
  const fetchFnRef = useRef(fetchFn);
  const sortFnRef = useRef(sortFn);
  fetchFnRef.current = fetchFn;
  sortFnRef.current = sortFn;

  const load = useCallback(() => {
    setState("loading");
    return fetchFnRef.current()
      .then((values) => {
        const list = Array.isArray(values) ? values : [];
        const sorted = sortFnRef.current ? sortFnRef.current([...list]) : list;
        setData(sorted);
        setState(sorted.length === 0 ? "empty" : "ready");
      })
      .catch((err) => {
        // Only log the error here. The panel that needs this list shows the error
        // and a Retry button.
        console.error("Training reference data prefetch failed:", err);
        setData([]);
        setState("error");
      });
  }, []);

  useEffect(() => { load(); }, [load]);

  return useMemo(() => ({ data, state, retry: load }), [data, state, load]);
}

export function TrainingReferenceDataProvider({ children }) {
  // All lists are asked for at the same time, so they load together.
  const hierarchies = useResource(suggestTrainingHierarchies, null);
  const trainingModes = useResource(suggestTrainingModes, sortAlpha);
  const batchStatuses = useResource(suggestBatchStatuses, sortByWorkflowOrder);
  const trainingStatuses = useResource(suggestTrainingStatuses, sortAlpha);

  // No pop-up message when the lists load: it happens in the background, and
  // errors are shown later in the panel that needs the list.

  const value = useMemo(() => ({
    hierarchies: hierarchies.data,
    retryHierarchies: hierarchies.retry,

    trainingModeOptions: trainingModes.data,
    trainingModeState: trainingModes.state,
    retryTrainingModes: trainingModes.retry,

    batchStatusOptions: batchStatuses.data,
    batchStatusState: batchStatuses.state,
    retryBatchStatuses: batchStatuses.retry,

    trainingStatusOptions: trainingStatuses.data,
    trainingStatusState: trainingStatuses.state,
    retryTrainingStatuses: trainingStatuses.retry,
  }), [hierarchies, trainingModes, batchStatuses, trainingStatuses]);

  return (
    <TrainingReferenceDataContext.Provider value={value}>
      {children}
    </TrainingReferenceDataContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useTrainingReferenceData = () => useContext(TrainingReferenceDataContext);
