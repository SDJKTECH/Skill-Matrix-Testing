// Shared `focus-visible` ring treatment — was independently declared as an
// identical `const FOCUS_RING = "..."` in a dozen+ components across all
// three training pages (plus re-exported under other names —
// ApprovalCheckbox.jsx's APPROVAL_FOCUS_RING, IconRevealTrigger.jsx's
// ICON_REVEAL_FOCUS — both of which now alias this constant instead of
// duplicating the string). ApprovalCheckbox.jsx's own separate, unexported
// `FOCUS_RING` (a `peer-focus-visible:` variant for its checkbox/label
// pattern) is deliberately NOT this — that one stays local, it styles a
// different kind of element and was never a duplicate of this.
export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900";
