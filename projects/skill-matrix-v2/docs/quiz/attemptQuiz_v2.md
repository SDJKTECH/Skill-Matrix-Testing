# attemptQuiz_v2 Function Documentation

## Overview

**Function Name**: `attempt_quiz_v2`
**Location**: `backend/quiz/attemptQuiz_v2/main.py`
**Port (Local Development)**: 8112
**Methods**: `GET`, `POST`, `OPTIONS` (CORS preflight)
**Story**: SMT-8, "Attempt a lesson or course quiz"

Lets an employee attempt a lesson quiz or an end-of-course assessment: start (or resume) an attempt, save answers question by question, read the attempt back, and submit it for scoring. Once submitted, an attempt is locked.

`is_correct` is never returned by any action.

## What the feature does (user view)

1. The employee starts a quiz for a lesson or an optional end-of-course assessment from the My Trainings area of the frontend.
2. Each question is shown one at a time, with its answer options. Single Choice questions use radio buttons, Multiple Choice questions use checkboxes.
3. The employee moves with **Previous** and **Next**. Selected answers are kept when moving between questions, and they are restored if the attempt is reopened.
4. A palette of question numbers shows the current, answered and unanswered questions. Clicking a number jumps to that question.
5. **Submit** (on the last question) saves any changed answers, scores the attempt and shows the score, percentage and Pass/Fail result.

## Employee identification

Every request identifies the employee by **`email`** or **`employeeId`** (`employeeId` wins if both are sent). The employee must own the attempt, otherwise `403`.

## POST – actions

Body is JSON with an `action` of `start`, `save` or `submit`.

### start

```json
{ "action": "start", "email": "a@b.com", "quizId": 3 }
```
or
```json
{ "action": "start", "email": "a@b.com", "moduleId": 12, "quizType": "Lesson" }
```

`quizType` is `Lesson` or `Course Assessment`. With `moduleId` + `quizType` the first active matching quiz is used.

Creates an `In Progress` attempt, or returns the employee's existing open attempt for that quiz (`resumed: true`, status `200`; new attempt is `201`). Inactive quizzes are rejected (`409`).

Response:
```json
{
  "resumed": false,
  "attempt": { "attemptId": 7, "quizId": 3, "employeeId": 1, "status": "In Progress",
               "startedAt": "2026-01-01T10:00:00", "submittedAt": null,
               "score": null, "maxScore": null, "percentage": null, "passed": null },
  "quiz": { "quizId": 3, "moduleId": 12, "title": "...", "description": null,
            "quizType": "Lesson", "passPercentage": 60.0 },
  "questions": [
    { "questionId": 10, "questionText": "...", "questionType": "Single Choice",
      "marks": 1.0, "displayOrder": 1,
      "options": [ { "optionId": 100, "optionText": "...", "displayOrder": 1 } ] }
  ],
  "answers": [ { "questionId": 10, "optionIds": [100] } ]
}
```

