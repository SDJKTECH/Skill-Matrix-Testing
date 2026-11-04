import { useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import toast from "react-hot-toast";
import { PENDING_DEEP_LINK_SEARCH_KEY } from "../config/deepLinkStorage";

const AuthCallback = () => {
  const { handleAuthCallback } = useAuth();

  useEffect(() => {
    // Restore whatever query string (e.g. a training email's ?batch=...)
    // was in place right before login() redirected to SSO -- see
    // AuthContext.jsx's login(). Read once up front since the token/error
    // params below get stripped from the URL either way.
    const redirectTo = () => {
      let pendingSearch = null;
      try {
        pendingSearch = sessionStorage.getItem(PENDING_DEEP_LINK_SEARCH_KEY);
        sessionStorage.removeItem(PENDING_DEEP_LINK_SEARCH_KEY);
      } catch {
        // A storage failure here must never block the redirect below --
        // falls back to the bare "/", same as if there were no pending link.
      }
      window.location.href = pendingSearch ? `/${pendingSearch}` : "/";
    };

    const processCallback = async () => {
      // Get token from URL parameters
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get("token");
      const error = urlParams.get("error");

      if (error) {
        toast.error(`Authentication failed: ${error}`);
        // Remove error from URL and redirect to home
        window.history.replaceState({}, document.title, "/");
        redirectTo();
        return;
      }

      if (token) {
        try {
          await handleAuthCallback(token);
          // Remove token from URL for security
          window.history.replaceState({}, document.title, "/");
          // Reload to show main app
          redirectTo();
        } catch (err) {
          console.error("Error processing auth callback:", err);
          const errorMsg = err?.response?.data?.error || err?.message || "Failed to process authentication";
          toast.error(`Authentication error: ${errorMsg}`, { duration: 8000 });
          redirectTo();
        }
      } else {
        toast.error("No authentication token received");
        redirectTo();
      }
    };

    processCallback();
  }, [handleAuthCallback]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center">
        <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
        <p className="text-gray-600 dark:text-gray-400">Authenticating...</p>
      </div>
    </div>
  );
};

export default AuthCallback;
