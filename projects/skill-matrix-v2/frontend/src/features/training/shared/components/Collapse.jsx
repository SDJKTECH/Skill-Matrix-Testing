import React, { useState, useEffect } from "react";

/* ── Collapse — smooth height animation for expand/collapse ───────────────────
   Opens and closes a section with a smooth slide.
   - The content inside is created only when the section opens the first
     time, so its data is not loaded too early.
   - When the section is fully open, dropdowns inside are not cut off.
   - min-w-0 stops very wide content from making the page scroll sideways. */
export default function Collapse({ open, children, className = "" }) {
  const [mounted, setMounted] = useState(open);
  const [atRest, setAtRest] = useState(open);

  useEffect(() => {
    if (open) setMounted(true);
    else setAtRest(false); // cut off extra content as soon as it starts to close
  }, [open]);

  return (
    <div
      className={`grid min-w-0 transition-[grid-template-rows] duration-200 ease-in-out motion-reduce:transition-none ${className}`}
      style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget && open) setAtRest(true);
      }}
    >
      <div className={`min-w-0 ${atRest && open ? "overflow-visible" : "overflow-hidden"}`}>
        {mounted ? children : null}
      </div>
    </div>
  );
}
