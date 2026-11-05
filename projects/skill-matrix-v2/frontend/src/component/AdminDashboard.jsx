import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LearningCenterSection } from "../features/learning-center-admin";
import {
  FiChevronRight,
  FiChevronLeft,
  FiBook,
  FiBookOpen,
  FiAward,
  FiList,
  FiPieChart,
} from "react-icons/fi";
import { useSkillMatrixNav } from "../context/SkillMatrixNavContext";
import { AdminTrainingDashboard } from "../features/training/training-batch/index";
import { BATCH_VIEW_ORIGIN } from "../features/training/training-batch/services/batchViewOrigin";
import { useBatchPermissions, BATCH_ACTIONS } from "../features/training/training-batch/services/batchPermissions";
import { TrainingAnalyticsDashboard } from "../features/training/training-analytics";
import ErrorBoundary from "../features/training/training-batch/components/ErrorBoundary";

const ADMIN_SECTIONS = [
  {
    key: "training",
    label: "Training Batches",
    sub: "Manage training batches",
    icon: FiBook,
    colorBg: "bg-blue-50 dark:bg-blue-900/20",
    colorIcon: "text-blue-500 dark:text-blue-400",
    hoverBorder: "hover:border-blue-200 dark:hover:border-blue-700",
    enabled: true,
  },
  {
    key: "skills",
    label: "Skills",
    sub: "Manage skill matrix",
    icon: FiList,
    colorBg: "bg-green-50 dark:bg-green-900/20",
    colorIcon: "text-green-500 dark:text-green-400",
    hoverBorder: "hover:border-green-200 dark:hover:border-green-700",
    enabled: false,
  },
  {
    key: "certificates",
    label: "Certificates",
    sub: "Manage certifications",
    icon: FiAward,
    colorBg: "bg-purple-50 dark:bg-purple-900/20",
    colorIcon: "text-purple-500 dark:text-purple-400",
    hoverBorder: "hover:border-purple-200 dark:hover:border-purple-700",
    enabled: false,
  },
  {
    key: "training-analytics",
    label: "Training Analytics",
    sub: "Training insights & trends",
    icon: FiPieChart,
    colorBg: "bg-orange-50 dark:bg-orange-900/20",
    colorIcon: "text-orange-500 dark:text-orange-400",
    hoverBorder: "hover:border-orange-200 dark:hover:border-orange-700",
    enabled: true,
  },
  {
    key: "learning-center",
    label: "Manage Courses",
    sub: "Courses, lessons & policies",
    icon: FiBookOpen,
    colorBg: "bg-indigo-50 dark:bg-indigo-900/20",
    colorIcon: "text-indigo-500 dark:text-indigo-400",
    hoverBorder: "hover:border-indigo-200 dark:hover:border-indigo-700",
    enabled: true,
  },
];

