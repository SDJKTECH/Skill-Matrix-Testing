# Orchestrator: Jira Story Workflow Plan

Written against the real layout of this repository (`orchestrator/app/…`, FastAPI + SQLAlchemy/SQLite, agents in `.claude/agents/`). Base branch for everything: `development`. `main` is not used.

## Goal
A run starts from one Jira story (for example SMT-9). The story's sub-tasks become the tasks. The orchestrator checks the project, a read-only planner orders the sub-tasks, each sub-task runs in its own worktree, everything lands on the story branch, and a documenter writes the feature doc.

- **What changes:** the trigger (a story key, not a JQL sweep), the planner's job (check and order the sub-tasks, not create them), where project context comes from (the project's own `CLAUDE.md`), pre-run checks, and a documentation stage.
- **What stays:** worktrees, builder → tester → gate → reviewer, retry, budget, the story branch and its single PR, Jira status and comment updates, the dashboard, and the SQLite database.
- **GitHub-issue and plain-Jira polling keep working.** The story run is an add-on.

## What already exists (do not rebuild)
| Need | Already there |
|---|---|
| Read Jira issues, Story and Epic above them | `jira/client.py`, `jira/source.py`, `jira/context.py` (`describe_hierarchy`), `jira_items` table |
| One worktree and branch per task | `vcs/git_manager.py`, `services/task_service.py` (`agent/task-N`) |
| Tasks merge into a story branch; one PR per Story | `jira/stories.py` (`agent/story-<key>`) |
| Dependencies and blocking | `planning/dependencies.py`, `planning/planner.py`, `.claude/agents/planner.md` |
| Builder, tester, reviewer, fix loop, budget | `pipeline/pipeline_service.py`, `agents/` |
| Records | SQLite: `projects`, `milestones`, `tasks`, `agent_runs`, `verification_results`, `jira_items` |
| Jira status, comments, links | `jira/tracker.py`, `jira/progress.py`, `jira/columns.py` |
| Per-project config | `core/project_config.py` + `projects/<name>/orchestrator.config.toml` |

## The new workflow
One story is one run. Each sub-task gets its own worktree and its own builder, tester and reviewer.

1. **A person writes the project's `CLAUDE.md`** once, inside `projects/<name>/`: Purpose, Project structure (including the docs folder), Commands (test, lint, run), Rules, Docs.
2. **A person starts a run** with a story key, for example `POST /stories/SMT-9/run` or `python demo/run_live.py --project skill-matrix-v2 --story SMT-9`.
3. **The orchestrator reads Jira:** the story, its epic, and every sub-task with key, description, acceptance criteria, labels, priority, status and links.
4. **The orchestrator checks the basics:** `CLAUDE.md` is complete, `docs_dir` exists, the story has sub-tasks, every sub-task has acceptance criteria, and the project's test command passes on the base branch.
5. **The story sequencer reads the context in this order:** the project's `CLAUDE.md`, then the docs folder, then only the files the docs point to. It is read-only.
   - It checks the sub-tasks against the code.
   - It finds dependencies and marks what can run in parallel.
   - It sets each sub-task's size and the files it will touch.
   - It names the doc to update, or the new doc to write.
6. **The orchestrator validates the planner's output** and saves it in the database (and as a JSON export).
7. **The run starts the sub-tasks.** Each gets its own worktree, then builder, tester, gate and reviewer, as today.
8. **Each passed sub-task is merged into the story branch** `agent/story-<key>` as soon as it passes. A dependent sub-task starts only after the sub-tasks it needs are merged.
9. **The documenter writes the feature doc** on the story branch, in `docs_dir`, after the last sub-task is merged and before the Story PR is opened.
10. **Everything is recorded** in the database (tasks, agent runs, checks, concerns) and shown on the dashboard.
11. **A person reviews the Story PR** (code and doc together) and merges it into `development`.

## Before we start (Step 0)
Work happens on a new branch in a separate folder. The current work stays as it is.

1. `development` is already pushed. Check `git status` is clean.
2. Create the new branch in its own folder:
   `git worktree add ..\skill-matrix-jira-stories -b feature/jira-stories development`
3. In the new folder create a new `venv` and install `requirements.txt`.
4. Copy `.env` into the new folder (it is git-ignored). Use a different `DATABASE_URL` (for example `sqlite:///./jira-stories.db`) so the old database is not touched.

**Why:** the old folder, branch and database stay untouched. A separate venv makes sure tests run the new code. PRs from this branch go to `development`.

## Changes, step by step
Each step is finished and tested before the next one starts. Tests go in `orchestrator/tests/…` mirroring the app layout. Lint with `python -m ruff check` and `ruff format`.

