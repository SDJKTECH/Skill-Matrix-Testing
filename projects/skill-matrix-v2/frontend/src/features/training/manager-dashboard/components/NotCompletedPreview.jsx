import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import usePortalPosition from "../../../../hooks/usePortalPosition";
import NotCompletedItem from "./NotCompletedItem";
import DetailList from "../../shared/components/DetailList";
import { ELEVATION } from "../../shared/config/elevation";

/**
 * Hybrid hover-preview / click-popover for the "Not Completed" button —
 * ONE panel, not two. Hovering or keyboard-focusing the button shows it
 * temporarily (auto-dismisses on mouse-leave/blur, timing owned by the
 * caller's useDelayedDisclosure); clicking "pins" it open instead — same
 * panel, same content, now dismissed only by Esc (handled on the trigger
 * button in EmployeeRow.jsx) or clicking outside — no in-panel close
 * button. This replaces what used to be two separate components (a
 * non-interactive NotCompletedTooltip + a click-only NotCompletedPopover):
 * once the hover preview grew to show the exact same per-item detail as
 * the popover, keeping both meant showing identical information twice
 * depending on which way you triggered it, not two different levels of
 * detail — one panel with two ways in is the simpler, more predictable
 * result. Purely informational content (no focusable controls inside), so
 * no focus-trap is needed either — keyboard focus just stays on the
 * trigger button the whole time, where Esc already closes it.
 *
 * Props:
 *   pinned - true once clicked; persists regardless of mouse position
 *   hoverOpen - true while the delayed hover/focus preview is showing
 *   onRequestClose - close entirely (unpin AND clear hoverOpen) — wired to
 *     click-outside here and to Esc on the trigger button
 *   onMouseEnter/onMouseLeave - re-armed on the panel itself so moving the
 *     pointer from the button onto the panel doesn't drop it mid-hover
 *     (WCAG 1.4.13 "hoverable") — no-ops once pinned, since pinned no
 *     longer depends on hover at all
 */
export default function NotCompletedPreview({
  pinned,
  hoverOpen,
  onRequestClose,
  onMouseEnter,
  onMouseLeave,
  anchorRef,
  employeeName,
  trainings = [],
}) {
  const panelRef = useRef(null);
  const open = pinned || hoverOpen;

  const style = usePortalPosition({ anchorRef, panelRef, open, align: "right", deps: [trainings.length] });

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target) && !anchorRef?.current?.contains(e.target)) onRequestClose();
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open, onRequestClose, anchorRef]);

  if (!open || trainings.length === 0) return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`Not completed trainings for ${employeeName || "this employee"}`}
      style={style}
      onMouseEnter={() => !pinned && onMouseEnter?.()}
      onMouseLeave={() => !pinned && onMouseLeave?.()}
      className={`w-80 max-w-[85vw] max-h-80 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 ${ELEVATION.floating} p-3`}
    >
      <DetailList
        title={`Not completed (${trainings.length})`}
        items={trainings}
        keyExtractor={(t) => t.id ?? t.moduleName}
        renderItem={(training) => <NotCompletedItem training={training} />}
      />
    </div>,
    document.body
  );
}
