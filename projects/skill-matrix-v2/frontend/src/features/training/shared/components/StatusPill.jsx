import React from "react";
import { ENROLLMENT_STATUS_COLORS } from "../../training-batch/services/trainingUtils";

// shared/ isn't leaf-level by this one dependency — StatusPill needs the
// real training-status color vocabulary, which is owned by training-batch
// (the feature that originated it). That's a deliberate, pre-existing
// cross-feature reach (not introduced by moving this file here), not a
// layering mistake to "fix" — a future reader shouldn't assume shared/ has
// zero downward dependencies.
const STATUS_FALLBACK_CLASS = "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300";

// Employee-facing display label override — the real backend value stays
// "Nominated" everywhere (color lookup, filtering, scope-matching all key
// off it unchanged), but an employee reading their own training list
// thinks "pending approval," not "nominated," so only what's PRINTED here
// changes. The admin side's own EnrollmentStatusBadge in EnrollmentTable.jsx
// is untouched and keeps showing "Nominated" verbatim, which is the correct
// term for that audience.
const DISPLAY_LABEL_OVERRIDES = {
  nominated: "Pending Approval",
};

/**
 * Real, unfolded status pill — reused by EntityCard and any detail view.
 * `size="sm"` (EntityCard, sitting in the card's compact header bar) trims
 * padding/weight/font-size down from the default (`"md"`, used in
 * plain-background label/value grids, where a slightly bolder pill reads
 * better) — same sizing this card always used, kept as-is on review even
 * after status moved from beside the title into the header bar.
 *
 * `colorMap` defaults to the real training-status vocabulary
 * (ENROLLMENT_STATUS_COLORS) — an entity type with its own status
 * vocabulary (e.g. certifications' Valid/Expiring Soon/Expired, see
 * certRecordAdapter.jsx) passes its own map instead, rather than every
 * unmapped key silently falling through to flat gray.
 *
 * `icon` (optional, additive): a react-icons component rendered before the
 * label — every existing caller omits it and renders byte-for-byte as
 * before. Added for Open-for-Enrollment's personal-status badges
 * (batchCardAdapter.jsx), where color alone isn't enough — pairing status
 * with both an icon and a text label (not color/shape alone) is a basic
 * accessibility requirement for status indicators, not just a style choice.
 * `label` (optional): overrides the printed text without changing which
 * color/icon key is looked up — lets a caller show a shorter/friendlier
 * word ("Approved") than the raw status value used for the color lookup.
 *
 * `size="corner"`: the corner-badge variant (EntityCard's card-level status
 * indicator, floating over the banner's top-right corner) — same icon+label
 * pill this component always rendered, just filled solid (the real
 * colorClass, not a translucent chip) with a stronger shadow/ring so it
 * reads clearly floating over whatever's underneath it, and a pending-only
 * animated ring since "pending" specifically means waiting on someone
 * else. Kept on `Icon`, not swapped for a plain color dot — an icon per
 * status (not color alone) is this component's own long-standing
 * accessibility rule (see the `icon` prop doc below), which a corner
 * placement doesn't change.
 */
export default function StatusPill({ status, size = "md", colorMap = ENROLLMENT_STATUS_COLORS, icon: Icon, label }) {
  const key = String(status).toLowerCase();
  const colorClass = colorMap[key] || STATUS_FALLBACK_CLASS;
  const text = label || DISPLAY_LABEL_OVERRIDES[key] || status;

  if (size === "corner") {
    // A "pending" status means "waiting on someone else" — worth a subtle
    // animated ring on the badge itself so a card needing action from
    // someone else reads as live/waiting, not settled the same way
    // Completed/Approved/etc do. Every other status stays static.
    const isPending = key.includes("pending");
    return (
      <span className={`relative inline-flex items-center gap-1 rounded-full shrink-0 pl-1.5 pr-2 py-1 text-[11px] font-semibold shadow-md ring-1 ring-black/5 dark:ring-white/10 ${colorClass}`}>
        {isPending && <span className="absolute inset-0 rounded-full ring-2 ring-current opacity-40 animate-ping" aria-hidden="true" />}
        {Icon && <Icon className="relative h-3 w-3 shrink-0" aria-hidden="true" />}
        <span className="relative">{text}</span>
      </span>
    );
  }

  const sizeClass = size === "sm" ? "px-2 py-0.5 text-[11px] font-medium" : "px-2 py-0.5 text-xs font-medium";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full shrink-0 ${sizeClass} ${colorClass}`}>
      {Icon && <Icon className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden="true" />}
      {text}
    </span>
  );
}
