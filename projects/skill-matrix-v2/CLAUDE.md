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

Do not invent commands. If a task needs tests, add them next to the code they cover and say how to run them in your report.

## Rules

1. Inspect the relevant files before changing anything; follow the existing structure and naming.
2. Keep changes focused on the assigned task and inside `projects/skill-matrix-v2/`.
3. Do not edit `database/` schema files unless the task is about the schema.
4. Never commit secrets, keys, tokens or `.env` files. A service-account key was found committed upstream and was deliberately left out of this copy; do not recreate it.
5. Do not commit, push or rewrite Git history; the orchestrator does that.
6. Report changed files, key decisions, what was run, and remaining risks. Do not claim anything passed that was not run.

## Docs

Feature and API docs live in `docs/<area>/`, one Markdown file per function or feature, for example `docs/employee/saveEmployee_v2.md`. Each doc describes what the function does, its request and response, and its behaviour. Update the existing doc for a feature when its behaviour changes; add a new file in the matching area folder for a new feature, following the style of its neighbours. Do not put docs outside `docs/`.
