import { FiCalendar, FiUser, FiUsers, FiInfo, FiClock, FiMonitor, FiTag, FiCheckCircle, FiXCircle, FiAward, FiPlayCircle, FiStar, FiRefreshCw, FiLock } from "react-icons/fi";
import { getTechBanner } from "../../shared/config/technologyBanners";
import { formatDate } from "../../training-batch/services/trainingUtils";

// Button, badge, and ribbon for each request status.
// Add a row here when a new status is added, instead of a new if-statement.
const REQUEST_ACTION_BY_STATUS = {
  null: {
    ctaLabel: "Request Nomination",
    interactive: true,
    highlight: { icon: FiStar, label: "New", title: "New — you haven't requested this yet" },
    // The main thing to do is request, so that is the card click.
    // View Details is a smaller link beside it.
    primaryIsRequest: true,
  },
  "pending approval": {
    ctaLabel: "Pending Approval",
    interactive: false,
    badge: { label: "Pending", icon: FiClock, colorClass: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  },
  "not started": {
    ctaLabel: "Approved",
    interactive: false,
    badge: { label: "Approved", icon: FiCheckCircle, colorClass: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  },
  "not completed": {
    ctaLabel: "Request Again",
    interactive: true,
    note: "Previous request wasn't approved",
    badge: { label: "Not Approved", icon: FiXCircle, colorClass: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300" },
    highlight: { icon: FiRefreshCw, label: "Retry", title: "Not approved last time — you can request again", tone: "retry" },
    primaryIsRequest: true,
  },
  completed: {
    ctaLabel: "Completed",
    interactive: false,
    badge: { label: "Completed", icon: FiAward, colorClass: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  },
  "in progress": {
    ctaLabel: "In Progress",
    interactive: false,
    badge: { label: "In Progress", icon: FiPlayCircle, colorClass: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  },
};

// Replaces New/Retry once the batch has no seats left: no request button, just View Details.
const BATCH_FULL_ACTION = {
  interactive: false,
  note: "No seats left right now.",
  cardClassName: "opacity-75 hover:opacity-100 focus-within:opacity-100 transition-opacity",
  badge: { label: "Batch Full", icon: FiLock, colorClass: "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200" },
};

/**
 * Looks up the button and badge for this employee's status on the batch.
 * A full batch cannot be requested, even if the status would normally allow it.
 */
export function getRequestActionForStatus(personalStatus, seatsAvailable) {
  const action =
    REQUEST_ACTION_BY_STATUS[personalStatus ? String(personalStatus).toLowerCase() : "null"]
    || REQUEST_ACTION_BY_STATUS["pending approval"]; // unknown status: do not let them submit again
  return seatsAvailable === 0 && action.interactive ? BATCH_FULL_ACTION : action;
}

// The user's own request in these statuses doesn't hold a seat (Retry reopens that same row).
const NON_SEAT_STATUSES = ["not completed", "cancelled"];

/** Seats left for this user, or null when the batch has no size limit (employee_count counts every request row). */
export function getSeatsAvailable(batch, personalStatus) {
  const explicit = batch.seats_available ?? batch.seatsAvailable;
  if (explicit != null) return explicit;
  const batchSize = batch.batch_size ?? batch.batchSize;
  if (!batchSize) return null;
  const ownFreedSeat = NON_SEAT_STATUSES.includes(String(personalStatus).toLowerCase()) ? 1 : 0;
  return Math.max(batchSize - (batch.employee_count ?? batch.employeeCount ?? 0) + ownFreedSeat, 0);
}

function formatSeatsLabel(seatsAvailable, batchSize) {
  if (seatsAvailable == null) return null;
  return seatsAvailable === 0 && batchSize ? `All ${batchSize} seats filled` : `${seatsAvailable} seats available`;
}

function getAreaSubArea(item) {
  return [item.areaName, item.subAreaName].filter(Boolean).join(" / ");
}

/** One open batch as props for EntityCard. The calendar line is the batch start date. */
export function toEntityCardPropsForBatch(item, { onRequest, onViewBatch }) {
  const banner = getTechBanner(item);
  const action = getRequestActionForStatus(item.personalStatus, item.seatsAvailable);
  const statusPill = action.badge
    ? { status: action.badge.label, size: "sm", colorMap: { [action.badge.label.toLowerCase()]: action.badge.colorClass }, icon: action.badge.icon }
    : null;

  return {
    banner: { icon: banner.icon, gradient: banner.gradient, tint: banner.tint, border: banner.border, iconColor: banner.iconColor, label: banner.label },
    title: item.moduleName,
    subtitle: getAreaSubArea(item),
    statusPill,
    metaFields: [
      { icon: FiCalendar, value: item.startDate ? formatDate(item.startDate) : null, group: "schedule" },
      { icon: FiClock, value: item.duration, group: "schedule" },
      { icon: FiUser, value: item.trainer, group: "logistics" },
      { icon: FiMonitor, value: item.trainingMode, group: "logistics" },
      { icon: FiUsers, value: formatSeatsLabel(item.seatsAvailable, item.batchSize), group: "logistics" },
      { icon: FiTag, value: item.batchNum, group: "logistics" },
      ...(action.note ? [{ icon: FiInfo, value: action.note, group: "note" }] : []),
    ],
    progressBar: null,
    ctaLabel: action.primaryIsRequest ? action.ctaLabel : "View Details",
    onClick: action.primaryIsRequest ? () => onRequest(item) : () => onViewBatch?.(item.batchNum),
    secondaryAction: action.primaryIsRequest && onViewBatch
      ? { label: "View Details", shortLabel: "Details", tone: "new", onClick: () => onViewBatch(item.batchNum), ariaLabel: `View details for ${item.moduleName} batch ${item.batchNum}` }
      : action.interactive && !action.primaryIsRequest
      ? { label: action.ctaLabel, tone: action.highlight?.tone === "retry" ? "retry" : "new", onClick: () => onRequest(item) }
      : null,
    highlightClassName: action.highlight ? "oe-sparkle-card" : action.cardClassName || "",
    cornerBadge: action.highlight || null,
    ariaLabel: `${item.moduleName}, ${action.badge ? action.badge.label : "Open for enrollment"}${action.note ? `, ${action.note}` : ""}${action.highlight ? `, ${action.highlight.label}` : ""}`,
  };
}
