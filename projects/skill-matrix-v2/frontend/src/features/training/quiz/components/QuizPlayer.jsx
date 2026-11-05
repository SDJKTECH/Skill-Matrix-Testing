import React from "react";
import LoadingSpinner from "../../shared/components/LoadingSpinner";
import { FOCUS_RING } from "../../shared/config/focusRing";
import { useAuth } from "../../../../hooks/useAuth";
import useQuizAttempt from "../hooks/useQuizAttempt";
import { SINGLE_CHOICE, countAnswered } from "../services/quizAnswers";

const BTN = `px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${FOCUS_RING}`;
const PRIMARY_BTN = `px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer ${FOCUS_RING}`;

function ResultView({ result, onExit }) {
  const passed = result.passed;
  return (
    <div className="flex flex-col gap-3 items-start" role="status">
      <h2 className="text-lg font-bold text-gray-900 dark:text-white">Quiz result</h2>
      <p className="text-sm text-gray-700 dark:text-gray-300">
        Score: <strong>{result.score}</strong> / {result.maxScore} ({result.percentage}%)
      </p>
      <p className="text-sm text-gray-700 dark:text-gray-300">Pass mark: {result.passPercentage}%</p>
      <p className={`text-base font-semibold ${passed ? "text-green-600" : "text-red-600"}`}>
        {result.result ?? (passed ? "Pass" : "Fail")}
      </p>
      {onExit && (
        <button type="button" onClick={onExit} className={PRIMARY_BTN}>
          Close
        </button>
      )}
    </div>
  );
}

/**
 * Quiz player: one question at a time with Previous/Next and Submit.
 * Pass `quizId`, or `moduleId` + `quizType` ("Lesson" | "Course Assessment").
 */
export default function QuizPlayer({ quizId, moduleId, quizType, onExit }) {
  const { user } = useAuth();
  const q = useQuizAttempt({ email: user?.email, quizId, moduleId, quizType });
  const { questions, answers, currentIndex } = q;

  if (q.loading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-gray-500 dark:text-gray-400">
        <LoadingSpinner label="Loading quiz…" />
      </div>
    );
  }
  if (q.loadError) {
    return (
      <div className="flex flex-col gap-3 items-start p-3" role="alert">
        <p className="text-sm text-red-600">Could not load the quiz: {q.loadError}</p>
        {onExit && (
          <button type="button" onClick={onExit} className={BTN}>
            Back
          </button>
        )}
      </div>
    );
  }
  if (q.result) {
    return (
      <div className="p-3">
        <ResultView result={q.result} onExit={onExit} />
      </div>
    );
  }
  const question = questions[currentIndex];
  if (!question) return <p className="p-3 text-sm text-gray-500">This quiz has no questions.</p>;

  const single = question.questionType === SINGLE_CHOICE;
  const selected = answers[question.questionId] ?? [];
  const isLast = currentIndex === questions.length - 1;
  const options = [...question.options].sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <div className="flex flex-col gap-3 p-3">
      <div>
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">{q.quiz?.title}</h1>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Question {currentIndex + 1} of {questions.length} · {countAnswered(answers, questions)} answered
        </p>
      </div>

      <fieldset className="flex flex-col gap-2" disabled={q.submitting}>
        <legend className="text-sm font-medium text-gray-900 dark:text-white mb-1">{question.questionText}</legend>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {single ? "Select one answer" : "Select all that apply"}
        </p>
        {options.map((opt) => (
          <label key={opt.optionId} className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200 cursor-pointer">
            <input
              type={single ? "radio" : "checkbox"}
              name={`question-${question.questionId}`}
              checked={selected.includes(opt.optionId)}
              onChange={() => q.selectOption(question, opt.optionId)}
              className={FOCUS_RING}
            />
            {opt.optionText}
          </label>
        ))}
      </fieldset>

      {q.submitError && (
        <p className="text-sm text-red-600" role="alert">
          Could not submit: {q.submitError}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button type="button" className={BTN} onClick={q.previous} disabled={currentIndex === 0 || q.submitting}>
          Previous
        </button>
        {!isLast && (
          <button type="button" className={BTN} onClick={q.next} disabled={q.submitting}>
            Next
          </button>
        )}
        {isLast && (
          <button type="button" className={PRIMARY_BTN} onClick={q.submit} disabled={q.submitting}>
            {q.submitting ? "Submitting…" : "Submit"}
          </button>
        )}
      </div>
    </div>
  );
}
