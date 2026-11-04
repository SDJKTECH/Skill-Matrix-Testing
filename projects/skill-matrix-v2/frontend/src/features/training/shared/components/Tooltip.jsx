import React, { useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useDelayedDisclosure } from "../../../../hooks/useDelayedDisclosure";
import usePortalPosition from "../../../../hooks/usePortalPosition";
import { ELEVATION } from "../config/elevation";

/**
 * Generic hover/focus tooltip wrapper — extracted out of StatBadge.jsx,
 * which originally owned this timing/positioning/portal logic itself
 * alongside its own "render a label+count" job (an SRP violation: nothing
 * about showing a delayed hover bubble is specific to what a stat badge is,
 * and a future caller wanting the same behavior on some other trigger
 * couldn't reuse it without copying it out of a badge component). This is
 * that reusable piece; StatBadge now composes it instead of implementing it.
 *
 * Standard WAI-ARIA tooltip pattern — focusable trigger, `role="tooltip"`,
 * `aria-describedby` linking the two — not `role="button"`: wrapping an
 * element in this does not make it a control, so `hoverable` (below) only
 * ever adds a hover/focus *background tint*, never button affordances like
 * `cursor-pointer` or a press state. Reuses the exact show/hide-intent
 * timing (useDelayedDisclosure) and anchored-panel math (usePortalPosition)
 * already used elsewhere in this row (Not-Completed pill's preview,
 * InlineMultiSelectFilter/FiltersPopover) rather than a new one-off.
 *
 * `hoverable` (opt-in, default off): paints a neutral gray tint on
 * hover/focus with `cursor-help`, so a trigger that *does* hide real content
 * behind it stops looking inert. Deliberately not the same treatment as a
 * real control like NotCompletedPill (orange, `cursor-pointer`, press
 * state) — that pill performs an action on click; this only ever reveals
 * text, so it keeps the "hover for info" cursor and skips any press/active
 * styling that would imply a click does something. Off by default so a
 * caller that genuinely wants a silent trigger (no visual change at all)
 * still can, rather than this being ripped out wholesale for the one
 * current caller that wants it on.
 *
 * `content` is falsy → the wrapper still renders (so this component always
 * has one render shape, not two — see the comment below), but stays inert:
 * no tabIndex, no hover/focus handlers, no portal ever mounts, and
 * `hoverable` has no visible effect either. A caller with nothing to show
 * simply doesn't opt in, rather than every consumer having to guard for
 * "empty tooltip" itself.
 *
 * `variant`: `"bubble"` (default) — the single-line dark tooltip above.
 * `"panel"` — a wider, scrollable white card (same chrome as
 * NotCompletedPreview.jsx's dialog) for `content` that's a real list, not a
 * one-line string — typically a `DetailList` (shared/components/DetailList)
 * of `DetailListItem`s. Unlike the bubble, the panel accepts pointer events
 * and re-arms the show/hide timers on its own mouseenter/mouseleave — WCAG
 * 1.4.13 "hoverable" — so moving the pointer off the trigger and onto the
 * panel to read or scroll a long list doesn't dismiss it mid-hover (the
 * bubble skips this: it's short, non-interactive, and dismissed the instant
 * the pointer leaves the trigger, same as before).
 *
 * Props: { content: ReactNode, children: ReactElement, className? (applied to the trigger wrapper), hoverable?, variant? }
 */
export default function Tooltip({ content, children, className = "", hoverable = false, variant = "bubble" }) {
  const anchorRef = useRef(null);
  const panelRef = useRef(null);
  const tooltipId = useId();
  const { open, scheduleShow, scheduleHide, hideNow } = useDelayedDisclosure();
  const hasContent = Boolean(content);
  const showTooltip = hasContent && open;
  const isPanel = variant === "panel";
  const style = usePortalPosition({ anchorRef, panelRef, open: showTooltip, align: "left", deps: [content] });
  // Negative margin offsets the padding added for the hover tint, so the
  // label+badge inside doesn't visually shift/reflow when this activates.
  const hoverClass =
    hasContent && hoverable
      ? "rounded-md px-1 -mx-1 py-0.5 cursor-help transition-colors hover:bg-gray-100 dark:hover:bg-gray-700/40"
      : "";

  // One render shape, not two: `children` here is a JSX-sibling array (e.g.
  // <span/><CountBadge/>), and returning it directly from a "no content"
  // early-return risks React's missing-key warning on an unkeyed array.
  // Always rendering the same wrapper, just inert when there's nothing to
  // show, sidesteps that entirely rather than relying on how forgiving
  // React's reconciler happens to be about it.
  return (
    <span
      ref={anchorRef}
      className={`${className} ${hoverClass}`.trim()}
      tabIndex={hasContent ? 0 : undefined}
      aria-describedby={showTooltip ? tooltipId : undefined}
      onMouseEnter={hasContent ? scheduleShow : undefined}
      onMouseLeave={hasContent ? scheduleHide : undefined}
      onFocus={hasContent ? scheduleShow : undefined}
      onBlur={hasContent ? scheduleHide : undefined}
      onKeyDown={hasContent ? (e) => e.key === "Escape" && hideNow() : undefined}
    >
      {children}
      {showTooltip &&
        createPortal(
          <div
            ref={panelRef}
            id={tooltipId}
            role="tooltip"
            style={style}
            onMouseEnter={isPanel ? scheduleShow : undefined}
            onMouseLeave={isPanel ? scheduleHide : undefined}
            className={
              isPanel
                ? `w-80 max-w-[85vw] max-h-80 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 ${ELEVATION.floating} p-3`
                : `max-w-[220px] rounded-md bg-gray-900 dark:bg-gray-700 text-white text-[11px] leading-snug px-2 py-1 ${ELEVATION.floating} pointer-events-none`
            }
          >
            {content}
          </div>,
          document.body
        )}
    </span>
  );
}
