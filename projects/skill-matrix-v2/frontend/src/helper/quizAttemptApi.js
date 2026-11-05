// API calls for quiz attempts. All actions go to the backend attempt_quiz_v2
// function (see docs/quiz/attemptQuiz_v2.md). `is_correct` is never returned.
import axios from "axios";
import { BASE_URL } from "../config/apiConfig";

const QUIZ_URL = `${BASE_URL}attempt_quiz_v2`;
const JSON_HEADERS = { headers: { "Content-Type": "application/json" } };

/** Turn an axios error into a readable Error (uses the backend `{ error }` body). */
function toError(err) {
  return new Error(err?.response?.data?.error || err?.message || "Request failed");
}

const post = async (body) => {
  try {
    const response = await axios.post(QUIZ_URL, body, JSON_HEADERS);
    return response.data;
  } catch (err) {
    throw toError(err);
  }
};

/**
 * Start a quiz attempt, or resume the open one.
 * @param {{ email: string, quizId?: number, moduleId?: number, quizType?: "Lesson"|"Course Assessment" }} params
 * @returns {Promise<{ resumed: boolean, attempt: Object, quiz: Object, questions: Array, answers: Array<{questionId, optionIds}> }>}
 */
export const startQuizAttempt = ({ email, quizId, moduleId, quizType }) =>
  post({ action: "start", email, ...(quizId != null ? { quizId } : { moduleId, quizType }) });

/** Save (replace) the answer of one question. An empty optionIds clears it. */
export const saveQuizAnswer = ({ email, attemptId, questionId, optionIds }) =>
  post({ action: "save", email, attemptId, questionId, optionIds });

/** Score and lock the attempt. */
export const submitQuizAttempt = ({ email, attemptId }) => post({ action: "submit", email, attemptId });
