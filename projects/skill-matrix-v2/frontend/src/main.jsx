import { createRoot } from "react-dom/client";
import { Toaster } from "react-hot-toast";

import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { SkillProvider } from "./context/SkillContext.jsx";
import { CertificateProvider } from "./context/CertificateContext.jsx";
import { TrainingReferenceDataProvider } from "./context/TrainingReferenceDataContext.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import "./index.css";
import { pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

// ✅ Render app without MSAL (using SSO gateway instead)
// Note: AuthProvider needs to be inside SkillProvider to use useSkills hook
createRoot(document.getElementById("root")).render(
  <ThemeProvider>
    <CertificateProvider>
      <SkillProvider>
        <TrainingReferenceDataProvider>
          <AuthProvider>
            <App />
            <Toaster
              position="top-center"
              reverseOrder={false}
              toastOptions={{
                className:
                  "bg-white text-black dark:bg-gray-800 dark:text-white shadow-lg",
                duration: 3000,
              }}
            />
          </AuthProvider>
        </TrainingReferenceDataProvider>
      </SkillProvider>
    </CertificateProvider>
  </ThemeProvider>
);
