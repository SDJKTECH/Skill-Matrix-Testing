import React, { useMemo, useEffect } from "react";
import EmployeeSkillTable from "./EmployeeSkillTable";
import EmployeeCertTable from "./EmployeeCertTable";
import RequestList from "./RequestList";
import DownloadReport from "./DownloadReport";
import { OverviewProvider } from "../context/OverviewContext";
import OverviewTreeGraph from "./OverviewTreeGraph";
import { useAuth } from "../hooks/useAuth";
import { useIsMobile } from "../hooks/useMediaQuery";
import { useSkillMatrixNav } from "../context/SkillMatrixNavContext";
import AdminConsoleSkill from "./AdminConsoleSkill";
import AdminConsoleCertificates from "./AdminConsoleCertificates";
import AdminConsoleTraining from "./AdminConsoleTraining";
import AdminConsoleWebhooks from "./AdminConsoleWebhooks";
import AdminDashboard from "./AdminDashboard";
import HomeScreen from "./HomeScreen";
import ProfilePage from "./ProfilePage";
import LearningCenter from "./LearningCenter";
import { hasFullAccessRole, hasWebhookAccess } from "../helper/accessRoles";

function MainComponent() {
  const { activeTab, setActiveTab, updateSubTab, setUpdateSubTab, adminDashboardDeepLinkActive } =
    useSkillMatrixNav();
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const canSeeUpdateTab = useMemo(() => hasFullAccessRole(user?.role), [user?.role]);
  // Narrower than canSeeUpdateTab: Manage Webhooks is system/integration
  // config, not day-to-day training/skill/cert data — see accessRoles.js's
  // WEBHOOK_ACCESS_ROLES for why this excludes HR while canSeeUpdateTab doesn't.
  const canSeeWebhooksTab = useMemo(() => hasWebhookAccess(user?.role), [user?.role]);

  // "admin-dashboard" tab CONTENT is reachable two ways: full admin access
  // (canSeeUpdateTab, same as "update"/"download-report" — unchanged), OR a
  // deep link into a SPECIFIC section from elsewhere in the app (Training
  // Progress / My Trainings / Manager Dashboard "view batch" clicks — see
  // hooks/useGoToTrainingBatches.js, which always sets
  // adminDashboardDeepLinkActive in the same call that sets activeTab, and
  // is the ONLY code path that can ever set activeTab to "admin-dashboard"
  // for a non-admin role — Sidebar's own Admin Dashboard button stays
  // canSeeUpdateTab-gated, unchanged, so there is no other way in). Gated on
  // adminDashboardDeepLinkActive, NOT the raw adminDashboardSection value —
  // AdminDashboard.jsx clears adminDashboardSection right back to null in
  // its own useLayoutEffect immediately on mount (deliberately, so a LATER
  // unrelated visit can't replay a stale deep link), which runs and
  // re-renders before paint; checking adminDashboardSection directly here
  // meant this gate flipped back to false before the page ever painted for
  // any role without independent full access, making the deep link a silent
  // no-op. adminDashboardDeepLinkActive survives that clear and only resets
  // once the user actually navigates to a different tab (see
  // SkillMatrixNavContext.jsx's handleSetActiveTab). This never grants a
  // general sidebar entry — only a click that already knows exactly which
  // section it wants can land here; AdminDashboard itself still only
  // renders the "training" section for non-admin roles (Skills/Certificates
  // admin sections remain Coming-Soon placeholders reachable only via the
  // sidebar button). Actions WITHIN that section are separately role-gated
  // per-action — see component/training-batch/batchPermissions.js — this
  // only controls reaching the page at all.
  const canSeeAdminDashboardTab = canSeeUpdateTab || adminDashboardDeepLinkActive;

  // Primary admin tabs (row 1): Manage Tables | Manage Webhooks (Manage
  // Webhooks omitted entirely for a role without canSeeWebhooksTab, not
  // just disabled — same "hidden, not disabled" convention as the rest of
  // this admin area).
  const adminPrimaryTabs = useMemo(
    () => [
      { key: "manage-tables", label: "Manage Tables" },
      ...(canSeeWebhooksTab ? [{ key: "manage-webhooks", label: "Manage Webhooks" }] : []),
    ],
    [canSeeWebhooksTab]
  );

  // Secondary admin tabs (row 2): Skill | Certificate | Training when Manage Tables; Webhooks when Manage Webhooks
  const adminSecondaryTabs = useMemo(() => {
    const isManageTables = ["skill", "certificates", "training"].includes(updateSubTab);
    if (isManageTables)
      return [
        { key: "skill", label: "Skill" },
        { key: "certificates", label: "Certificate" },
        { key: "training", label: "Training" },
      ];
    return [{ key: "webhooks", label: "Webhooks" }];
  }, [updateSubTab]);

  const isAdminPrimaryActive = (key) => {
    if (key === "manage-tables") return ["skill", "certificates", "training"].includes(updateSubTab);
    if (key === "manage-webhooks") return updateSubTab === "webhooks";
    return false;
  };

  // Section sub-tabs: show as horizontal tabs when a section is active (reference: ATTENDANCE | TIMESHEET bar)
  // For "update" we use a two-row admin tab bar instead, so exclude update from this list
  const sectionTabs = useMemo(() => {
    if (activeTab === "home" || activeTab === "profile" || activeTab === "learning-center") return [];
    if (activeTab === "graph")
      return isMobile ? [] : [{ key: "graph", label: "Overview Graph" }];
    if (activeTab === "skills" || activeTab === "certs")
      return [
        { key: "skills", label: "Add Skill" },
        { key: "certs", label: "Add Certificates" },
      ];
    if (activeTab === "download-report")
      return [{ key: "download-report", label: "Download Report" }];
    if (activeTab === "update" && canSeeUpdateTab) return []; // Admin uses two-row tabs below
    return [];
  }, [activeTab, canSeeUpdateTab, isMobile]);

  const handleSectionTabClick = (item) => {
    if (item.key === "graph") setActiveTab("graph");
    else if (item.key === "skills" || item.key === "certs") setActiveTab(item.key);
    else if (item.key === "download-report") setActiveTab("download-report");
    else if (item.key === "skill" || item.key === "certificates" || item.key === "training" || item.key === "webhooks") {
      setActiveTab("update");
      setUpdateSubTab(item.key);
    }
  };

  const handleAdminPrimaryClick = (key) => {
    setActiveTab("update");
    if (key === "manage-tables") setUpdateSubTab("skill");
    if (key === "manage-webhooks") setUpdateSubTab("webhooks");
  };

  const handleAdminSecondaryClick = (key) => {
    setActiveTab("update");
    setUpdateSubTab(key);
  };

  const isSectionTabActive = (item) => {
    if (item.key === "graph") return activeTab === "graph";
    if (item.key === "skills" || item.key === "certs") return activeTab === item.key;
    if (item.key === "download-report") return activeTab === "download-report";
    if (item.key === "skill" || item.key === "certificates" || item.key === "training" || item.key === "webhooks")
      return activeTab === "update" && updateSubTab === item.key;
    return false;
  };

  const tabComponents = useMemo(
    () => ({
      home: <HomeScreen />,
      profile: <ProfilePage />,
      "learning-center": <LearningCenter />,
      skills: <EmployeeSkillTable />,
      certs: <EmployeeCertTable />,
      approve: <RequestList />,
      "download-report": <DownloadReport />,
      "admin-dashboard": <AdminDashboard />,
      update: (
        <div className="flex min-h-[300px] sm:min-h-[519px] rounded-lg">
          <main className="flex-1 min-w-0 min-h-0">
            {updateSubTab === "skill" && <AdminConsoleSkill />}
            {updateSubTab === "training" && <AdminConsoleTraining />}
            {updateSubTab === "certificates" && <AdminConsoleCertificates />}
            {updateSubTab === "webhooks" && canSeeWebhooksTab && <AdminConsoleWebhooks />}
          </main>
        </div>
      ),
    }),
    [updateSubTab, canSeeWebhooksTab]
  );

  const visibleTabsSet = useMemo(
    () =>
      new Set([
        "home",
        "profile",
        "learning-center",
        "skills",
        "certs",
        "approve",
        "graph",
        ...(canSeeUpdateTab ? ["download-report", "update"] : []),
        ...(canSeeAdminDashboardTab ? ["admin-dashboard"] : []),
      ]),
    [canSeeUpdateTab, canSeeAdminDashboardTab]
  );

  useEffect(() => {
    if ((activeTab === "update" || activeTab === "download-report") && !canSeeUpdateTab) {
      setActiveTab("home");
    }
    if (activeTab === "admin-dashboard" && !canSeeAdminDashboardTab) {
      setActiveTab("home");
    }
  }, [activeTab, canSeeUpdateTab, canSeeAdminDashboardTab, setActiveTab]);

  const effectiveTab = visibleTabsSet.has(activeTab) ? activeTab : "home";
  const showGraphPlaceholder = isMobile && effectiveTab === "graph";
  const showGraph = !showGraphPlaceholder && effectiveTab === "graph";
  const content = showGraphPlaceholder ? (
    <div className="flex flex-col items-center justify-center min-h-[280px] gap-4 p-6 text-center">
      <p className="text-slate-600 dark:text-slate-400 text-sm">
        Overview graph is not available on mobile. Please use a larger screen to view the hierarchy.
      </p>
      <button
        type="button"
        onClick={() => setActiveTab("home")}
        className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg"
      >
        Go to Home
      </button>
    </div>
  ) : (
    tabComponents[effectiveTab]
  );

  return (
    <div className="flex max-w-full max-h-full min-h-0 flex-1 rounded-xl overflow-hidden">
      {/* Main content — sidebar is in Layout */}
      <div
        className="flex-1 min-w-0 max-h-full flex flex-col rounded-xl shadow-lg bg-white text-gray-800 
          dark:bg-gray-900 dark:text-gray-200 overflow-hidden"
      >
        {/* Section tabs bar - sub-menu items as tabs (reference: ATTENDANCE | TIMESHEET) */}
        {sectionTabs.length > 0 && (
          <div className="shrink-0 flex items-end gap-6 px-4 pt-2 pb-0 border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/50">
            {sectionTabs.map((item) => {
              const active = isSectionTabActive(item);
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleSectionTabClick(item)}
                  className={`relative pb-2 pt-1 text-xs font-semibold uppercase tracking-wider transition-colors ${
                    active
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  {item.label}
                  {active && (
                    <span className="absolute left-0 right-0 bottom-0 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Admin Console: two-tier tabs - primary (Manage Tables | Manage Webhooks) then secondary (Skill/Certificate/Training or Webhooks) */}
        {activeTab === "update" && canSeeUpdateTab && (
          <div className="shrink-0 flex flex-col gap-0 border-b border-gray-200 dark:border-gray-700">
            {/* Layer 1: Primary tabs - padding, shadow */}
            <div className="flex items-end gap-6 px-4 py-2 bg-gray-100/90 dark:bg-gray-800/90 border-b border-gray-200 dark:border-gray-700 shadow-sm">
              {adminPrimaryTabs.map((item) => {
                const active = isAdminPrimaryActive(item.key);
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handleAdminPrimaryClick(item.key)}
                    className={`relative pb-2 pt-1 text-xs font-semibold uppercase tracking-wider transition-colors ${
                      active
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                    }`}
                  >
                    {item.label}
                    {active && (
                      <span className="absolute left-0 right-0 bottom-0 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full" />
                    )}
                  </button>
                );
              })}
            </div>
            {/* Layer 2: Secondary tabs - padding, shadow */}
            <div className="flex items-end gap-6 px-4 py-2 bg-white dark:bg-gray-900/95 shadow-sm">
              {adminSecondaryTabs.map((item) => {
                const active = activeTab === "update" && updateSubTab === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handleAdminSecondaryClick(item.key)}
                    className={`relative pb-2 pt-1 text-xs font-semibold uppercase tracking-wider transition-colors ${
                      active
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                    }`}
                  >
                    {item.label}
                    {active && (
                      <span className="absolute left-0 right-0 bottom-0 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-auto overscroll-y-contain hide-scrollbar">
          {showGraph && (
            <OverviewProvider>
              <div className="h-full" style={{ display: effectiveTab === "graph" ? undefined : "none" }}>
                <OverviewTreeGraph onNavigate={(tab) => setActiveTab(tab)} />
              </div>
            </OverviewProvider>
          )}
          {(effectiveTab !== "graph" || showGraphPlaceholder) && content}
        </div>
      </div>
    </div>
  );
}

export default MainComponent;