function AdminOverview({ onSectionClick }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Manage</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {ADMIN_SECTIONS.map((section) => (
          <button
            key={section.key}
            type="button"
            onClick={() => section.enabled && onSectionClick(section.key)}
            disabled={!section.enabled}
            className={`relative bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-3 flex items-center gap-2.5 transition-all text-left ${
              section.enabled
                ? `hover:shadow-md ${section.hoverBorder} cursor-pointer`
                : "opacity-60 cursor-not-allowed"
            }`}
          >
            <div className={`w-9 h-9 rounded-lg ${section.colorBg} flex items-center justify-center shrink-0`}>
              <section.icon className={`h-4 w-4 ${section.colorIcon}`} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">{section.label}</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">{section.sub}</p>
            </div>
            {section.enabled ? (
              <FiChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
            ) : (
              <span className="text-[8px] font-bold bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 px-1.5 py-0.5 rounded-full uppercase tracking-wider shrink-0">Soon</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function ComingSoonSection({ section, onBack }) {
  return (
    <>
      <div className="shrink-0 flex items-center gap-2">
        <button type="button" onClick={onBack} className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors" title="Back to overview">
          <FiChevronLeft className="h-4 w-4" />
        </button>
        <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">{section.label}</h1>
      </div>
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className={`w-14 h-14 rounded-full ${section.colorBg} flex items-center justify-center mb-4`}>
          <section.icon className={`h-6 w-6 ${section.colorIcon}`} />
        </div>
        <h2 className="text-base font-semibold text-gray-700 dark:text-gray-200 mb-1">Coming Soon</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
          {section.sub} dashboard is under development and will be available in a future update.
        </p>
      </div>
    </>
  );
}

export default function AdminDashboard() {
  const {
    setActiveTab,
    setUpdateSubTab,
    adminDashboardSection,
    trainingBatchTarget,
    trainingBatchOrigin,
    createBatchPrefillIntent,
    clearAdminDashboardDeepLink,
    adminDashboardResetKey,
    adminDashboardDeepLinkSource,
    setHomeOpenPanelIntent,
    setHomeViewModeIntent,
  } = useSkillMatrixNav();

  // No override -> falls back to TrainingBatchOriginContext's own default (DIRECT), safe outside its Provider.
  const { can: canBatch } = useBatchPermissions();
  const canCreateBatch = canBatch(BATCH_ACTIONS.CREATE_BATCH);

  // Seed once from the navigator that just set the one-shot intent (bell /
  // card deep link). Plain sidebar entry clears intent + bumps resetKey
  // first, so these stay null and we land on the overview.
  const [activeSection, setActiveSection] = useState(() => adminDashboardSection || null);
  const [scopeTarget, setScopeTarget] = useState(() => trainingBatchTarget ?? null);
  // Mirrors scopeTarget's exact lifecycle (see batchViewOrigin.js) — a plain
  // sidebar entry must land on BATCH_VIEW_ORIGIN.DIRECT (via
  // AdminTrainingDashboard's own default), not replay a stale Manager
  // Dashboard visit's origin.
  const [batchOrigin, setBatchOrigin] = useState(() => trainingBatchOrigin ?? null);
  // Same lifecycle as scopeTarget/batchOrigin, gated on canCreateBatch so a deep link can't force-open Create Batch for a role that could never save it.
  const [createBatchPrefillData, setCreateBatchPrefillData] = useState(() => (canCreateBatch ? createBatchPrefillIntent : null));
  const prevResetKeyRef = useRef(adminDashboardResetKey);

  // Consume the mount-time seed immediately so a later remount cannot replay it.
  useLayoutEffect(() => {
    clearAdminDashboardDeepLink();
  }, [clearAdminDashboardDeepLink]);

  // Sidebar / overview entry while this tab is already mounted — drop any
  // leftover training section + pending scope from a prior bell visit.
  useEffect(() => {
    if (prevResetKeyRef.current === adminDashboardResetKey) return;
    prevResetKeyRef.current = adminDashboardResetKey;
    setActiveSection(null);
    setScopeTarget(null);
    setBatchOrigin(null);
    setCreateBatchPrefillData(null);
  }, [adminDashboardResetKey]);

  // Deep link while AdminDashboard is already mounted (same tab, new intent).
  useEffect(() => {
    if (adminDashboardSection == null && trainingBatchTarget == null) return;
    if (adminDashboardSection != null) setActiveSection(adminDashboardSection);
    setScopeTarget(trainingBatchTarget);
    setBatchOrigin(trainingBatchOrigin);
    setCreateBatchPrefillData(canCreateBatch ? createBatchPrefillIntent : null);
    clearAdminDashboardDeepLink();
  }, [adminDashboardSection, trainingBatchTarget, trainingBatchOrigin, createBatchPrefillIntent, canCreateBatch, clearAdminDashboardDeepLink]);

  const goBack = () => {
    // Return to the page that actually sent the user here, not a fixed
    // generic destination — standard back-button UX expectation (users
    // expect Back to return them to their referrer, not always the same
    // parent screen). A Manager Dashboard visit deep-links in and out of
    // Admin Dashboard's own "training" section entirely, so this leaves
    // the admin-dashboard tab rather than just resetting local section
    // state, unlike every other (direct/DIRECT-origin) entry point.
    if (batchOrigin === BATCH_VIEW_ORIGIN.MANAGER_DASHBOARD) {
      setHomeViewModeIntent("manager");
      setActiveTab("home");
      return;
    }
    setActiveSection(null);
    setScopeTarget(null);
    setBatchOrigin(null);
  };

  // Breadcrumb root — same idea as My Trainings' own breadcrumb always
  // showing "Home" as the first crumb regardless of how deep the current
  // view is (Home / My Trainings / Open Enrollment), not just the
  // immediate parent. See AdminTrainingDashboard.jsx's breadcrumbItems.
  const goHome = () => setActiveTab("home");

  // The breadcrumb's real-source crumb (e.g. "My Trainings"/"Open for
  // Enrollment" — see adminDashboardDeepLinkSource's own doc comment)
  // clicks through to here: reopens the exact page the deep link came from
  // via a fresh one-shot intent, set NOW (not at the original deep-link
  // click) so a later unrelated Home visit can never replay it — see
  // SkillMatrixNavContext.jsx's homeOpenPanelIntent doc comment.
  const goBackToDeepLinkSource = () => {
    if (adminDashboardDeepLinkSource) {
      setHomeOpenPanelIntent({
        panel: adminDashboardDeepLinkSource.homePanel,
        catalogOpen: adminDashboardDeepLinkSource.catalogOpen,
      });
    }
    setActiveTab("home");
  };

  const openSection = (key) => {
    // Overview → section is never a deep link; drop any leftover scope.
    setScopeTarget(null);
    setBatchOrigin(null);
    setCreateBatchPrefillData(null);
    setActiveSection(key);
  };

  const handleEdit = () => {
    setActiveTab("update");
    setUpdateSubTab("training");
  };

  let content;
  if (activeSection === "training") {
    content = (
      <AdminTrainingDashboard
        onBack={goBack}
        onGoHome={goHome}
        onEdit={handleEdit}
        scopeTarget={scopeTarget}
        origin={batchOrigin}
        deepLinkSource={adminDashboardDeepLinkSource}
        onBackToDeepLinkSource={goBackToDeepLinkSource}
        createBatchPrefillData={createBatchPrefillData}
      />
    );
  } else if (activeSection === "training-analytics") {
    content = (
      <ErrorBoundary label="the Training Analytics page">
        <TrainingAnalyticsDashboard onBack={goBack} />
      </ErrorBoundary>
    );
  } else if (activeSection === "learning-center") {
    content = (
      <ErrorBoundary label="the Manage Courses page">
        <LearningCenterSection onBack={goBack} onGoHome={goHome} />
      </ErrorBoundary>
    );
  } else if (activeSection) {
    const section = ADMIN_SECTIONS.find((s) => s.key === activeSection);
    content = section ? <ComingSoonSection section={section} onBack={goBack} /> : null;
  } else {
    content = <AdminOverview onSectionClick={openSection} />;
  }

  return (
    <div className="h-full flex flex-col gap-2 p-2.5 text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-900">
      {!activeSection && (
        <div className="shrink-0">
          <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">Admin Dashboard</h1>
        </div>
      )}
      {content}
    </div>
  );
}
