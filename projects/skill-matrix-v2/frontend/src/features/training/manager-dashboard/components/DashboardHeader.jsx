import React from "react";

/**
 * Manager Dashboard's title. Previously also showed a "Welcome back...
 * Last updated — N days ago" subtitle — dropped: the underlying
 * daysSinceUpdate figure could render as a nonsensical negative value
 * (a pre-existing data issue in how that stat is computed upstream, out of
 * scope for this component), so the safer fix is not surfacing it here at
 * all rather than displaying a number that can read as broken.
 *
 * Props: { }
 */
export default function DashboardHeader() {
  return <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">Manager Dashboard</h1>;
}
