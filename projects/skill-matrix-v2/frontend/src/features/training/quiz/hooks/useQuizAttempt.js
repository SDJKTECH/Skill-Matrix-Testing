import { useCallback, useEffect, useRef, useState } from "react";
import { startQuizAttempt, saveQuizAnswer, submitQuizAttempt } from "../../../../helper/quizAttemptApi";
import { useSubmitGuard } from "../../training-batch/hooks/useSubmitGuard";
import { buildAnswersMap, getUnsavedQuestionIds, toggleOption } from "../services/quizAnswers";

/**
 * Loads (starts or resumes) a quiz attempt and holds its state.
 * Pass { email, quizId } or { email, moduleId, quizType }. Load errors
 * (`loadError`) and submit errors (`submitError`) are kept apart so a failed
 * submit keeps the questions and answers on screen.
 * Exposes `answers` ({questionId: optionId[]}), `currentIndex` and `goTo(index)`
 * so a question palette can plug in.
 */
export default function useQuizAttempt({ email, quizId, moduleId, quizType }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [result, setResult] = useState(null);
  const savedRef = useRef({});
  const guard = useSubmitGuard();

  useEffect(() => {
    if (!email) return undefined;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    startQuizAttempt({ email, quizId, moduleId, quizType })
      .then((data) => {
        if (cancelled) return;
        const restored = buildAnswersMap(data.answers);
        savedRef.current = restored;
        setAttempt(data.attempt);
        setQuiz(data.quiz);
        setQuestions([...(data.questions ?? [])].sort((a, b) => a.displayOrder - b.displayOrder));
        setAnswers(restored);
        setCurrentIndex(0);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [email, quizId, moduleId, quizType]);

  const goTo = useCallback(
    (index) => setCurrentIndex(Math.max(0, Math.min(index, Math.max(questions.length - 1, 0)))),
    [questions.length]
  );
  const next = useCallback(() => goTo(currentIndex + 1), [goTo, currentIndex]);
  const previous = useCallback(() => goTo(currentIndex - 1), [goTo, currentIndex]);

  const selectOption = useCallback(
    (question, optionId) => setAnswers((prev) => toggleOption(prev, question, optionId)),
    []
  );

  /** Save every answer that changed, then submit the attempt. */
  const submit = useCallback(async () => {
    if (guard.isLocked() || !attempt || result) return;
    guard.lock();
    setSubmitting(true);
    setSubmitError(null);
    try {
      for (const questionId of getUnsavedQuestionIds(answers, savedRef.current, questions)) {
        const optionIds = answers[questionId] ?? [];
        await saveQuizAnswer({ email, attemptId: attempt.attemptId, questionId, optionIds });
        savedRef.current = { ...savedRef.current, [questionId]: optionIds };
      }
      setResult(await submitQuizAttempt({ email, attemptId: attempt.attemptId }));
    } catch (err) {
      setSubmitError(err.message);
      guard.unlock();
    } finally {
      setSubmitting(false);
    }
  }, [guard, attempt, result, answers, questions, email]);

  return {
    loading,
    loadError,
    quiz,
    questions,
    answers,
    currentIndex,
    goTo,
    next,
    previous,
    selectOption,
    submit,
    submitting,
    submitError,
    result,
  };
}
