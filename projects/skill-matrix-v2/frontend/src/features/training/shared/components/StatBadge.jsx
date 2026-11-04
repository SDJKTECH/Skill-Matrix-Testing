import React from "react";
import CountBadge from "./CountBadge";
import Tooltip from "./Tooltip";

/**
 * One "Label [6]" unit — plain-text label beside a number-only CountBadge,
 * never merged into a single chip (see CountBadge.jsx's own doc comment on
 * why: one content type per badge).
 *
 * Pure presentation now — tooltip timing/positioning/portal mechanics live
 * in Tooltip.jsx (extracted out of this file: showing a delayed hover
 * bubble isn't specific to what a stat badge is, so it doesn't belong
 * owned by this component). When `detail` is supplied, this just hands it
 * to Tooltip as `content`; Tooltip decides whether/how to reveal it.
 * `hoverable` (default on) asks Tooltip for its neutral hover tint, so a
 * badge that's actually hiding a breakdown behind hover stops looking as
 * inert as one with nothing behind it (previously every StatBadge looked
 * identical either way, which is exactly the discoverability gap that
 * treatment closes — see Tooltip.jsx for why it isn't the pill's orange).
 * `variant` (default `"bubble"`) passes straight through to Tooltip — a
 * badge whose `detail` is a real item list (a `DetailList`, not a one-line
 * string) should pass `"panel"` instead, so it renders in the wider,
 * scrollable card chrome that shape needs rather than being squeezed into
 * the compact single-line bubble meant for a short summary string.
 */
export default function StatBadge({ label, count, detail, className = "", hoverable = true, variant = "bubble" }) {
  return (
    <Tooltip content={detail} hoverable={hoverable} variant={variant} className={`inline-flex shrink-0 items-center gap-1.5 ${className}`}>
      <span className="text-[11px] text-gray-500 dark:text-gray-400">{label}</span>
      <CountBadge count={count} />
    </Tooltip>
  );
}
