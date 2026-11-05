import React from "react";
import { FOCUS_RING } from "../../shared/config/focusRing";
import { PALETTE_CURRENT, getPaletteItems, getPaletteLabel } from "../services/quizPaletteState";

const BASE = `relative w-9 h-9 text-sm rounded-md cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${FOCUS_RING}`;
// Shape cues beyond colour: answered = solid border + check mark, unanswered = dashed border,
// current = thick ring + bold text.
const ITEM_STYLES = {
  current: "border-2 border-blue-600 bg-blue-600 text-white font-bold ring-2 ring-blue-300 dark:ring-blue-800",
  answered:
    "border border-solid border-green-600 bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-300 hover:bg-green-100",
  unanswered:
    "border border-dashed border-gray-400 dark:border-gray-500 bg-transparent text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800",
};

/**
 * Question navigation palette. State is derived on every render from
 * `questions`, `answers` and `currentIndex`; clicking a number calls `onJump(index)`.
 */
export default function QuizPalette({ questions, answers, currentIndex, onJump, disabled = false }) {
  const items = getPaletteItems(questions, answers, currentIndex);
  return (
    <nav aria-label="Question palette">
      <ul className="flex flex-wrap gap-2 list-none p-0 m-0">
        {items.map((item) => (
          <li key={item.questionId}>
            <button
              type="button"
              className={`${BASE} ${ITEM_STYLES[item.state]}`}
              aria-label={getPaletteLabel(item)}
              aria-current={item.state === PALETTE_CURRENT ? "step" : undefined}
              disabled={disabled}
              onClick={() => onJump(item.index)}
            >
              {item.number}
              {item.answered && (
                <span aria-hidden="true" className="absolute -top-1 -right-1 text-[10px] leading-none rounded-full bg-green-600 text-white w-3.5 h-3.5 flex items-center justify-center">
                  ✓
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
