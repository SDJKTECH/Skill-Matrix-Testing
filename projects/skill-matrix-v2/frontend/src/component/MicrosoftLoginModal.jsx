import React, { useEffect, useState } from "react";
import JKtechLogo from "../assets/JK_Tech_Logo.jpg";
import jktechLogo from "../assets/JK_Tech_Logo.svg";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../context/ThemeContext";

const MicrosoftLoginModal = ({ onUserFetched }) => {
  const { user, login } = useAuth(); // ✅ use AuthContext
  const { dark } = useTheme();
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (!user) {
      setShowModal(true);
    } else {
      setShowModal(false);
      if (onUserFetched) {
        onUserFetched(user);
      }
    }
  }, [user, onUserFetched]);

  return (
    <>
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 
                    bg-slate-100/80 dark:bg-slate-900/80 backdrop-blur-sm"
        >
          <div className="w-full max-w-sm rounded-xl shadow-2xl overflow-hidden">
            {/* Gradient background inside modal */}
            <div className="bg-gradient-to-b from-slate-50 to-slate-200 dark:from-slate-600 dark:to-slate-950 p-6 text-center">
              <img
                src={dark ? jktechLogo : JKtechLogo}
                alt="JK Tech logo"
                className="mx-auto mb-4 h-20 w-auto"
              />
              <h2 className="mb-3 text-xl font-semibold text-gray-800 dark:text-gray-100">
                Welcome to Skill Matrix
              </h2>
              <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
                Please sign in with your Microsoft account
              </p>
              <button
                onClick={login}
                className="mx-auto mb-3 flex w-full items-center justify-center gap-2 
                       rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white 
                       shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Sign in with Microsoft
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MicrosoftLoginModal;
