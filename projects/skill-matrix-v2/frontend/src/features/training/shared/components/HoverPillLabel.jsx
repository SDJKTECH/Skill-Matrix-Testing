import React from "react";

/**
 * Shared "padding pill that reveals a soft blue tint on hover/keyboard
 * focus, without reflowing anything" wrapper — the negative margin exactly
 * offsets the always-present padding, so whatever this label sits inside
 * never changes size between states, only the background's visibility
 * does. Always reacts to an ANCESTOR's `group-hover`/`group-focus-visible`,
 * never its own `:hover` — so the same component works whether that
 * ancestor is this label's own immediate wrapper (ViewAllLink.jsx puts
 * `group` on its own <button> — an independently clickable link) or a much
 * bigger clickable parent several levels up (EntityCard.jsx's footer CTA
 * puts `group` on the whole card <button> instead, since a nested <button>
 * there would be a second click target inside a card that's already
 * entirely clickable). One implementation of the reveal mechanics; each
 * caller only decides where its own `group` class lives.
 *
 * Deliberately does not own font-size/weight/icon/rest-state text color —
 * those differ per caller (ViewAllLink is blue even at rest; EntityCard's
 * CTA is gray at rest, only turning blue on reveal) — pass them via
 * `className`, same as any other Tailwind composition. `roundedClassName`
 * defaults to a full pill; EntityCard overrides it to match its own
 * smaller-radius footer. `revealClassName` defaults to the same blue
 * reveal every caller but one uses; OpenEnrollmentGrid.jsx's "Retry"
 * secondary-action link overrides it to amber, matching that link's own
 * (also caller-supplied) amber rest-state text color instead of forcing a
 * blue reveal onto an amber link.
 */
export default function HoverPillLabel({
  children,
  roundedClassName = "rounded-full",
  revealClassName = "group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 group-focus-visible:bg-blue-50 dark:group-focus-visible:bg-blue-900/20",
  className = "",
}) {
  return (
    <span
      className={`inline-flex items-center -mx-1.5 -my-1 px-1.5 py-1 ${roundedClassName} transition-colors duration-200 ${revealClassName} ${className}`}
    >
      {children}
    </span>
  );
}
