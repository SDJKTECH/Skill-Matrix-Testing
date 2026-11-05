// Pure helpers for the quiz answers map: { [questionId]: optionId[] }.

export const SINGLE_CHOICE = "Single Choice";

/** Build the answers map from the backend `answers` array (restores a resumed attempt). */
export function buildAnswersMap(serverAnswers = []) {
  const map = {};
  for (const a of serverAnswers) {
    if (a.optionIds?.length) map[a.questionId] = [...a.optionIds];
  }
  return map;
}

/** Return a new map with `optionId` selected/toggled for the question. */
export function toggleOption(answers, question, optionId) {
  const current = answers[question.questionId] ?? [];
  let next;
  if (question.questionType === SINGLE_CHOICE) {
    next = [optionId];
  } else {
    next = current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId];
  }
  const copy = { ...answers };
  if (next.length) copy[question.questionId] = next;
  else delete copy[question.questionId];
  return copy;
}

export const isAnswered = (answers, questionId) => (answers[questionId]?.length ?? 0) > 0;

export const countAnswered = (answers, questions) => questions.filter((q) => isAnswered(answers, q.questionId)).length;

const sameIds = (a, b) => {
  if (a.length !== b.length) return false;
  const sortedB = [...b].sort();
  return [...a].sort().every((v, i) => v === sortedB[i]);
};

/** Question ids whose current answer differs from what the server has saved. */
export function getUnsavedQuestionIds(answers, savedAnswers, questions) {
  return questions
    .map((q) => q.questionId)
    .filter((id) => !sameIds(answers[id] ?? [], savedAnswers[id] ?? []));
}