`answers` holds any answers already saved (used to restore selections and the palette's answered/unanswered state).

### save

```json
{ "action": "save", "email": "a@b.com", "attemptId": 7, "questionId": 10, "optionIds": [100] }
```

Replaces the previously saved answers for that question. An empty `optionIds` clears the answer. A Single Choice question accepts at most one option. A question that is not part of the attempt's quiz, or an option that does not belong to the question, returns `400`. A submitted attempt returns `409`.

Response: `{ "message": "Answers saved", "attemptId": 7, "questionId": 10, "optionIds": [100], "answers": [...] }`

### submit

```json
{ "action": "submit", "email": "a@b.com", "attemptId": 7 }
```

Scores the attempt, stores the result and locks it.

Scoring: a question's marks are awarded only when the selected options exactly equal the set of correct options (all-or-nothing, also for Multiple Choice). Unanswered questions score 0. `percentage = score / maxScore * 100` (2 decimals). The attempt passes when `percentage >= pass_percentage`.

Response:
```json
{
  "message": "Attempt submitted",
  "attempt": { "...": "same shape as above, status Submitted" },
  "score": 2.0, "maxScore": 3.0, "percentage": 66.67,
  "passPercentage": 60.0, "passed": true, "result": "Pass"
}
```

## GET – read an attempt

`GET ?attempt_id=7&email=a@b.com` (or `employeeId=1`)

Returns `attempt`, `quiz`, `questions` and `answers` (same shapes as start, without `resumed`). For a submitted attempt, the score fields are filled.

## Errors

| Status | Cause |
|--------|-------|
| 400 | Missing/invalid field, bad action, question/option mismatch, quiz without questions on submit |
| 403 | Attempt belongs to another employee |
| 404 | Employee, quiz or attempt not found |
| 405 | Method not allowed |
| 409 | Attempt already submitted/locked, or quiz inactive |
| 500 | Database or unexpected error |

Body: `{ "error": "<message>" }`.

## Files involved

**Backend**

- `backend/quiz/attemptQuiz_v2/main.py` – the function: request routing, start/save/submit/get logic, scoring (`calculate_score`) and error mapping.
- `backend/quiz/attemptQuiz_v2/requirements.txt` – Python dependencies of the function.
- `backend/quiz/tests/test_quiz_attempt_quiz.py` – unit tests for the function's helpers, start/save/submit logic, and the HTTP entry point (mocked database).
- `backend/quiz/tests/test_quiz_attempt_flow.py` – flow tests of start → save → navigate → submit against an in-memory fake connection.

**Frontend** (`frontend/`)

- `frontend/src/helper/quizAttemptApi.js` – the only place that calls the function (`startQuizAttempt`, `saveQuizAnswer`, `submitQuizAttempt`).
- `frontend/src/features/training/quiz/hooks/useQuizAttempt.js` – loads or resumes the attempt, holds answers and the current question, saves changed answers and submits.
- `frontend/src/features/training/quiz/services/quizAnswers.js` – pure helpers for the answers map (toggle, restore, unsaved questions).
- `frontend/src/features/training/quiz/services/quizPaletteState.js` – pure helpers that give each palette item its state (current, answered, unanswered) and accessible label.
- `frontend/src/features/training/quiz/components/QuizPlayer.jsx` – the quiz screen: question, options, Previous/Next/Submit, loading and error states, result view.
- `frontend/src/features/training/quiz/components/QuizPalette.jsx` – the question-number palette; clicking a number jumps to that question.
- `frontend/src/features/training/quiz/index.js` – exports `QuizPlayer` for other features.
- `frontend/src/features/training/my-trainings/components/EmployeeTrainingPanel.jsx` – launch point: accepts an optional `initialQuiz` prop (`{ quizId }` or `{ moduleId, quizType }`). When set it shows `QuizPlayer` in place of the list, and closing (`onExit`) returns to My Trainings.
- `frontend/src/features/training/README.md` – the training feature's notes, including a Quiz section.
- `frontend/vite.config.js` – dev proxy entry `attempt_quiz_v2` → port 8112.
- `frontend/BACKEND_PORTS.md` – lists `attempt_quiz_v2` on port 8112.

**Scripts** (`scripts/dev/`)

- `scripts/dev/start-all-backend.ps1` and `scripts/dev/start-all-backend.sh` – start `attempt_quiz_v2` on port 8112 with the other backend functions.

**Database** – the tables used are described in `database/README.md` (`quiz`, `quiz_question`, `quiz_option`, `quiz_attempt`, `quiz_attempt_answer`, and the enums `quiz_type_enum`, `quiz_question_type_enum`, `quiz_attempt_status_enum`). This feature does not change the schema.

## How it works (frontend flow)

1. `QuizPlayer` reads the signed-in user's email and passes it, with `quizId` or `moduleId` + `quizType`, to `useQuizAttempt`.
2. The hook calls `start`. Questions are sorted by `displayOrder`. Saved answers from the response are loaded into the answers map, so a resumed attempt shows previous selections.
3. Selecting an option updates the answers map only in the browser. Single Choice replaces the selection; Multiple Choice toggles the option.
4. **Previous / Next** and palette clicks change only the current question index. No request is sent when moving.
5. **Submit** (last question) first calls `save` for every question whose answer differs from the saved one, then calls `submit`. A `useSubmitGuard` lock stops a second submit while one is in progress.
6. If a save or submit fails, the error is shown and the questions and answers stay on screen, so the employee can try again. Load errors are kept separate from submit errors.
7. After a successful submit, the result view shows the score, percentage and pass/fail outcome.

The palette item states are: `current` (the open question), `answered` (at least one option selected) and `unanswered`. The accessible label reads, for example, "Question 3, answered" or "Question 2, unanswered, current".

## Configuration

The function reads `DB_USER`, `DB_PASS`, `DB_NAME`, `DB_HOST`, `DB_PORT` and `DB_SCHEMA` from the environment. For local runs, it also loads a local environment file from the `backend` folder if one exists; that file is not part of the repository. Deployed functions use the environment variables set at deploy time. Do not commit credentials.

## Local run

Backend (single function):

```
cd backend/quiz/attemptQuiz_v2
functions-framework --target=attempt_quiz_v2 --source main.py --debug --port=8112
```

Backend (all functions): run `scripts/dev/start-all-backend.ps1` (PowerShell) or `scripts/dev/start-all-backend.sh`.

Frontend: `cd frontend && npm run dev`. The dev proxy forwards `/attempt_quiz_v2` to `http://localhost:8112`.

To open a quiz from code, render the training panel with an `initialQuiz` prop, for example `{ quizId: 3 }` or `{ moduleId: 12, quizType: "Lesson" }`.

## Testing

Backend tests (run from the project folder, one file at a time):

```
python -m pytest backend/quiz/tests/test_quiz_attempt_quiz.py -q
python -m pytest backend/quiz/tests/test_quiz_attempt_flow.py -q
```

The tests use fakes and mocks; they do not need a database, network or credentials.

Frontend (no automated tests in this project). Check by hand:

1. Start the backend on port 8112 and the frontend with `npm run dev`.
2. Sign in, open My Trainings and open a quiz with `initialQuiz`. The first question and its options appear.
3. Select answers, move with Previous/Next, and confirm the selections are still there.
4. Click palette numbers and confirm the jump and the current/answered/unanswered styling.
5. Reload and open the same quiz again. Confirm the saved answers come back and the attempt is resumed.
6. Submit on the last question. Confirm the result view shows the score, percentage and Pass/Fail. Confirm a second Submit does nothing.
