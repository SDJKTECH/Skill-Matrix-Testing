import { useState } from "react";

const DEFAULT_COLLAPSED_COUNT = 4;

/**
 * Collapses a list to a small fixed row count with a "View More"/"Show
 * Less" toggle for the rest — same pattern TrainingProgressCard.jsx
 * pioneered on this page. Caps a card's natural height at a small, known
 * size regardless of item count, so CSS Grid's stretch-to-tallest-sibling
 * behavior can't blow out a whole row's height. This page has no
 * fixed-height ancestor upstream (SelfDashboard.jsx's own root doesn't
 * scroll — MainComponent.jsx's wrapper is the sole scroll owner), so a
 * CSS-only max-height/scroll region has nothing definite to resolve
 * against and doesn't actually cap anything — a data-level cap is the
 * only mechanism that reliably works here.
 */
export default function useCollapsedList(items, collapsedCount = DEFAULT_COLLAPSED_COUNT) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = items.length > collapsedCount;
  const visibleItems = expanded ? items : items.slice(0, collapsedCount);
  return { visibleItems, hasMore, expanded, toggle: () => setExpanded((v) => !v) };
}
