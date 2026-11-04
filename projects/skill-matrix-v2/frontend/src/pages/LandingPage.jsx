import React from "react";
import { CheckCircle, Info, AlertTriangle, ChevronRight } from "lucide-react";
import jkLogo from "../assets/JK_Tech_Logo.svg";
import landingPageData from "../assets/landingPageData.json"; // JSON import

// Updated LevelHint receives tooltip + label from JSON
const LevelHint = ({ tooltip, label }) => (
  <span
    className="ml-2 inline-flex items-center text-[11px] sm:text-xs text-slate-600 dark:text-slate-400 underline decoration-dotted cursor-help leading-tight"
    title={tooltip}
    aria-label={tooltip}
  >
    {label}
  </span>
);

const LandingPage = ({ onContinue }) => {
  return (
    <div className="flex flex-col min-h-full w-full overflow-x-hidden bg-gradient-to-br from-slate-100 via-slate-200 to-slate-300 dark:from-slate-900 dark:via-slate-950 dark:to-slate-950">
      {/* Main */}
      <main className="flex-grow flex justify-center px-3 sm:px-4 py-3 sm:py-4 pb-8">
        <div className="w-full max-w-4xl bg-white/95 dark:bg-slate-900 shadow-lg rounded-lg p-4 sm:p-5 md:p-6 border border-slate-300 dark:border-slate-700">
          {/* Intro */}
          <p className="text-slate-800 dark:text-slate-300 text-[13px] sm:text-[14px] leading-[1.45] mb-4">
            {landingPageData.intro}
          </p>

          {/* Purpose */}
          <section className="mb-4">
            <h3 className="flex items-center gap-2 text-[17px] font-semibold text-slate-900 dark:text-slate-100 mb-2">
              <Info className="w-[18px] h-[18px] text-blue-600" />
              {landingPageData.purpose.title}
            </h3>
            <div className="grid md:grid-cols-2 gap-2">
              <div className="rounded-md border border-blue-200 dark:border-blue-900 bg-blue-100 dark:bg-blue-950 p-2">
                <p className="text-slate-900 dark:text-slate-200 text-[13px]">
                  {landingPageData.purpose.description}
                </p>
              </div>
              <ul className="list-disc pl-5 text-[13px] text-slate-900 dark:text-slate-200 space-y-1">
                {landingPageData.purpose.points.map((point, i) => (
                  <li key={i}>{point}</li>
                ))}
              </ul>
            </div>
          </section>

          {/* Benefits */}
          <section className="mb-4">
            <h3 className="text-[17px] font-semibold text-slate-900 dark:text-slate-100 mb-2">
              {landingPageData.benefits.title}
            </h3>
            <ul className="grid md:grid-cols-3 gap-2 text-slate-900 dark:text-slate-200 text-[13px]">
              {landingPageData.benefits.list.map((item, i) => (
                <li
                  key={i}
                  className="rounded-md border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-2"
                >
                  {item}
                </li>
              ))}
            </ul>
          </section>

          {/* How to use */}
          <section className="mb-4">
            <h3 className="flex items-center gap-2 text-[17px] font-semibold text-slate-900 dark:text-slate-100 mb-2">
              <CheckCircle className="w-[18px] h-[18px] text-emerald-600" />
              {landingPageData.howToUse.title}
            </h3>
            <ol className="grid grid-cols-1 md:grid-cols-2 gap-2 text-slate-900 dark:text-slate-200 text-[13px]">
              {landingPageData.howToUse.steps.map((step, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-0.5 h-5 w-5 flex items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-[11px]">
                    {i + 1}
                  </span>
                  <span>
                    {step}
                    {i === 2 && (
                      <LevelHint
                        tooltip={landingPageData.levelHint.tooltip}
                        label={landingPageData.levelHint.label}
                      />
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          {/* Disclaimer */}
          <section className="mb-4">
            <h3 className="flex items-center gap-2 text-[17px] font-semibold text-slate-900 dark:text-slate-100 mb-2">
              <AlertTriangle className="w-[18px] h-[18px] text-rose-600" />
              {landingPageData.disclaimer.title}
            </h3>
            <div className="rounded-md border border-rose-300 dark:border-rose-900 bg-rose-100 dark:bg-rose-950 p-2">
              <ul className="list-disc pl-5 text-slate-900 dark:text-slate-200 space-y-1 text-[13px]">
                {landingPageData.disclaimer.warnings.map((warn, i) => (
                  <li key={i}>{warn}</li>
                ))}
              </ul>
              <p className="text-[12px] text-slate-700 dark:text-slate-400 mt-2">
                {landingPageData.disclaimer.footer}
              </p>
            </div>
          </section>

          {/* CTA - extra bottom padding on mobile so button is visible above fold when scrolled */}
          <div className="flex justify-center pt-2 pb-4 sm:pb-0">
            <button
              onClick={() => onContinue()}
              className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold px-4 py-2.5 rounded-md shadow-md"
            >
              Continue to Skill Matrix
              <ChevronRight className="ml-2 h-4 w-4" />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default LandingPage;
  