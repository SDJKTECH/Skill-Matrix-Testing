import React, { useState } from "react";
import JKtechLogo from "../assets/JK_Tech_Logo.jpg";
import jktechLogo from "../assets/JK_Tech_Logo.svg";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../context/ThemeContext";
import toast from "react-hot-toast";

// Helper function to create a mock JWT token (for development only)
const createMockJWT = (payload) => {
  // Simple base64 encoding (not cryptographically secure, but fine for dev)
  const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.mock-signature`;
};

const DevLoginModal = ({ originalUser, onClose }) => {
  const { handleAuthCallback } = useAuth();
  const { dark } = useTheme();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Check if the ORIGINAL user (admin) is authorized to use dev login
  // We use originalUser prop instead of current user, because after dev login,
  // the user object changes to the employee we're logging in as
  const isAuthorized = () => {
    if (!originalUser) {
      return false;
    }
    
    const userRole = (originalUser?.role || "").toLowerCase().trim();
    // Check for admin role (case-insensitive, handles variations)
    const isAdmin = userRole === "admin" || userRole === "administrator";
    
    return isAdmin;
  };

  const handleDevLogin = async () => {
    // Security check: verify user is authorized
    if (!isAuthorized()) {
      toast.error("You are not authorized to use dev login. Please contact your administrator.");
      return;
    }

    if (!email || !email.trim()) {
      toast.error("Please enter an email address");
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      toast.error("Please enter a valid email address");
      return;
    }

    setIsLoading(true);

    try {
      // Extract name from email (before @) for display name
      const emailName = email.split("@")[0].replace(/[._]/g, " ");
      const displayName = emailName
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");

      // No employeeId/department/jobTitle here — sending placeholders for
      // these used to overwrite the real employee's data (save_employee_v2
      // now preserves existing values when they're omitted).
      // isDevLogin + adminEmail route save_employee_v2 to its read-only
      // lookup, which verifies adminEmail is an admin in the DB and never
      // writes to the target employee's row (see get_employee_for_dev_login).
      const mockJWT = createMockJWT({
        displayName: displayName,
        userPrincipalName: email.trim(),
        email: email.trim(),
        sub: email.trim(),
        preferred_username: email.trim(),
        isDevLogin: true,
        adminEmail: originalUser?.userPrincipalName || originalUser?.mail || "",
      });

      // Use the existing auth callback handler
      // This will call save_employee_v2 which fetches actual employee data from DB
      await handleAuthCallback(mockJWT);
      
      // Close the modal after successful login
      if (onClose) {
        onClose();
      }
      
      // Note: getUserProfile will be called by handleAuthCallback, which will
      // fetch the actual employee data from the database via save_employee_v2
      // The success message will be shown by getUserProfile
    } catch (error) {
      console.error("Dev login error:", error);
      toast.error("Failed to login. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Show unauthorized message if user is not authorized
  if (!isAuthorized()) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-100/80 dark:bg-slate-900/80 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-b from-slate-50 to-slate-200 dark:from-slate-600 dark:to-slate-950 p-6 text-center">
            <img
              src={dark ? jktechLogo : JKtechLogo}
              alt="JK Tech logo"
              className="mx-auto mb-4 h-16 w-auto"
            />
            <h2 className="mb-2 text-xl font-semibold text-gray-800 dark:text-gray-100">
              Access Denied
            </h2>
            <p className="mb-4 text-sm text-red-600 dark:text-red-400">
              You are not authorized to use the dev login feature.
            </p>
            <p className="mb-2 text-xs text-gray-600 dark:text-gray-400">
              This feature is restricted to Admin role only. Please contact your administrator if you need access.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-100/80 dark:bg-slate-900/80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-b from-slate-50 to-slate-200 dark:from-slate-600 dark:to-slate-950 p-6">
          <img
            src={dark ? jktechLogo : JKtechLogo}
            alt="JK Tech logo"
            className="mx-auto mb-4 h-16 w-auto"
          />
          <h2 className="mb-2 text-xl font-semibold text-gray-800 dark:text-gray-100 text-center">
            Login as Employee
          </h2>
          <p className="mb-4 text-xs text-gray-600 dark:text-gray-400 text-center">
            Enter any employee's email to view their dashboard
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Employee Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isLoading) {
                    handleDevLogin();
                  }
                }}
                placeholder="Enter employee email (e.g., john.doe@jktech.com)"
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
                autoFocus
              />
            </div>

            <button
              onClick={handleDevLogin}
              disabled={isLoading || !email.trim()}
              className="w-full rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Logging in..." : "Login as Employee"}
            </button>
            
            <div className="mt-4 rounded-md bg-blue-50 dark:bg-blue-900/20 p-3 text-xs text-blue-800 dark:text-blue-200">
              <p className="font-semibold mb-1">ℹ️ Note:</p>
              <p>
                Enter any employee's email to login and view their dashboard. The system will 
                automatically load their data from the database.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DevLoginModal;
