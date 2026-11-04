# skill-matrix-v2 — Claude Code Instructions

## Purpose

Version 2 of an employee skill tracking and management system, with review workflows for organizational resource planning. It has a React/Vite frontend and a set of Python backend modules (employees, skills, certificates, reports, aggregations, GenAI, webhooks) backed by a SQL database.

## Project structure

```
backend/        Python backend modules, one folder per area
                (employee, skills, certificates, reports, aggregations, genai,
                 data, common, utils, webhook_consumer_v2)
frontend/       React + Vite app (src/, server.mjs, tailwind, eslint config)
database/       SQL schema and ER diagrams (dev-only files, see BRANCH_MANAGEMENT.md)
docs/           Feature and API docs, one folder per backend area
                (docs/employee, docs/skills, docs/development, docs/deployment, ...)
scripts/        dev/ and test/ helper scripts (dev-only)
postman/        API collections
dev-tools/      ad-hoc tooling and docs
```

Paths are relative to `projects/skill-matrix-v2/`. The docs folder is `docs/`.

## Commands

- Frontend dev server: `cd frontend && npm run dev`
- Frontend build: `cd frontend && npm run build`
- Frontend start (production server): `cd frontend && npm start`
- Backend: each module under `backend/` is its own unit; `backend/webhook_consumer_v2/` has its own `requirements.txt`.
- **Test:** no automated test command is defined yet.
- **Lint:** no lint script is defined yet (`frontend/eslint.config.js` exists but is not wired to an npm script).

Do not invent commands. Tests for new work follow the "Tests" section below.

## Tests

The project has no existing tests and no test setup. The tester agent adds tests only for the work of the current task, in these places:

- **Backend (Python):** one pytest file per feature at `backend/<area>/tests/test_<area>_<feature>.py`, for example `backend/skills/tests/test_skills_quiz_scoring.py`. The file name must start with `test_`; the orchestrator's checks run only new or changed files named `test_*.py` or `*_test.py`. Keep the `<area>_` part in the name so two areas never share a file name. Create the `tests` folder if it is missing; no `__init__.py` is needed.
- **Isolation:** tests must not need a real database, network, service account or any credential. Replace those with fakes or mocks (`unittest.mock`). Import only what the code under test needs, so a missing backend library does not break the test.
- **Frontend (React):** do not add tests. No test framework is installed, so do not add jest, vitest or any package, and do not edit `package.json`. The reviewer checks frontend code by reading it; say in your report how to check it by hand.
- **Running tests:** run only the test files you added or changed, from the project folder, for example `python -m pytest backend/skills/tests/test_skills_quiz_scoring.py -q`. Never run the whole project or tests that existed before your task.
- **Scope:** tests only; never change application code to make a test pass. If the code looks wrong, say so in your report.
- **Report:** list each test file you added, what it covers, the exact command you ran and its real result.

## Rules

1. Inspect the relevant files before changing anything; follow the existing structure and naming.
2. Keep changes focused on the assigned task and inside `projects/skill-matrix-v2/`.
3. Do not edit `database/` schema files unless the task is about the schema.
4. Never commit secrets, keys, tokens or `.env` files. A service-account key was found committed upstream and was deliberately left out of this copy; do not recreate it.
5. Do not commit, push or rewrite Git history; the orchestrator does that.
6. Report changed files, key decisions, what was run, and remaining risks. Do not claim anything passed that was not run.

## Docs

Feature and API docs live in `docs/<area>/`, one Markdown file per function or feature, for example `docs/employee/saveEmployee_v2.md`. Each doc describes what the function does, its request and response, and its behaviour. Update the existing doc for a feature when its behaviour changes; add a new file in the matching area folder for a new feature, following the style of its neighbours. Do not put docs outside `docs/`.
