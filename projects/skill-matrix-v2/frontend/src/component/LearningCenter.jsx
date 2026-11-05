import React from "react";

function LearningCenter() {
  return (
    <section className="p-4 sm:p-6" aria-labelledby="learning-center-title">
      <h2
        id="learning-center-title"
        className="text-xl font-semibold text-gray-900 dark:text-gray-100"
      >
        Learning Center
      </h2>
      <div
        className="mt-4 flex min-h-[240px] items-center justify-center rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-6 text-center text-sm text-gray-500 dark:text-gray-400"
        data-testid="learning-center-placeholder"
      >
        Your learning content will appear here.
      </div>
    </section>
  );
}

export default LearningCenter;
