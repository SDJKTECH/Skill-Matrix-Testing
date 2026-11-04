// Configuration-driven display for certification cards — parallel to
// trainingRecordAdapter.jsx, producing the exact same
// shared/cards/EntityCard.jsx prop shape so training and certification
// cards render interchangeably in the same EntityCardGrid (see
// EmployeeExpandedRecords.jsx). Certifications have NO batch/cohort/
// nomination concept anywhere in the schema (verified against
// backend/aggregations/getCombinedHierarchy_v2/main.py's cert_node
// construction) — this file intentionally does not try to force one; that
// structural difference is exactly why "By Training" (batch-grouped) stays
// trainings-only and certifications only ever appear in the per-employee
// card grid.
import { FiCalendar, FiAward, FiHash, FiClock, FiCheckCircle, FiAlertTriangle, FiXCircle } from "react-icons/fi";
import { formatDate } from "../../training-batch/services/trainingUtils";
import { getTechBanner } from "./technologyBanners";
import { firstDefined } from "./firstDefined";

/**
 * Normalizes a raw hierarchy cert node (mappingId, employeeCertificateId,
 * certName, certProvider, certLevel, validYears, issuedDate, expiryDate —
 * verified live, no approvalStatus field at all on the real API response)
 * to one canonical shape. `approvalStatus` fallback matches
 * context/OverviewContext.jsx's existing `cert.approvalStatus || "Approved"`
 * convention exactly, for consistency with that surface rather than
 * inventing a different default here.
 */
export function normalizeCertRecord(cert) {
  const c = cert || {};
  return {
    id: firstDefined(c, "mappingId", "employeeCertificateId", "id") ?? null,
    certName: firstDefined(c, "certName", "cert_name") || "Certification",
    certProvider: firstDefined(c, "certProvider", "cert_provider") ?? null,
    certLevel: firstDefined(c, "certLevel", "cert_level") ?? null,
    validYears: firstDefined(c, "validYears", "valid_years") ?? null,
    issuedDate: firstDefined(c, "issuedDate", "issued_date") ?? null,
    expiryDate: firstDefined(c, "expiryDate", "expiry_date") ?? null,
    approvalStatus: firstDefined(c, "approvalStatus", "approval_status") || "Approved",
  };
}

// Heads-up window before a cert lapses — same "give the manager enough
// runway to act" intent as trainingRecordAdapter's own RECENT_WINDOW_DAYS,
// just a longer window since renewing a certification is a bigger lift
// than reacting to a new training batch.
const EXPIRING_SOON_WINDOW_DAYS = 60;

/**
 * Valid / Expiring Soon / Expired — the actionable status for a
 * certification (as opposed to `approvalStatus`, which real data never
 * meaningfully varies since the field doesn't exist upstream). No
 * expiryDate on record (some certs don't expire) reads as permanently
 * Valid, not an error state.
 */
export function getCertExpiryStatus(expiryDate) {
  if (!expiryDate) return "Valid";
  const expiry = new Date(expiryDate);
  if (isNaN(expiry.getTime())) return "Valid";
  const daysLeft = (expiry.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
  if (daysLeft < 0) return "Expired";
  if (daysLeft <= EXPIRING_SOON_WINDOW_DAYS) return "Expiring Soon";
  return "Valid";
}

// Passed as StatusPill's `colorMap` — its default (ENROLLMENT_STATUS_COLORS)
// is training-status vocabulary and has no entry for these keys, which
// would otherwise fall through to flat gray for every cert card.
export const CERT_STATUS_COLORS = {
  valid: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  "expiring soon": "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  expired: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

// Same "icon + text, not text alone" pairing as ENROLLMENT_STATUS_ICONS
// (trainingUtils.js) — its own map, not a reuse of that one, since a cert's
// Valid/Expiring Soon/Expired vocabulary is a genuinely different set of
// meanings from a training's, even where a color happens to coincide.
export const CERT_STATUS_ICONS = {
  valid: FiCheckCircle,
  "expiring soon": FiAlertTriangle,
  expired: FiXCircle,
};

/**
 * Maps a normalized cert record to EntityCard's generic prop shape —
 * mirrors trainingRecordAdapter.jsx's toEntityCardProps. Banner reuses the
 * existing technology-keyword table as-is (a real cert name like "AWS
 * Certified Solutions Architect" / provider "Amazon Web Services" hits the
 * same "aws" keyword a training titled that way would) by mapping
 * certName->moduleName / certProvider->areaName before calling in, rather
 * than maintaining a second banner table — with an explicit fallbackLabel
 * so a non-matching cert doesn't print the training-specific default.
 *
 * @param {object} cert - already normalizeCertRecord()'d
 * @param {{onClick?: () => void}} [opts]
 */
export function toEntityCardProps(cert, { onClick } = {}) {
  const banner = getTechBanner(
    { moduleName: cert.certName, areaName: cert.certProvider },
    { fallbackLabel: "Certification" }
  );
  const status = getCertExpiryStatus(cert.expiryDate);

  return {
    // No `sublabel` — it repeated `subtitle` (certProvider) a second time
    // inside the banner strip; EntityCard.jsx no longer renders it.
    banner: { icon: banner.icon, gradient: banner.gradient, tint: banner.tint, border: banner.border, iconColor: banner.iconColor, label: banner.label },
    title: cert.certName,
    subtitle: [cert.certProvider, cert.certLevel].filter(Boolean).join(" / "),
    statusPill: { status, size: "sm", colorMap: CERT_STATUS_COLORS, icon: CERT_STATUS_ICONS[status.toLowerCase()] },
    // Grouped by theme (icon-anchored card redesign, req 3): "schedule"
    // (when it was issued / when it lapses) vs "details" (level, validity
    // window) — mirrors trainingRecordAdapter.jsx's own grouping.
    metaFields: [
      { icon: FiCalendar, value: cert.issuedDate ? formatDate(cert.issuedDate) : null, group: "schedule" },
      { icon: FiClock, value: cert.expiryDate ? `Expires ${formatDate(cert.expiryDate)}` : null, group: "schedule" },
      { icon: FiHash, value: cert.certLevel, group: "details" },
      { icon: FiAward, value: cert.validYears ? `${cert.validYears} yr validity` : null, group: "details" },
    ],
    progressBar: null,
    ctaLabel: "View Details",
    onClick,
    ariaLabel: `View details for ${cert.certName}, status ${status}`,
  };
}
