import { useEffect, useState } from "react";
import Layout from "./layout";
import "./App.css";
import LandingPage from "./pages/LandingPage";
import MicrosoftLoginModal from "./component/MicrosoftLoginModal";
import AuthCallback from "./pages/AuthCallback";
import { useAuth } from "./hooks/useAuth";
import { useTheme } from "./context/ThemeContext";
import { SkillMatrixNavProvider } from "./context/SkillMatrixNavContext";
import { ManagerApprovalsProvider } from "./context/ManagerApprovalsContext";
import jktechLogo from "./assets/JK_Tech_Logo.svg";
import JKtechLogo from "./assets/JK_Tech_Logo.jpg";
import MainComponent from "./component/MainComponent";
import TrainingEmailDeepLinkListener from "./component/TrainingEmailDeepLinkListener";
import { hasTrainingDeepLink } from "./hooks/useTrainingEmailDeepLink";

function App() {
  const { user } = useAuth();
  const { dark } = useTheme();
  const [showLanding, setShowLanding] = useState(false);
  const [showSplash, setShowSplash] = useState(true); // 🔹 Splash state

  // Check if this is an auth callback
  const urlParams = new URLSearchParams(window.location.search);
  const isAuthCallback = urlParams.has("token") || urlParams.has("error");

  // Load landing state from localStorage on app start
  useEffect(() => {
    // Clean up old MSAL entries from previous authentication implementation
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith("msal.") || key.startsWith("server-telemetry-"))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));

    const hasSeenLanding = localStorage.getItem("hasSeenLanding");
    // A training-notification email link (?batch=...) or a create-batch
    // deep link (view=create-batch&payload=...) is explicit intent to land on one specific
    // place right now -- the landing splash would just be an extra click in
    // the way of that, so skip it for this visit even if the user has never
    // dismissed it before. Doesn't persist "seen" -- a later plain visit
    // still shows it once, same as today.
    const hasEmailDeepLink = hasTrainingDeepLink(window.location.search);
    setShowLanding(!(hasSeenLanding === "true" || hasEmailDeepLink));
  }, []);

  // Hide splash after 3 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // When user continues, mark landing as seen
  const handleContinue = () => {
    localStorage.setItem("hasSeenLanding", "true");
    setShowLanding(false);
  };

  // 🔹 Handle auth callback first
  if (isAuthCallback) {
    return <AuthCallback />;
  }

  // 🔹 Show splash first
  if (showSplash) {
    return (
      <div className=" h-screen flex items-center justify-center bg-gradient-to-r dark:to-gray-900 dark:via-gray-800 dark:from-gray-600">
        <img
          src={dark ? jktechLogo : JKtechLogo}
          className="animate-splash"
          width={350}
          alt="JK Tech Logo"
        />
        <style>{`
          @keyframes grow-fade {
            0% {
              transform: scale(1);
              opacity: 0;
            }
            20% {
              transform: scale(1);
              opacity: 1;
            }
            100% {
              transform: scale(8);
              opacity: 0;
            }
          }
          .animate-splash {
            animation: grow-fade 3s cubic-bezier(0.77, 0, 0.175, 1) forwards;
          }
        `}</style>
      </div>
    );
  }

  // 🔹 Show login modal if not authenticated
  if (!user) {
    return <MicrosoftLoginModal />;
  }

  // Main portal (after login)
  return (
    <div className="max-w-[100vw] max-h-[100vh]">
      <SkillMatrixNavProvider>
        <ManagerApprovalsProvider>
          <TrainingEmailDeepLinkListener />
          <Layout showSidebar={!showLanding} scrollableContent={showLanding}>
            {showLanding ? (
              <LandingPage onContinue={handleContinue} />
            ) : (
              <MainComponent />
            )}
          </Layout>
        </ManagerApprovalsProvider>
      </SkillMatrixNavProvider>
    </div>
  );
}

export default App;
