import React, { useState, useMemo, useRef, useCallback, forwardRef } from "react";
import {
  FiHome,
  FiUser,
  FiDownload,
  FiSettings,
  FiChevronLeft,
  FiChevronRight,
  FiBarChart2,
  FiCheckSquare,
  FiX,
  FiSidebar,
  FiBookOpen
} from "react-icons/fi";
import { useSkillMatrixNav } from "../context/SkillMatrixNavContext";
import { useAuth } from "../hooks/useAuth";
import { useIsMobile } from "../hooks/useMediaQuery";
import { hasFullAccessRole, hasEmployeeOnlyAccess } from "../helper/accessRoles";

// Single source of truth for each nav item's name — used both as the visible
// label when expanded and as the tooltip text when collapsed to icon-only,
// so the two can never drift out of sync (Admin Console has none: hovering
// it opens the Manage Tables/Manage Webhooks flyout instead of a tooltip).
const NAV_LABELS = {
  home: "Home",
  profile: "Profile",
  overviewGraph: "Overview Graph",
  approvals: "Approvals",
  learningCenter: "Learning Center",
  reports: "Reports",
  adminDashboard: "Admin Dashboard",
};

// Shared flyout row (Manage Tables/Webhooks + their nested items). Keeps
// typography/hover/active colors identical to the main nav's itemClass()
// instead of drifting into one-off styles per row.
const MenuItem = forwardRef(function MenuItem(
  { as = "button", active = false, chevron = false, className = "", children, ...rest },
  ref
) {
  const Comp = as;
  const stateClasses = active
    ? "bg-blue-50 dark:bg-gray-800 text-blue-700 dark:text-blue-400"
    // Same dark:hover:bg-gray-800 fix as itemClass() above — kept in sync.
    : "text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800";

  return (
    <Comp
      ref={ref}
      {...(as === "button" ? { type: "button" } : {})}
      className={`flex items-center gap-2 rounded px-3 py-2 text-sm font-medium cursor-pointer transition-colors w-full text-left ${stateClasses} ${className}`}
      {...rest}
    >
      <span className="flex-1 truncate">{children}</span>
      {chevron && (
        <FiChevronRight className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" />
      )}
    </Comp>
  );
});