### Step 1: Project `CLAUDE.md` format and per-project commands
- **Change:** define the sections every project's `CLAUDE.md` must have: Purpose, Project structure (including the docs folder), Commands (test, lint, run), Rules, Docs (where feature docs live and their format). Written by hand for `projects/skill-matrix-v2/CLAUDE.md` first.
- **Change:** add keys to the project config: `docs_dir` (for example `docs`), `test_command`, `lint_command`. They are plain data in `orchestrator.config.toml`, so the orchestrator's checks read them as data, not from prose.
- **Files:** `projects/skill-matrix-v2/CLAUDE.md`, `projects/skill-matrix-v2/orchestrator.config.toml`, `projects/_template/orchestrator.config.toml`, `core/project_config.py` (add the keys to `ALLOWED_KEYS`), `core/config.py` (matching settings), a new `core/project_context.py` (the section check), and `verification/runner.py` (run `test_command` / `lint_command` in the project folder instead of the orchestrator's own pytest and ruff).
- **Why:** every agent reads `CLAUDE.md` automatically, so it is the one place for project context. This also fixes today's gap where the verification gate checks the orchestrator, not the project.
- **Done when:** the check passes on a correct `CLAUDE.md` and lists the missing sections on a wrong one; the gate runs the project's own commands; existing verification tests still pass.

### Step 2: Read the story from Jira
- **Change:** read a story, its epic, its sub-tasks (key, summary, description, labels, priority, status) and issue links. Parse acceptance criteria from the description. `adf_to_text` already converts Jira's format to text.
- **Files:** `jira/client.py` (search by `parent`, fetch the extra fields), a new `jira/story.py` (the `StoryBundle` of story, epic and sub-tasks), `jira/models.py` only if new columns are needed.
- **Why:** today the client reads only what the poller needs.
- **Done when:** tests with saved Jira answers return the story and sub-tasks correctly. Nothing is written to Jira.

### Step 3: Database additions for story runs
- **Change:** add what a story run needs to the existing SQLite database. The database is the source of truth here (not run files).
  - New table `story_runs`: story key, base branch, status, plan (JSON), total cost, started/finished.
  - New table `plan_concerns`: run id, task id, text.
  - New columns on `tasks`: `story_run_id`, `files` (JSON), `complexity`, `parallel_safe`, `expected_outcome`, `context_notes`.
- **Files:** `db/models.py`, `db/migrations.py` (add the columns to existing databases, same style as `migrate_usage_columns`), tests in `orchestrator/tests/db/`.
- **Why:** branches and merging already work with Jira keys (`agent/story-<key>`), so no rename is needed. Task ids stay integers, so the dashboard and board sync need no change.
- **Done when:** a fresh and an existing database both open; existing GitHub and Jira runs behave as before.

### Step 4: Checks before planning
- **Change:** before any agent runs, check:
  - `CLAUDE.md` has every section.
  - `docs_dir` exists and `CLAUDE.md` mentions it.
  - The story has sub-tasks.
  - Every sub-task has acceptance criteria.
  - `test_command` passes on the base branch (run in a temporary worktree of `development`).
- **Files:** a new `planning/story_checks.py`.
- **Why:** if the tests already fail on the base branch, every tester fails and the retries are wasted. These checks cost nothing.
- **Done when:** each failed check stops the run with a clear message, before any agent is called.

### Step 5: Story sequencer (planner)
- **Change:** a new read-only agent. The existing `story-planner` creates Epics and Stories from requirements and the existing `planner` finds dependencies, so the new one is named `story-sequencer` to avoid a clash.
  - **Input:** the story, the epic, all sub-tasks, the file list (`git ls-files` inside the project folder) and the project's `CLAUDE.md`.
  - **Search order:** `CLAUDE.md`, then the docs folder, then only the files the docs point to. The file list helps it find files the docs do not mention.
  - **Output for each sub-task:** files, depends_on, parallel_safe, complexity, verification, expected_outcome, context_notes and concerns.
  - **Output for the story:** `doc_target`, the doc to update or the path of a new doc.
  - **Rule:** it may not add, drop, merge or split sub-tasks, or change their acceptance criteria. Problems go into concerns.
- **Files:** `.claude/agents/story-sequencer.md` (model and effort in the frontmatter, `tools: Read, Grep, Glob`), `planning/story_planner.py` (build the prompt, run it through `ModelRouter`, parse and validate), a new `api/story_routes.py` (`POST /stories/{key}/plan`, `/run`), and `demo/run_live.py --story`.
- **Why:** Jira has no files or sizes. Without them every sub-task runs one at a time with default limits. The rule keeps the plan and Jira one to one.
- **Done when:** the validator rejects a plan whose tasks differ from Jira's sub-tasks or that names files not in the file list, and cycle and parallel-safety checks (reuse `planning/dependencies.py`) still apply.

### Step 6: Run the sub-tasks
- **Change:** the story run imports the sub-tasks as tasks (reusing `jira/importer.py` and `task_service.create_task`, now with `base_branch` set), writes the plan's fields onto them, applies `depends_on` as blocking, and hands them to the existing scheduler. When a story run owns a story, the JQL poller skips its sub-tasks.
- **Files:** `jira/importer.py`, `jira/poller.py` (skip sub-tasks of a story run), a new `jira/story_run.py`, `agents/` job scheduling as it is.
- **Why:** reuse what works; only the trigger and ordering change.
- **Done when:** a story run creates one worktree per sub-task, respects `depends_on`, and plain polling is unaffected.

### Step 7: Context for the agents
- **Change:** add the story's business context and the task's `context_notes`, `files` and `expected_outcome` to each agent's task prompt. `describe_hierarchy` already adds the parents.
- **Files:** `pipeline/pipeline_service.py` (`_build_prompt`), `jira/context.py`, and the agent instructions in `.claude/agents/builder.md`, `tester.md`, `reviewer.md` if they need a line about the new fields.
- **Why:** the builder then knows why the sub-task exists, not only what to do.
- **Done when:** prompt tests in `tests/jira/test_context.py` and `tests/pipeline/` are updated and pass.

### Step 8: Documentation stage
- **Change:** a new `documenter` agent, run once per story after the last sub-task is merged into the story branch, before the Story PR opens.
  - It runs in the story branch worktree and reads the story, its sub-tasks, the full change against the base, `CLAUDE.md`'s Docs section and one or two existing docs as examples.
  - It updates `doc_target`, or writes the new doc in the same format.
  - The orchestrator checks that only files inside `docs_dir` changed and that every file path the doc names exists (reuse the `FolderRule`-style check from `pipeline/project_folder.py`).
  - It is committed on the story branch. One retry. A second failure marks the story "needs review" for the doc only; the code stays merged.
  - No tests are needed since it changes no code. A smaller model is enough (set in its frontmatter, for example `model: haiku`).
- **Files:** `.claude/agents/documenter.md`, `jira/stories.py` (new stage before the Story PR), `pipeline/project_folder.py` (a docs-only rule), `agents/agent_service.py` only if the stage needs a role flag.
- **Why once per story:** a feature is a story. Docs written per sub-task would be fragments, and parallel sub-tasks would edit the same doc and conflict when merged.
- **Done when:** after a story run the doc is on the story branch, and a doc change outside `docs_dir` is refused.

### Step 9: Run a real story
- **Change:** no code. Run one real story on `skill-matrix-v2` from start to end, with `MAX_TASK_COST_USD` set.
- **Why:** a change is accepted only with evidence from a real run.
- **Done when:** the sub-tasks are merged into the story branch, the feature doc is written, the Story PR targets `development`, the database and Jira agree, and the cost is noted.

## What stays the same
- One worktree and branch per task. Each task merges into the story branch as soon as it passes; dependent tasks start only after what they need is merged.
- Builder, tester and reviewer for every task, plus the gate and its fix loop.
- Parallel tasks (`MAX_CONCURRENT_AGENTS`), fix attempts (`MAX_FIX_ATTEMPTS`), budget (`MAX_TASK_COST_USD`), pause/resume/cancel.
- Task and agent-run records, verification results and the dashboard.
- GitHub intake, GitHub Projects boards and plain Jira polling.
- Model and effort come from `.claude/agents/<role>.md` (see `agents/model_router.py`).

## Rules we follow
- **The sequencer orders, it does not re-plan.** Jira's sub-tasks are taken as they are; problems are reported, not fixed silently.
- **The database is the source of truth.** Any JSON export is generated from it.
- **The orchestrator checks facts itself.** It does not trust an agent's report alone.
- **Jira writes stay as they are today** (status moves, progress comments, blocking links). Steps 2 to 8 add no new kinds of Jira writes.
- **A person merges.** Agents never push or merge to `development`. PRs target `development`.
- **`main` is not used for now.**
- **One step at a time.** Each step is accepted with its tests before the next starts.

## Later, not now
- **Write story-level results back to Jira** (labels, a summary comment on the story). A story or epic is never moved backwards.
- **`CLAUDE.md` template generator** for a new project (`projects/_template/`).
- **Dashboard view per story run:** cost per story, failures per agent role.
- **One command** from story key to finished Story PR.

## Order of work
| Step | What | Needs first |
|---|---|---|
| 0 | New branch `feature/jira-stories` in its own folder | `development` clean |
| 1 | `CLAUDE.md` format, per-project commands, check, project-aware gate | Step 0 |
| 2 | Read story and sub-tasks from Jira | Step 0 |
| 3 | Database additions for story runs | Step 0 |
| 4 | Checks before planning | Steps 1 and 2 |
| 5 | Story sequencer | Steps 2, 3 and 4 |
| 6 | Run the sub-tasks | Steps 3 and 5 |
| 7 | Context for the agents | Step 5 |
| 8 | Documentation stage | Steps 1 and 6 |
| 9 | Run a real story | Steps 1 to 8 |

## Open decisions
1. **Trigger:** the plan adds an explicit story-key trigger and makes polling skip a story's sub-tasks. Recommended. The alternative is to keep polling and apply the new checks to every Story it finds.
2. **Jira writes:** keep today's status and comment updates (recommended), or make story runs read-only.
3. **Test command location:** `test_command` runs in a temporary worktree of `development`. The project's dependencies for skill-matrix-v2 must be installed for it to pass.
