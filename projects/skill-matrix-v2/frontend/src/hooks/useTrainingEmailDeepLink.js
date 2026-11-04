import { useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { useGoToTrainingBatches } from "./useGoToTrainingBatches";
import { useSkillMatrixNav } from "../context/SkillMatrixNavContext";
import { BATCH_VIEW_ORIGIN } from "../features/training/training-batch/services/batchViewOrigin";

/**
 * Consumes `?batch=<batch_num>[&view=review|register]` -- sent by a training
 * notification email (see backend's notifications.py _deep_link_url) or an
 * external register link -- and lands on the right spot:
 *   - `view=review` (nomination_submitted.html): manager review, via
 *     useGoToTrainingBatches like every other admin-dashboard entry point.
 *   - `view=register` (pasted externally, e.g. a training calendar's
 *     Register Link): bypasses useGoToTrainingBatches (always lands on the
 *     admin/manage tab, not a place to self-register) and seeds
 *     homeOpenPanelIntent directly, same as "Nominate for Training" --
 *     opens My Trainings' Open for Enrollment.
 *   - no `view` (training_approved/rejected.html): plain My Trainings card
 *     click (DIRECT origin).
 *   - `view=create-batch&payload=<base64url JSON>`: decodes + shape-checks
 *     payload (a non-empty JSON array of batch objects, even for one) into
 *     createBatchPrefillIntent for a pre-filled Create Batch panel -- own
 *     early branch below, uses `payload` not `batch`. A bad payload toasts
 *     an error and does not navigate.
 *
 * One-shot: a ref guard keeps this from re-firing on a later remount, and
 * the params are stripped from the URL right after being read so a
 * refresh or bookmark can't replay the navigation.
 */
// base64url -> standard base64 -> re-pad (atob needs length % 4 == 0) -> UTF-8 bytes -> JSON
function decodeCreateBatchPayload(encoded) {
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export const isBatchPayload = (data) =>
  Array.isArray(data) && data.length > 0 && data.every((b) => b && typeof b === "object" && !Array.isArray(b));

// Owns "does this URL carry a training deep link?" so App.jsx asks here instead of knowing the param names.
export const hasTrainingDeepLink = (search) => {
  const params = new URLSearchParams(search);
  return params.has("batch") || (params.get("view") === "create-batch" && Boolean(params.get("payload")));
};

export function useTrainingEmailDeepLink() {
  const goToTrainingBatches = useGoToTrainingBatches();
  const { setHomeOpenPanelIntent, setCreateBatchPrefillIntent } = useSkillMatrixNav();
  const consumedRef = useRef(false);

  useEffect(() => {
    if (consumedRef.current) return;
    const params = new URLSearchParams(window.location.search);

    if (params.get("view") === "create-batch") {
      const encoded = params.get("payload");
      if (!encoded) return;
      consumedRef.current = true;
      let data = null;
      try { data = decodeCreateBatchPayload(encoded); } catch { /* bad base64/JSON -> handled by the shape check below */ }
      if (isBatchPayload(data)) { goToTrainingBatches(); setCreateBatchPrefillIntent(data); }
      else toast.error("Create-batch link is malformed: payload must be a JSON array of batches.", { duration: 5000 });
      params.delete("view");
      params.delete("payload");
      const query = params.toString();
      const url = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
      window.history.replaceState(window.history.state, "", url);
      return;
    }

    const batchNum = params.get("batch");
    if (!batchNum) return;
    consumedRef.current = true;

    const view = params.get("view");
    if (view === "review") {
      goToTrainingBatches(batchNum, BATCH_VIEW_ORIGIN.MANAGER_DASHBOARD);
    } else if (view === "register") {
      // No setActiveTab("home") -- already "home" on a fresh load, and
      // calling it would bump homeClickCount and reset this same intent
      // via HomeScreen's "close panel on Home re-click" effect.
      // search: batchNum reuses Pending Approvals' own search-seed
      // (HomeScreen.jsx's trainingsPanelInitialSearch, which already
      // matches on batchNum) to narrow the catalog to just this batch.
      setHomeOpenPanelIntent({ panel: "trainings", catalogOpen: true, search: batchNum });
    } else {
      goToTrainingBatches(batchNum, undefined, {
        label: "My Trainings",
        homePanel: "trainings",
        catalogOpen: false,
      });
    }

    params.delete("batch");
    params.delete("view");
    const query = params.toString();
    const url = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    window.history.replaceState(window.history.state, "", url);
    // Deliberately run once on mount only -- goToTrainingBatches is a new
    // closure every render (see useGoToTrainingBatches.js), so including it
    // here would re-fire this on every unrelated nav-context update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
