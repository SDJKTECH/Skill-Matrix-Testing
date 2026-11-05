# attemptQuiz_v2 Function Documentation

## Overview

**Function Name**: `attempt_quiz_v2`
**Location**: `backend/quiz/attemptQuiz_v2/main.py`
**Port (Local Development)**: 8112
**Methods**: `GET`, `POST`, `OPTIONS` (CORS preflight)

Lets an employee attempt a lesson quiz or an end-of-course assessment: start (or resume) an attempt, save answers question by question, read the attempt back, and submit it for scoring. Once submitted, an attempt is locked.

`is_correct` is never returned by any action.

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

## Configuration

Reads `DB_USER`, `DB_PASS`, `DB_NAME`, `DB_HOST`, `DB_PORT` and `DB_SCHEMA` from the environment.

## Local run

```
cd backend/quiz/attemptQuiz_v2
functions-framework --target=attempt_quiz_v2 --source main.py --debug --port=8112
```

Frontend dev proxy: `/attempt_quiz_v2` → `http://localhost:8112`.
