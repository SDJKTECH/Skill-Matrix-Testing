import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import usePortalPosition from "../../../../../hooks/usePortalPosition";

/**
 * Lightweight anchored popover — positions itself below `anchorRef` via the
 * shared `usePortalPosition` hook (same one MultiSelectFilter.jsx uses;
 * BatchTable.jsx's InfoPopover is the one exception that keeps its own
 * positioning logic, since it also flips above the trigger and resolves its
 * boundary from the nearest table row instead of the viewport), generalized
 * to arbitrary children instead of one specific field. Portaled to
 * document.body so it overlays content instead of pushing layout, closes on
 * outside click/Escape, and animates open/close with a soft scale+fade
 * instead of appearing instantly.
 *
 * Stays mounted through the closing transition (mounted/visible two-state
 * pattern, same idea as Collapse.jsx's mounted/atRest) so the exit animation
 * actually gets to play instead of the panel just vanishing.
 *
 * Used by both My Trainings (Sort/Year/Status/Mode) and Manager Dashboard
 * (Completion Tier) — lives in shared/ so neither page owns it.
 *
 * Props: { open, onClose, anchorRef, children, panelId? }
 */
export default function FilterPopover({ open, onClose, anchorRef, children, panelId }) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const panelRef = useRef(null);
  const style = usePortalPosition({ anchorRef, panelRef, open: mounted, deps: [children], margin: 8, align: "right" });

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Deferred to the next frame so the panel first paints in its
      // "closed" (opacity-0/scale-95) state, THEN flips to visible — a CSS
      // transition only animates a change between two painted frames of the
      // same element, not an element's very first frame, so setting
      // `visible` in the same tick as `mounted` would skip the animation
      // entirely and just snap open.
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    setVisible(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e) => {
      if (anchorRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
      // A click inside a NESTED floating panel (e.g. a MultiSelectFilter
      // dropdown, itself portaled straight to document.body) lands outside
      // this panel's own DOM subtree even though it's visually "inside"
      // this popover. Without this check, picking a value in that nested
      // dropdown would close this whole popover before the click even
      // registers on the checkbox.
      if (e.target.closest?.("[data-floating-panel]")) return;
      onClose();
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, anchorRef]);

  if (!mounted) return null;

  return createPortal(
    <div
      ref={panelRef}
      id={panelId}
      style={style}
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget && !open) setMounted(false);
      }}
      className={`z-50 w-[min(280px,90vw)] origin-top-right rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl p-3 transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none ${
        visible ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
      }`}
    >
      {children}
    </div>,
    document.body
  );
}
