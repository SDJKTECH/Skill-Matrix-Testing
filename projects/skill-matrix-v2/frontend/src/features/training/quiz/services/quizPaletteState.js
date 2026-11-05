import { isAnswered } from "./quizAnswers";

export const PALETTE_CURRENT = "current";
export const PALETTE_ANSWERED = "answered";
export const PALETTE_UNANSWERED = "unanswered";

/**
 * Pure: derive one palette item per question from the question list, the
 * answers map ({ [questionId]: optionId[] }) and the current index.
 * `state` is "current" for the open question, otherwise "answered" or
 * "unanswered"; `answered` is kept separately so the current question's
 * answered status is not lost.
 */
export function getPaletteItems(questions = [], answers = {}, currentIndex = 0) {
  return questions.map((question, index) => {
    const answered = isAnswered(answers ?? {}, question.questionId);
    let state = answered ? PALETTE_ANSWERED : PALETTE_UNANSWERED;
    if (index === currentIndex) state = PALETTE_CURRENT;
    return { index, number: index + 1, questionId: question.questionId, state, answered };
  });
}

/** Accessible name, e.g. "Question 3, answered" / "Question 2, unanswered, current". */
export function getPaletteLabel(item) {
  const status = item.answered ? "answered" : "unanswered";
  return item.state === PALETTE_CURRENT ? `Question ${item.number}, ${status}, current` : `Question ${item.number}, ${status}`;
}
