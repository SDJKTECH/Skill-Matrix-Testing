import React, { createContext, useContext } from "react";
import { BATCH_VIEW_ORIGIN } from "../services/batchViewOrigin";

// Shares the page origin (see batchViewOrigin.js) with all Training Batch
// components inside, without passing it through every component. It is set
// by AdminTrainingDashboard.jsx.
const TrainingBatchOriginContext = createContext(BATCH_VIEW_ORIGIN.DIRECT);

export function TrainingBatchOriginProvider({ origin, children }) {
  return (
    <TrainingBatchOriginContext.Provider value={origin ?? BATCH_VIEW_ORIGIN.DIRECT}>
      {children}
    </TrainingBatchOriginContext.Provider>
  );
}

export function useTrainingBatchOrigin() {
  return useContext(TrainingBatchOriginContext);
}
