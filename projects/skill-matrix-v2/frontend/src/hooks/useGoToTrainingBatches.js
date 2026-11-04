import { useSkillMatrixNav } from "../context/SkillMatrixNavContext";
import { BATCH_SCOPE_LABEL } from "../features/training/training-batch/services/batchScopes";
import { BATCH_VIEW_ORIGIN } from "../features/training/training-batch/services/batchViewOrigin";

/**
 * Opens the Training Batches page from any screen (Home, My Trainings,
 * Manager Dashboard). Call it with:
 *   - nothing: opens the page with all batches.
 *   - a batch_num (e.g. "BATCH-42"): opens and scrolls to that batch.
 *   - { scope, batchNums, label? }: shows only those batches, with a
 *     "Scope: <label>" tag the user can remove. For the EMPLOYEE scope,
 *     pass a label like "Jane Doe's Trainings".
 * What each role can edit is still checked on the page (batchPermissions.js).
 */
export function useGoToTrainingBatches() {
  const {
    setActiveTab,
    setAdminDashboardSection,
    setTrainingBatchTarget,
    setTrainingBatchOrigin,
    setAdminDashboardDeepLinkActive,
    setAdminDashboardDeepLinkSource,
  } = useSkillMatrixNav();
  // origin: pass MANAGER_DASHBOARD from Manager Dashboard to hide the
  // edit/create buttons for that visit. Leave it out for a normal visit.
  // source: { label, homePanel, catalogOpen } = the page the user came from,
  // so the page path at the top shows that page and links back to it.
  return (target, origin = BATCH_VIEW_ORIGIN.DIRECT, source = null) => {
    let resolved = null;
    if (typeof target === "string") {
      resolved = { batchNums: [target] };
    } else if (target && target.scope) {
      resolved = { scope: target.scope, batchNums: target.batchNums || [], label: target.label || BATCH_SCOPE_LABEL[target.scope] };
    }
    setTrainingBatchTarget(resolved);
    setTrainingBatchOrigin(origin);
    setAdminDashboardSection("training");
    // AdminDashboard clears adminDashboardSection when it opens, so this extra
    // flag tells it the user came from a link.
    setAdminDashboardDeepLinkActive(true);
    setAdminDashboardDeepLinkSource(source);
    setActiveTab("admin-dashboard");
  };
}
