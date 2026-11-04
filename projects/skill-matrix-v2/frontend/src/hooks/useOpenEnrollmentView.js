import { useCallback, useState } from "react";
import { VIEW_SCOPES, VIEW_SCOPE_KEYS } from "../features/training/my-trainings/services/openEnrollmentViewScope";

/**
 * Owns exactly one thing: whether My Trainings' bell-triggered "Open for
 * Enrollment" full view is active, plus the resolved scope config for
 * whichever state that is. No data-fetching, no filtering, no knowledge of
 * batches/trainings at all (SRP) — EmployeeTrainingPanel.jsx composes this
 * with useOpenEnrollmentBatches.js separately for that.
 *
 * Deliberately its own boolean, not reused/derived from any other flag
 * (catalogOpen no longer exists, "NEW" batch tagging, the default
 * StatusTabs bucket, etc. all stay fully independent) — per the state rule
 * this feature must not alter or piggyback on unrelated state.
 *
 * `initialActive` (default false) lets a caller land directly in catalog
 * view on first render (e.g. Home's "Nominate for Training" quick action)
 * without a post-mount `.enter()` effect flipping it a render later — that
 * one-render lag used to double-fire EmployeeTrainingPanel.jsx's batches
 * fetch (mount effect + the viewScope-change effect both firing).
 */
export default function useOpenEnrollmentView(initialActive = false) {
  const [active, setActive] = useState(initialActive);

  const enter = useCallback(() => setActive(true), []);
  const exit = useCallback(() => setActive(false), []);
  const toggle = useCallback(() => setActive((v) => !v), []);

  const scope = active ? VIEW_SCOPES[VIEW_SCOPE_KEYS.OPEN_ENROLLMENT] : VIEW_SCOPES[VIEW_SCOPE_KEYS.DEFAULT];

  return { active, enter, exit, toggle, scope };
}
