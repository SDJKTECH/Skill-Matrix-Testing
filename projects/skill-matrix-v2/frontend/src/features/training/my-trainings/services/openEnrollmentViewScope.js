// Data-driven config for My Trainings' two view scopes — normal (tab-based)
// vs the bell-triggered "Open for Enrollment" full view. Adding a future
// 3rd scope (e.g. a different notification type switching to yet another
// filtered view) is one more entry here, not a rewrite of
// EmployeeTrainingPanel.jsx's JSX (OCP) — every string/behavior the
// component needs to branch on for a given scope lives in that scope's own
// entry, resolved via useOpenEnrollmentView.js.

export const VIEW_SCOPE_KEYS = {
  DEFAULT: "default",
  OPEN_ENROLLMENT: "openEnrollment",
};

/**
 * @typedef {{
 *   key: string,
 *   getTitle: (ctx: {activeBucketLabel: string, count: number}) => string,
 *   getBreadcrumbTail: (ctx) => string|null,
 *   getSearchScopeLabel: (ctx) => string,
 *   searchPlaceholder: string,
 *   showTabs: boolean,
 * }} ViewScopeConfig
 */

/** @type {Record<string, ViewScopeConfig>} */
export const VIEW_SCOPES = {
  [VIEW_SCOPE_KEYS.DEFAULT]: {
    key: VIEW_SCOPE_KEYS.DEFAULT,
    getTitle: () => "My Trainings",
    getBreadcrumbTail: () => null,
    getSearchScopeLabel: (ctx) => ctx.activeBucketLabel,
    searchPlaceholder: "Search trainings...",
    showTabs: true,
  },
  [VIEW_SCOPE_KEYS.OPEN_ENROLLMENT]: {
    key: VIEW_SCOPE_KEYS.OPEN_ENROLLMENT,
    // N is always the count of what's actually visible right now (post-
    // search-filter), supplied by useOpenEnrollmentBatches — never a static
    // catalog size, so it can't drift from what the grid below it shows.
    // The "how many of these N can I still act on" qualifier is NOT baked
    // in here as text — it's rendered as its own small badge in
    // EmployeeTrainingPanel.jsx (next to this heading), matching the same
    // badge language the cards themselves now use (see
    // batchCardAdapter.jsx's REQUEST_ACTION_BY_STATUS) instead of a plain
    // string suffix bolted onto an <h1>. This file stays plain string
    // config on purpose — JSX belongs in the component layer, not here.
    getTitle: (ctx) => `Open for Enrollment (${ctx.count})`,
    getBreadcrumbTail: () => "Open for Enrollment",
    getSearchScopeLabel: () => "Open for Enrollment",
    searchPlaceholder: "Search open batches...",
    showTabs: false,
  },
};
