import React from "react";

/**
 * Responsive auto-fill card grid — pure layout, zero knowledge of what
 * kind of cards it's laying out (children are pre-built elements, e.g.
 * <EntityCard>, supplied by the caller). Column count is CALCULATED, not a
 * fixed breakpoint list (a grid-cols-1 sm:...-2 lg:...-3 ladder stretches
 * cards to fill leftover width past its last breakpoint — fine at 1440px,
 * wrong at 1920px+). Uses auto-fill (not auto-fit) with a capped max track:
 * auto-fit + 1fr stretches however-many-cards-fit to fill the ENTIRE row
 * width, so a sparse list (e.g. one lone card) would render one card
 * spanning the full container — auto-fill keeps the remaining tracks as
 * blank space instead of handing it to the lone card, and the max-track
 * cap stops any card from over-stretching even when there IS enough
 * content to fill a row. min(Npx,100%) is what keeps narrow mobile safe:
 * below that width the minimum becomes 100% of the container instead of a
 * fixed px value, so there's no horizontal overflow.
 *
 * `compact`: additive, opt-in — default (false) is My Trainings' original
 * track sizing, unchanged. Manager Dashboard's expanded-row usage opts
 * into a narrower track (and passes `compact` down to each EntityCard
 * child itself) since it renders inside a much narrower column than My
 * Trainings' full-page grid — the default track size left a lone card
 * stranded with a large blank gap beside it there; a narrower track fits
 * more cards per row in that same width instead.
 *
 * Props: { children, compact? }
 */
export default function EntityCardGrid({ children, compact = false }) {
  return (
    <div
      className={`grid ${
        compact
          ? "gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(200px,100%),220px))]"
          : "gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(260px,100%),1fr))]"
      }`}
    >
      {children}
    </div>
  );
}
