import React, { createContext, useContext, useState, useCallback } from "react";

const SkillMatrixNavContext = createContext(null);

export function useSkillMatrixNav() {
  return useContext(SkillMatrixNavContext);
}

export function SkillMatrixNavProvider({ children }) {
  const [activeTab, setActiveTab] = useState("home");
  const [updateSubTab, setUpdateSubTab] = useState("skill");
  const [homeClickCount, setHomeClickCount] = useState(0);
  // One-shot deep-link intents for AdminDashboard. Writers (e.g.
  // useGoToTrainingBatches) set these immediately before navigating to the
  // admin-dashboard tab. AdminDashboard must apply them into local state and
  // CLEAR them in the same turn — otherwise a later unrelated visit
  // (sidebar → Admin Dashboard) remounts and replays a stale pending-scope
  // or section seed. Never treat these as long-lived page state.
  const [adminDashboardSection, setAdminDashboardSection] = useState(null);
  const [trainingBatchTarget, setTrainingBatchTarget] = useState(null);
  // Which entry point requested this deep link (see
  // component/training-batch/batchViewOrigin.js) — e.g. "manager-dashboard"
  // so the Training Batch page can hide L&D-only actions for that visit.
  // Same one-shot lifecycle as trainingBatchTarget above: set immediately
  // before navigating, consumed into AdminDashboard's local state, cleared
  // here so it can't leak into an unrelated later visit.
  const [trainingBatchOrigin, setTrainingBatchOrigin] = useState(null);
  // One-shot intent carrying a decoded proposal payload for a pre-filled
  // Create Batch panel (set by useTrainingEmailDeepLink's view=create-batch
  // branch). Same lifecycle as trainingBatchTarget/trainingBatchOrigin above
  // - consumed into AdminDashboard's local state and cleared in the same
  // turn via clearAdminDashboardDeepLink, so it can't replay on a later
  // unrelated visit.
  const [createBatchPrefillIntent, setCreateBatchPrefillIntent] = useState(null);
  // Bumped only by plain sidebar/overview entry (not by deep links). Forces
  // AdminDashboard local section/scope back to the default overview so a
  // pending-approvals visit cannot stick when the user re-clicks Admin
  // Dashboard while already on that tab.
  const [adminDashboardResetKey, setAdminDashboardResetKey] = useState(0);
  // Separate from adminDashboardSection above ON PURPOSE: AdminDashboard.jsx
  // consumes+clears that one-shot section/target/origin trio in its own
  // useLayoutEffect immediately on mount (so a LATER unrelated visit can't
  // replay a stale deep link) — but MainComponent.jsx's canSeeAdminDashboardTab
  // gate used to read adminDashboardSection directly, which meant that same
  // clear (a layout effect, so it runs and re-renders BEFORE paint) flipped
  // the gate back to false before the admin-dashboard tab ever painted for
  // any role without independent full-access (canSeeUpdateTab) — the click
  // looked like a silent no-op for a plain employee/manager role, even
  // though setActiveTab("admin-dashboard") really did fire. This flag is
  // set true in the same call that requests the deep link (see
  // useGoToTrainingBatches.js) and only cleared when the user actually
  // navigates to a DIFFERENT tab (see handleSetActiveTab below), so it
  // survives AdminDashboard's own state cleanup for the whole visit.
  const [adminDashboardDeepLinkActive, setAdminDashboardDeepLinkActive] = useState(false);
  // Which page the current deep link was requested from — { label,
  // homePanel, catalogOpen } | null (see useGoToTrainingBatches.js's
  // `source` param, set by My Trainings' own two entry points: a regular
  // training card = { label: "My Trainings", homePanel: "trainings",
  // catalogOpen: false }, an Open-for-Enrollment card = { label: "Open for
  // Enrollment", homePanel: "trainings", catalogOpen: true }). Used to
  // render the breadcrumb's middle crumb as the REAL page the user came
  // from instead of a generic "Admin Dashboard" they never visited (see
  // AdminTrainingDashboard.jsx), and to reconstruct that page via
  // homeOpenPanelIntent below if that crumb is clicked. Same
  // survives-AdminDashboard's-own-cleanup / reset-on-leaving-the-tab
  // lifecycle as adminDashboardDeepLinkActive right above (reset together
  // in handleSetActiveTab) — for the same reason: this needs to outlive
  // AdminDashboard's own one-shot section/target/origin cleanup, not the
  // adminDashboardSection/trainingBatchOrigin trio itself.
  const [adminDashboardDeepLinkSource, setAdminDashboardDeepLinkSource] = useState(null);
  // One-shot intent telling HomeScreen which inline panel to reopen on its
  // NEXT mount — set only when the Training Batches breadcrumb's source
  // crumb (built from adminDashboardDeepLinkSource above) is actually
  // clicked, not at the original deep-link click time: setting it that
  // early would make it a long-lived intent that could replay on a much
  // later, unrelated plain sidebar → Home click (exactly the staleness bug
  // every other one-shot intent in this file is written to avoid). Same
  // seed-then-clear lifecycle as homeViewModeIntent below: HomeScreen reads
  // it once via a useState initializer, then clears it.
  const [homeOpenPanelIntent, setHomeOpenPanelIntent] = useState(null);
  // One-shot intent for HomeScreen's Self/Manager toggle ("self" | "manager"
  // | null) — lets AdminDashboard's "Back to Manager Dashboard" (see
  // batchViewOrigin.js) land the user back on the Manager view they came
  // from, not the default Self view every plain Home visit starts on. Same
  // seed-then-clear lifecycle as the admin-dashboard intents above:
  // HomeScreen reads it once via a useState initializer (it fully remounts
  // on every "home" tab switch, so this is never stale) then clears it.
  const [homeViewModeIntent, setHomeViewModeIntent] = useState(null);

  const clearAdminDashboardDeepLink = useCallback(() => {
    setAdminDashboardSection(null);
    setTrainingBatchTarget(null);
    setTrainingBatchOrigin(null);
    setCreateBatchPrefillIntent(null);
  }, []);

  const clearHomeViewModeIntent = useCallback(() => {
    setHomeViewModeIntent(null);
  }, []);

  const clearHomeOpenPanelIntent = useCallback(() => {
    setHomeOpenPanelIntent(null);
  }, []);

  const openAdminDashboardOverview = useCallback(() => {
    clearAdminDashboardDeepLink();
    setAdminDashboardResetKey((key) => key + 1);
    setActiveTab("admin-dashboard");
  }, [clearAdminDashboardDeepLink]);

  // Wrapper for setActiveTab that increments homeClickCount when setting to
  // "home", and clears adminDashboardDeepLinkActive once the user actually
  // leaves the admin-dashboard tab (every navigation in the app goes
  // through this one setter, so this is the one place that reliably knows
  // "the visit is over").
  const handleSetActiveTab = useCallback((tab) => {
    setActiveTab(tab);
    if (tab === "home") {
      setHomeClickCount((prev) => prev + 1);
    }
    if (tab !== "admin-dashboard") {
      setAdminDashboardDeepLinkActive(false);
      setAdminDashboardDeepLinkSource(null);
    }
  }, []);

  return (
    <SkillMatrixNavContext.Provider
      value={{
        activeTab,
        setActiveTab: handleSetActiveTab,
        updateSubTab,
        setUpdateSubTab,
        homeClickCount,
        adminDashboardSection,
        setAdminDashboardSection,
        trainingBatchTarget,
        setTrainingBatchTarget,
        trainingBatchOrigin,
        setTrainingBatchOrigin,
        createBatchPrefillIntent,
        setCreateBatchPrefillIntent,
        clearAdminDashboardDeepLink,
        adminDashboardResetKey,
        adminDashboardDeepLinkActive,
        setAdminDashboardDeepLinkActive,
        adminDashboardDeepLinkSource,
        setAdminDashboardDeepLinkSource,
        homeOpenPanelIntent,
        setHomeOpenPanelIntent,
        clearHomeOpenPanelIntent,
        openAdminDashboardOverview,
        homeViewModeIntent,
        setHomeViewModeIntent,
        clearHomeViewModeIntent,
      }}
    >
      {children}
    </SkillMatrixNavContext.Provider>
  );
}
