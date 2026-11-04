import React, { useState, useRef, useEffect } from "react";
import jkLogo from "./assets/JK_Tech_Logo.svg";
import { useAuth } from "./hooks/useAuth";
import ThemeToggle from "./component/ThemeToggle";
import { getChar } from "./helper/utility";
import Sidebar from "./component/Sidebar";
import { FiHelpCircle, FiMessageCircle, FiMenu } from "react-icons/fi";
import ChatPanel from "./component/ChatPanel";
import { useSkillMatrixNav } from "./context/SkillMatrixNavContext";
import DevLoginModal from "./component/DevLoginModal";

function Layout({ children, showSidebar = true, scrollableContent = false }) {
  const { user, logout } = useAuth();
  const { setActiveTab } = useSkillMatrixNav();
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [showDevLogin, setShowDevLogin] = useState(false);
  const [originalAdminUser, setOriginalAdminUser] = useState(null);
  const menuRef = useRef(null);

  // Check if dev login is allowed for current user (Admin role only).
  // save_employee_v2's isDevLogin path checks adminEmail against the DB role itself
  const isDevLoginAllowed = () => {
    // MODE reflects --mode (dev/prod), not DEV (only true for `vite dev` itself)
    // Commented out for now so the button shows regardless of build mode — bring back if we want it dev-only again.
    // const isDevelopment = import.meta.env.MODE !== "prod";
    // if (!isDevelopment) {
    //   console.log("DevLogin: Not in development mode");
    //   return false;
    // }

    if (!user) {
      return false;
    }
    
    const userRole = (user?.role || "").toLowerCase().trim();
    // Check for admin role (case-insensitive, handles variations)
    const isAdmin = userRole === "admin" || userRole === "administrator";
    
    return isAdmin;
  };

  // Close dropdown if clicked outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const headerEl = (
    <header className="h-14 shrink-0 px-4 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-800 flex items-center">
      <div className="w-full flex flex-wrap items-center justify-between gap-3 relative">
          {/* Left: Hamburger (mobile only) + Logo + Skill Matrix */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {showSidebar && (
              <button
                type="button"
                onClick={() => setMobileSidebarOpen((prev) => !prev)}
                className="md:hidden flex items-center justify-center h-8 w-8 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition-colors"
                aria-label="Toggle navigation menu"
              >
                <FiMenu className="h-5 w-5" />
              </button>
            )}
            <img
              src={jkLogo}
              alt="JK Tech logo"
              className="h-8 w-auto"
            />
            <div className="hidden sm:block w-px h-6 bg-gray-300 dark:bg-gray-700 ml-3"></div>
            <div className="text-left ml-3">
              <h1 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                Skill Matrix
              </h1>
            </div>
          </div>

          {/* Right: Bot chat + Help + Theme toggle + User Info */}
          <div className="flex items-center gap-3 sm:gap-4" ref={menuRef}>
            {/* Bot / Chat Button */}
            <button
              type="button"
              onClick={() => setChatOpen((prev) => !prev)}
              title={chatOpen ? "Close chat" : "Open chat"}
              className={`flex items-center justify-center h-8 w-8 rounded cursor-pointer transition-colors ${
                chatOpen
                  ? "bg-gray-100 dark:bg-gray-800 text-blue-600 dark:text-blue-400"
                  : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
              }`}
            >
              <FiMessageCircle className="h-5 w-5" />
            </button>
            {/* Help Button */}
            <div className="relative group">
              <a
                href="https://skill-matrix-manuals.netlify.app/"
                target="_blank"
                rel="noopener noreferrer"
                title="Help"
                className="flex items-center justify-center h-8 w-8 rounded hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
              >
                <FiHelpCircle className="h-5 w-5 text-gray-700 dark:text-gray-300" />
              </a>
            </div>

            {/* 🌙 Theme Toggle */}
            <ThemeToggle />

            {/* User Info + Avatar */}
            {user?.displayName && (
              <div className="relative flex items-center gap-2 sm:gap-3">
                {/* Hide text on xs for space */}
                <div className="hidden sm:flex flex-col items-end text-right">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate max-w-[160px]">
                    {user.displayName}
                  </span>
                  <span
                    className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[160px]"
                    title={user.mail || user.userPrincipalName}
                  >
                    {user.mail || user.userPrincipalName}
                  </span>
                </div>

                {/* Profile Avatar */}
                <div className="relative">
                  <img
                    src={user.photoUrl}
                    alt="Profile"
                    className="h-8 w-8 rounded-full cursor-pointer hover:opacity-80"
                    onClick={() => setMenuOpen((prev) => !prev)}
                  />

                  {/* Dropdown */}
                  {menuOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 z-[9999] overflow-hidden rounded">
                      {/* User details */}
                      <div className="flex flex-col items-center justify-center text-sm text-gray-700 dark:text-gray-200 space-y-1 py-3 px-4 border-b border-gray-200 dark:border-gray-700">
                        <p className="font-semibold text-gray-800 dark:text-white text-center capitalize truncate">
                          {user.displayName + " " + getChar() || "NA"}
                        </p>
                        <p
                          className="truncate text-gray-500 dark:text-gray-300 text-center"
                          title={user.mail || user.userPrincipalName}
                        >
                          {(user.mail || user.userPrincipalName || "NA")
                            .length > 22
                            ? (user.mail || user.userPrincipalName).slice(
                                0,
                                19
                              ) + "..."
                            : user.mail || user.userPrincipalName || "NA"}
                        </p>
                        <p className="text-gray-500 dark:text-gray-400 text-center uppercase">
                          {user.department || "NA"}
                        </p>
                      </div>

                      {/* Profile */}
                      <button
                        className="w-full py-2 text-center text-sm text-gray-700 dark:text-gray-200 
                        border-b border-gray-200 dark:border-gray-700
                        hover:bg-gray-50 dark:hover:bg-gray-700"
                        onClick={() => {
                          setActiveTab("profile");
                          setMenuOpen(false);
                        }}
                      >
                        Profile
                      </button>
                      
                      {/* Dev Login - Only for authorized users in development */}
                      {isDevLoginAllowed() && (
                        <button
                          className="w-full py-2 text-center text-sm text-green-600 dark:text-green-400 
                          border-b border-gray-200 dark:border-gray-700
                          hover:bg-gray-50 dark:hover:bg-gray-700"
                          onClick={() => {
                            // Store the current admin user before opening dev login
                            // This ensures we check the admin's role, not the employee we're logging in as
                            setOriginalAdminUser({ ...user });
                            setShowDevLogin(true);
                            setMenuOpen(false);
                          }}
                        >
                          🧪 Dev Login
                        </button>
                      )}
                      
                      {/* Logout */}
                      <button
                        onClick={logout}
                        className="w-full py-2 text-center text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        Logout
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>
  );

  const mainContent = chatOpen ? (
    <div className="flex-1 flex min-h-0 min-w-0">
      <ChatPanel
        open={chatOpen}
        fullScreen
        embeddedInContent
        onClose={() => setChatOpen(false)}
      />
    </div>
  ) : (
    <main className="flex-1 flex min-h-0 min-w-0 p-2 sm:p-4 bg-white dark:bg-gray-900 dark:text-gray-100 overflow-hidden">
      {children}
    </main>
  );

  return (
    <>
      {showDevLogin && (
        <DevLoginModal 
          originalUser={originalAdminUser || user} 
          onClose={() => setShowDevLogin(false)}
        />
      )}
      <div className="h-screen flex flex-col relative bg-white dark:bg-gray-900 dark:text-gray-100">
      {showSidebar ? (
        <>
          {/* Full-width header */}
          {headerEl}
          {/* Below: menu bar (sidebar) + content */}
          <div className="flex flex-1 min-h-0 min-w-0">
            <Sidebar
              onNavigate={() => { setChatOpen(false); setMobileSidebarOpen(false); }}
              chatOpen={chatOpen}
              mobileOpen={mobileSidebarOpen}
              onMobileClose={() => setMobileSidebarOpen(false)}
            />
            {mainContent}
          </div>
        </>
      ) : (
        <>
          <header className="fixed top-0 left-0 right-0 h-14 px-4 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-800 z-[100] flex items-center">
            <div className="w-full flex flex-wrap items-center justify-between gap-3 relative">
              <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                <img src={jkLogo} alt="JK Tech logo" className="h-8 w-auto" />
                <div className="hidden sm:block w-px h-6 bg-gray-300 dark:bg-gray-700 ml-3"></div>
                <div className="text-left ml-3">
                  <h1 className="text-lg font-medium text-gray-900 dark:text-gray-100">Skill Matrix</h1>
                </div>
              </div>
              <div className="flex items-center gap-3 sm:gap-4" ref={menuRef}>
                <button type="button" onClick={() => setChatOpen((prev) => !prev)} title={chatOpen ? "Close chat" : "Open chat"} className={`flex items-center justify-center h-8 w-8 rounded cursor-pointer transition-colors ${
                  chatOpen
                    ? "bg-gray-100 dark:bg-gray-800 text-blue-600 dark:text-blue-400"
                    : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                }`}>
                  <FiMessageCircle className="h-5 w-5" />
                </button>
                <a href="https://skill-matrix-manuals.netlify.app/" target="_blank" rel="noopener noreferrer" title="Help" className="flex items-center justify-center h-8 w-8 rounded hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer">
                  <FiHelpCircle className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                </a>
                <ThemeToggle />
                {user?.displayName && (
                  <div className="relative flex items-center gap-2 sm:gap-3">
                    <div className="hidden sm:flex flex-col items-end text-right">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate max-w-[160px]">{user.displayName}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[160px]" title={user.mail || user.userPrincipalName}>{user.mail || user.userPrincipalName}</span>
                    </div>
                    <div className="relative">
                      <img src={user.photoUrl} alt="Profile" className="h-8 w-8 rounded-full cursor-pointer hover:opacity-80" onClick={() => setMenuOpen((prev) => !prev)} />
                      {menuOpen && (
                        <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 z-[9999] overflow-hidden rounded">
                          <div className="flex flex-col items-center justify-center text-sm text-gray-700 dark:text-gray-200 space-y-1 py-3 px-4 border-b border-gray-200 dark:border-gray-700">
                            <p className="font-semibold text-gray-800 dark:text-white text-center capitalize truncate">{user.displayName + " " + getChar() || "NA"}</p>
                            <p className="truncate text-gray-500 dark:text-gray-300 text-center" title={user.mail || user.userPrincipalName}>{(user.mail || user.userPrincipalName || "NA").length > 22 ? (user.mail || user.userPrincipalName).slice(0, 19) + "..." : user.mail || user.userPrincipalName || "NA"}</p>
                            <p className="text-gray-500 dark:text-gray-400 text-center uppercase">{user.department || "NA"}</p>
                          </div>
                          <button className="w-full py-2 text-center text-sm text-gray-700 dark:text-gray-200 border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700" onClick={() => { setActiveTab("profile"); setMenuOpen(false); }}>Profile</button>
                          {isDevLoginAllowed() && (
                            <button
                              className="w-full py-2 text-center text-sm text-green-600 dark:text-green-400 border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                              onClick={() => {
                                // Store the current admin user before opening dev login
                                setOriginalAdminUser({ ...user });
                                setShowDevLogin(true);
                                setMenuOpen(false);
                              }}
                            >
                              🧪 Dev Login
                            </button>
                          )}
                          <button onClick={logout} className="w-full py-2 text-center text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">Logout</button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </header>
          <div className="flex-1 flex min-h-0 pt-14">
            {chatOpen ? (
              <div className="flex-1 flex min-h-0 min-w-0">
                <ChatPanel open={chatOpen} fullScreen embeddedInContent onClose={() => setChatOpen(false)} />
              </div>
            ) : (
              <main className={`flex-1 flex min-h-0 min-w-0 p-4 bg-white dark:bg-gray-900 dark:text-gray-100 ${scrollableContent ? "overflow-y-auto overflow-x-hidden" : "overflow-hidden"}`}>
                {children}
              </main>
            )}
          </div>
        </>
      )}

    </div>
    </>
  );
}

export default Layout;
