import React from "react";

/**
 * One row inside a DetailList — bold name, muted description, nothing else.
 * Generalized out of manager-dashboard/components/NotCompletedItem.jsx's own
 * name+description shape so the Skills/Certificates hover previews
 * (EmployeeRow.jsx) don't hand-roll the same two lines a third time;
 * NotCompletedItem keeps its own extra "Marked by <name> · <date>" line as
 * its own component since that's specific to a training review decision,
 * not a shape every item list needs. Deliberately just these two lines —
 * Skills/Certificates previews were trimmed back to name + one descriptor
 * (level; provider/level) on purpose, so this stays a plain 2-line row
 * rather than growing a slot for richer per-item chrome that isn't used
 * today (see EmployeeRow.jsx's skillDetail/certDetail comments for why).
 */
export default function DetailListItem({ name, description }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-900 dark:text-white truncate">{name}</p>
      {description && <p className="text-[11px] text-gray-600 dark:text-gray-300 mt-0.5">{description}</p>}
    </div>
  );
}