function Sidebar({ onNavigate, chatOpen = false, mobileOpen = false, onMobileClose }) {
  const { activeTab, setActiveTab, updateSubTab, setUpdateSubTab, openAdminDashboardOverview } =
    useSkillMatrixNav();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [hoverMenu, setHoverMenu] = useState(null);
  const [flyoutTop, setFlyoutTop] = useState(0);
  const [adminSubHover, setAdminSubHover] = useState(null); // "manage-tables" | "manage-webhooks" | null
  const [subFlyoutTop, setSubFlyoutTop] = useState(0);
  const [collapsed, setCollapsed] = useState(true);
  const sidebarRef = useRef(null);
  const manageTablesRowRef = useRef(null);
  const manageWebhooksRowRef = useRef(null);

  // On mobile drawer: always show labels; on desktop: respect collapsed state
  const showLabels = !collapsed || mobileOpen;

  // Shared by every icon (tooltip or flyout): tracks whichever one is
  // currently hovered so hovering a new icon always replaces/closes
  // whatever was showing for the previous one.
  const handleMenuHover = useCallback((key, e) => {
    const item = e.currentTarget;
    const sidebar = sidebarRef.current;
    if (sidebar) {
      const sidebarRect = sidebar.getBoundingClientRect();
      const itemRect = item.getBoundingClientRect();
      setFlyoutTop(itemRect.top - sidebarRect.top);
    }
    setHoverMenu(key);
    if (key !== "admin") setAdminSubHover(null);
  }, []);

  const clearHover = useCallback(() => {
    setHoverMenu(null);
    setAdminSubHover(null);
  }, []);

  const canSeeAdminAndReports = useMemo(() => hasFullAccessRole(user?.role), [user?.role]);

  // Learning Center is employee-only (hidden for manager/admin/dept/hr).
  const canSeeLearningCenter = useMemo(() => hasEmployeeOnlyAccess(user?.role), [user?.role]);

  const handleLearningCenter = () => {
    // "learning-center" is the tab key registered by the Learning Center route.
    setActiveTab("learning-center");
    onNavigate?.();
  };
  const handleHome = () => {
    setActiveTab("home");
    onNavigate?.();
  };
  const handleProfile = () => {
    setActiveTab("profile");
    onNavigate?.();
  };
  const handleOverviewGraph = () => {
    setActiveTab("graph");
    onNavigate?.();
  };
  const handleApprovals = () => {
    setActiveTab("approve");
    onNavigate?.();
  };
  const handleReports = () => {
    setActiveTab("download-report");
    onNavigate?.();
  };
  const handleAdmin = (sub) => {
    setActiveTab("update");
    setUpdateSubTab(sub);
    onNavigate?.();
  };
  const handleAdminDashboard = () => {
    // Always land on the Admin overview — clears any prior bell/deep-link
    // section+scope, including when already on the admin-dashboard tab.
    openAdminDashboardOverview();
    onNavigate?.();
  };

  const isActive = (key) => {
    // Don't highlight any sidebar item when chat is open
    if (chatOpen) return false;
    
    if (key === "home") return activeTab === "home";
    if (key === "profile") return activeTab === "profile";
    if (key === "overviewGraph") return activeTab === "graph";
    if (key === "approvals") return activeTab === "approve";
    if (key === "learningCenter") return activeTab === "learning-center";
    if (key === "reports") return activeTab === "download-report";
    if (key === "admin") return activeTab === "update";
    if (key === "adminDashboard") return activeTab === "admin-dashboard";
    return false;
  };

  const itemClass = (key) =>
    `w-full flex items-center rounded font-medium cursor-pointer transition-colors ${
      mobileOpen ? "text-[15px]" : "text-sm"
    } ${
      collapsed && !mobileOpen
        ? "justify-center p-2.5"
        : mobileOpen
        ? "gap-3 px-4 py-3.5 text-left"
        : "gap-2.5 px-3 py-2.5 text-left"
    } ${
      isActive(key)
        ? "bg-blue-50 dark:bg-gray-800 text-blue-700 dark:text-blue-400"
        // dark:hover:bg-gray-800 (not -700) — matches the hover shade used
        // everywhere else in the app (header icon buttons in layout.jsx,
        // AdminDashboard.jsx, BatchTable.jsx, etc.); -700 was noticeably
        // lighter/stronger than that established convention, which is why
        // it read as visually "off" next to the rest of the dark UI.
        : "text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800"
    }`;

  return (
    <>
      {/* Mobile backdrop overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

    <aside
      ref={sidebarRef}
      className={`
        fixed top-14 bottom-0 left-0 z-50 flex flex-col overflow-visible
         md:relative md:top-auto md:bottom-auto md:z-50 md:shrink-0
        border-r border-gray-200 dark:border-gray-800
        bg-white dark:bg-gray-900
        transition-[width,transform] duration-300 ease-in-out
        w-64 ${collapsed ? "md:w-14" : "md:w-44"}
        ${mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full md:translate-x-0 md:shadow-none"}
      `}
      aria-label="Navigation menu"
      onMouseLeave={clearHover}
    >
      {/* Mobile drawer header: title + close button */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 shrink-0 bg-gray-50 dark:bg-gray-800/60">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 tracking-wide uppercase">
          Navigation
        </span>
        <button
          type="button"
          onClick={onMobileClose}
          className="flex items-center justify-center w-8 h-8 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 cursor-pointer transition-colors"
          aria-label="Close menu"
        >
          <FiX className="h-5 w-5" />
        </button>
      </div>

      {/* Desktop collapse / expand toggle */}
      <div
        className={`hidden md:flex items-center border-b border-gray-200 dark:border-gray-800 shrink-0 ${
          collapsed ? "justify-center p-2" : "justify-end px-3 py-2"
        }`}
        onMouseEnter={clearHover}
      >
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center justify-center w-8 h-8 rounded text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 cursor-pointer transition-colors"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <FiChevronRight className="h-5 w-5" />
          ) : (
            <FiChevronLeft className="h-5 w-5" />
          )}
        </button>
      </div>

      <nav className={`overflow-y-auto flex-1 ${mobileOpen ? "p-3 space-y-1" : "p-2 space-y-0.5"}`}>
        {/* Home */}
        <div className="relative" onMouseEnter={!isMobile ? (e) => handleMenuHover("home", e) : undefined}>
          <button
            type="button"
            onClick={handleHome}
            className={itemClass("home")}
          >
            <FiHome className="h-5 w-5 shrink-0" />
            {showLabels && <span className="truncate">{NAV_LABELS.home}</span>}
          </button>
        </div>

        {/* Profile */}
        <div className="relative" onMouseEnter={!isMobile ? (e) => handleMenuHover("profile", e) : undefined}>
          <button
            type="button"
            onClick={handleProfile}
            className={itemClass("profile")}
          >
            <FiUser className="h-5 w-5 shrink-0" />
            {showLabels && <span className="truncate">{NAV_LABELS.profile}</span>}
          </button>
        </div>

        {/* Overview Graph — hidden on mobile (graph view not available on small screens) */}
        <div className="relative hidden md:block" onMouseEnter={!isMobile ? (e) => handleMenuHover("overviewGraph", e) : undefined}>
          <button
            type="button"
            onClick={handleOverviewGraph}
            className={itemClass("overviewGraph")}
          >
            <FiBarChart2 className="h-5 w-5 shrink-0" />
            {showLabels && <span className="truncate">{NAV_LABELS.overviewGraph}</span>}
          </button>
        </div>

        {/* Approvals */}
        <div className="relative" onMouseEnter={!isMobile ? (e) => handleMenuHover("approvals", e) : undefined}>
          <button
            type="button"
            onClick={handleApprovals}
            className={itemClass("approvals")}
          >
            <FiCheckSquare className="h-5 w-5 shrink-0" />
            {showLabels && <span className="truncate">{NAV_LABELS.approvals}</span>}
          </button>
        </div>

        {/* Learning Center - employees only */}
        {canSeeLearningCenter && (
          <div className="relative" onMouseEnter={!isMobile ? (e) => handleMenuHover("learningCenter", e) : undefined}>
            <button
              type="button"
              onClick={handleLearningCenter}
              className={itemClass("learningCenter")}
            >
              <FiBookOpen className="h-5 w-5 shrink-0" />
              {showLabels && <span className="truncate">{NAV_LABELS.learningCenter}</span>}
            </button>
          </div>
        )}

        {/* Reports - only if allowed */}
        {canSeeAdminAndReports && (
          <div className="relative" onMouseEnter={!isMobile ? (e) => handleMenuHover("reports", e) : undefined}>
            <button
              type="button"
              onClick={handleReports}
              className={itemClass("reports")}
            >
              <FiDownload className="h-5 w-5 shrink-0" />
              {showLabels && <span className="truncate">{NAV_LABELS.reports}</span>}
            </button>
          </div>
        )}

        {/* Admin Console - only if allowed. On mobile: tap opens admin directly (no hover flyout).
            No tooltip here: hovering already opens the Manage Tables/Manage Webhooks flyout,
            which would otherwise render on top of it. */}
        {canSeeAdminAndReports && (
          <div
            className="relative"
            onMouseEnter={!isMobile ? (e) => handleMenuHover("admin", e) : undefined}
          >
            <button
              type="button"
              onClick={() => handleAdmin("skill")}
              className={itemClass("admin")}
            >
              <FiSettings className="h-5 w-5 shrink-0" />
              {showLabels && <span className="truncate">Admin Console</span>}
            </button>
          </div>
        )}
        {/* Admin Dashboard  */}
        {canSeeAdminAndReports && (
          <div className="relative" onMouseEnter={!isMobile ? (e) => handleMenuHover("adminDashboard", e) : undefined}>
            <button
              type="button"
              onClick={handleAdminDashboard}
              className={itemClass("adminDashboard")}
            >
              <FiSidebar className="h-5 w-5 shrink-0" />
              {showLabels && <span className="truncate">{NAV_LABELS.adminDashboard}</span>}
            </button>
          </div>
        )}
      </nav>

      {/* Icon tooltip — instant (no delay), shown only when collapsed to icon-only mode.
          Reuses the same NAV_LABELS text shown when expanded, so it's never inconsistent. */}
      {!showLabels && hoverMenu && NAV_LABELS[hoverMenu] && (
        <div
          className="absolute left-full ml-2 z-50 whitespace-nowrap rounded-md bg-gray-950 px-2.5 py-1.5 text-sm font-medium text-white shadow-lg"
          style={{ top: flyoutTop }}
        >
          {NAV_LABELS[hoverMenu]}
        </div>
      )}

      {/* Flyout: two-level hover — desktop only; on mobile we open Admin directly (no flyout) */}
      {!isMobile && hoverMenu === "admin" && (
        <div
          className="absolute left-full ml-0 flex z-50"
          style={{ top: flyoutTop }}
          onMouseEnter={() => setHoverMenu("admin")}
        >
          {/* First level: only Manage Tables and Manage Webhooks */}
          <div
            className="min-w-[180px] py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-l shadow-lg"
            onMouseLeave={() => setAdminSubHover(null)}
          >
            <MenuItem
              as="div"
              ref={manageTablesRowRef}
              chevron
              active={adminSubHover === "manage-tables"}
              onMouseEnter={() => {
                setAdminSubHover("manage-tables");
                setSubFlyoutTop(manageTablesRowRef.current?.offsetTop ?? 0);
              }}
            >
              Manage Tables
            </MenuItem>
            <MenuItem
              as="div"
              ref={manageWebhooksRowRef}
              chevron
              active={adminSubHover === "manage-webhooks"}
              onMouseEnter={() => {
                setAdminSubHover("manage-webhooks");
                setSubFlyoutTop(manageWebhooksRowRef.current?.offsetTop ?? 0);
              }}
            >
              Manage Webhooks
            </MenuItem>
          </div>

          {/* Second level: nested flyout to the right, aligned with hovered row */}
          {adminSubHover && (
            <div
              className="absolute left-full top-0 min-w-[160px] py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 border-l-0 rounded-r shadow-lg"
              style={{ top: subFlyoutTop }}
              onMouseEnter={() => setAdminSubHover(adminSubHover)}
            >
              {adminSubHover === "manage-tables" && (
                <>
                  <MenuItem
                    onClick={() => handleAdmin("skill")}
                    active={activeTab === "update" && updateSubTab === "skill"}
                  >
                    Skill
                  </MenuItem>
                  <MenuItem
                    onClick={() => handleAdmin("certificates")}
                    active={activeTab === "update" && updateSubTab === "certificates"}
                  >
                    Certificate
                  </MenuItem>
                  <MenuItem
                    onClick={() => handleAdmin("training")}
                    active={activeTab === "update" && updateSubTab === "training"}
                  >
                    Training
                  </MenuItem>
                </>
              )}
              {adminSubHover === "manage-webhooks" && (
                <MenuItem
                  onClick={() => handleAdmin("webhooks")}
                  active={activeTab === "update" && updateSubTab === "webhooks"}
                >
                  Webhooks
                </MenuItem>
              )}
            </div>
          )}
        </div>
      )}
    </aside>
    </>
  );
}

export default Sidebar;
