# Starts a planned story run: imports the Story's sub-tasks as orchestrator tasks
# (one worktree each, cut from the base branch), writes the plan's details onto them
# and makes them wait for what they depend on. The normal poller then schedules the
# queued tasks; nothing here talks to Jira except reading the Story again.
import json
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from orchestrator.app.core.config import Settings, worktrees_root
from orchestrator.app.core.exceptions import PlanningError
from orchestrator.app.db.models import StoryRun, Task
from orchestrator.app.jira.client import JiraApi
from orchestrator.app.jira.creator import creation_lock
from orchestrator.app.jira.importer import (
    ensure_repository_milestone,
    sync_jira_items,
)
from orchestrator.app.jira.source import JiraRecord, JiraWorkItem
from orchestrator.app.jira.story import StoryBundle, read_story
from orchestrator.app.planning.dependencies import assign_blockers
from orchestrator.app.planning.planner import Dependency

PLAN_REASON = "ordered by the story plan"


@dataclass
class StoryRunStart:
    """What starting a story run created."""

    run: StoryRun
    tasks: list[Task] = field(default_factory=list)
    failed: dict[str, str] = field(default_factory=dict)


class _BundleSource:
    """The Story's sub-tasks as work items, for the normal Jira importer."""

    def __init__(self, items: list[JiraWorkItem]) -> None:
        self.items = items

    def list_items(self) -> list[JiraWorkItem]:
        return self.items


def work_items(bundle: StoryBundle) -> list[JiraWorkItem]:
    """One work item per sub-task, with the Story and Epic above it."""
    ancestors = [bundle.epic] if bundle.epic else []
    story = bundle.story
    ancestors.append(
        JiraRecord(
            key=story.key,
            type=story.type or "Story",
            summary=story.summary,
            description=story.description,
            status=story.status,
            parent_key=bundle.epic.key if bundle.epic else None,
        )
    )
    return [
        JiraWorkItem(
            record=JiraRecord(
                key=sub.key,
                type=sub.type or "Sub-task",
                summary=sub.summary,
                description=sub.description,
                status=sub.status,
                parent_key=story.key,
            ),
            ancestors=list(ancestors),
            url=sub.url,
            labels=list(sub.labels),
            blocked_by=list(sub.blocked_by),
        )
        for sub in bundle.sub_tasks
    ]


def latest_planned_run(session: Session, story_key: str) -> StoryRun | None:
    """The newest story run of this Story that is planned and not yet started."""
    return session.scalars(
        select(StoryRun)
        .where(StoryRun.story_key == story_key, StoryRun.status == "planned")
        .order_by(StoryRun.id.desc())
    ).first()


def start_story_run(
    session: Session, settings: Settings, api: JiraApi, run: StoryRun
) -> StoryRunStart:
    """Create the run's tasks from the saved plan; the run becomes "running".

    Raises PlanningError if the run is not planned, the Story's sub-tasks no longer
    match the plan, or a sub-task already has a task.
    """
    if run.status != "planned" or not run.plan:
        raise PlanningError(f"Story run {run.id} is {run.status}, not planned.")

    if settings.repository_path is None:
        raise PlanningError("No repository_path is configured.")

    plan = json.loads(run.plan)["tasks"]
    bundle = read_story(api, run.story_key)
    keys = [sub.key for sub in bundle.sub_tasks]

    if set(keys) != set(plan):
        raise PlanningError(
            f"The sub-tasks of {run.story_key} changed in Jira since the plan "
            f"(Jira: {sorted(keys)}, plan: {sorted(plan)}). Plan the story again."
        )

    # The poller schedules every queued task. Until the blockers below are recorded,
    # a waiting task would look runnable, so the poller is kept out until they are.
    with creation_lock:
        return _create_tasks(session, settings, run, bundle, plan, keys)


def _create_tasks(
    session: Session,
    settings: Settings,
    run: StoryRun,
    bundle: StoryBundle,
    plan: dict,
    keys: list[str],
) -> StoryRunStart:
    """Import the sub-tasks as tasks and make the waiting ones BLOCKED."""
    existing = session.scalars(select(Task.jira_key).where(Task.jira_key.in_(keys)))
    already = sorted(key for key in existing if key)
    if already:
        raise PlanningError(
            f"Already imported as tasks: {', '.join(already)}. Turn on STORY_MODE so "
            "the poller leaves a Story's sub-tasks to story runs."
        )

    repository = Path(str(settings.repository_path))
    milestone_id = ensure_repository_milestone(
        session, repository, settings.github_repo
    )
    result = sync_jira_items(
        session,
        milestone_id,
        _BundleSource(work_items(bundle)),
        worktrees_root(settings),
        base_branch=run.base_branch,
    )

    by_key = {task.jira_key: task for task in result.imported}
    explicit: dict[int, list[str]] = {}

    for sub in bundle.sub_tasks:
        task = by_key.get(sub.key)
        if task is None:
            continue

        details = plan[sub.key]
        task.story_run_id = run.id
        task.files = json.dumps(details.get("files", []) + details.get("new_files", []))
        task.complexity = details.get("complexity")
        task.parallel_safe = details.get("parallel_safe")
        task.expected_outcome = details.get("expected_outcome") or None
        task.context_notes = details.get("context_notes") or None
        explicit[task.id] = list(sub.blocked_by)

    inferred = {
        key: [Dependency(dep, PLAN_REASON) for dep in plan[key].get("depends_on", [])]
        for key in by_key
    }
    session.commit()
    assign_blockers(session, result.imported, inferred, explicit)

    run.status = "running"
    session.commit()
    return StoryRunStart(run=run, tasks=result.imported, failed=result.failed)
