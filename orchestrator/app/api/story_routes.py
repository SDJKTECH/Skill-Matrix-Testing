# HTTP endpoint that plans a Jira Story: reads it from Jira, runs the pre-run checks,
# asks the story sequencer to order the sub-tasks and saves the plan as a story run.
# It writes nothing to Jira and starts no builder.
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from orchestrator.app.core.config import Settings, get_settings
from orchestrator.app.core.exceptions import (
    IssueSourceError,
    PlanningError,
    RepositoryError,
)
from orchestrator.app.db.database import get_db
from orchestrator.app.jira.client import JiraApi, make_jira_api
from orchestrator.app.jira.story_run import latest_planned_run, start_story_run
from orchestrator.app.planning.dependencies import get_blockers
from orchestrator.app.planning.story_planner import StorySequencer
from orchestrator.app.planning.story_service import plan_story

logger = logging.getLogger(__name__)

router = APIRouter(tags=["stories"])


class StoryTaskResponse(BaseModel):
    """The plan for one sub-task."""

    key: str
    files: list[str]
    new_files: list[str]
    depends_on: list[str]
    parallel_safe: bool
    complexity: str
    verification: str
    expected_outcome: str
    context_notes: str
    concerns: list[str]


class StoryPlanResponse(BaseModel):
    """A saved story run: the validated plan and what the planner worried about."""

    run_id: int
    story_key: str
    status: str
    base_branch: str
    doc_target: str
    concerns: list[str]
    tasks: list[StoryTaskResponse]


def get_story_settings() -> Settings:
    """Dependency that returns the settings."""
    return get_settings()


def get_story_jira_api(settings: Settings = Depends(get_story_settings)) -> JiraApi:
    """Dependency that builds the Jira client."""
    try:
        return make_jira_api(settings)
    except IssueSourceError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc


def get_sequencer(settings: Settings = Depends(get_story_settings)) -> StorySequencer:
    """Dependency that builds the story sequencer."""
    return StorySequencer(settings)


@router.post("/stories/{story_key}/plan", response_model=StoryPlanResponse)
def plan_story_endpoint(
    story_key: str,
    session: Session = Depends(get_db),
    settings: Settings = Depends(get_story_settings),
    api: JiraApi = Depends(get_story_jira_api),
    sequencer: StorySequencer = Depends(get_sequencer),
) -> StoryPlanResponse:
    """Check and plan a Jira Story; save the plan as a story run (nothing runs yet)."""
    if settings.repository_path is None or not settings.project_subdir:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Set REPOSITORY_PATH and PROJECT (or --project) to plan a story.",
        )

    try:
        run, plan = plan_story(session, settings, api, sequencer, story_key)
    except IssueSourceError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)
        ) from exc
    except PlanningError as exc:
        logger.warning("Story %s could not be planned: %s", story_key, exc)
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return StoryPlanResponse(
        run_id=run.id,
        story_key=plan.story_key,
        status=run.status,
        base_branch=run.base_branch,
        doc_target=plan.doc_target,
        concerns=plan.concerns,
        tasks=[StoryTaskResponse(**task.__dict__) for task in plan.tasks],
    )


class StartedTaskResponse(BaseModel):
    """A task created for a sub-task."""

    key: str
    task_id: int
    status: str
    blocked_by: list[int]


class StoryRunResponse(BaseModel):
    """A started story run and the tasks it created."""

    run_id: int
    story_key: str
    status: str
    tasks: list[StartedTaskResponse]
    failed: dict[str, str]


@router.post("/stories/{story_key}/run", response_model=StoryRunResponse)
def run_story_endpoint(
    story_key: str,
    session: Session = Depends(get_db),
    settings: Settings = Depends(get_story_settings),
    api: JiraApi = Depends(get_story_jira_api),
) -> StoryRunResponse:
    """Start the latest planned run of a Story: create one task per sub-task.

    The polling orchestrator then schedules the queued tasks; blocked ones wait.
    """
    run = latest_planned_run(session, story_key)

    if run is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No planned run for {story_key}. POST /stories/{story_key}/plan.",
        )

    try:
        started = start_story_run(session, settings, api, run)
    except IssueSourceError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)
        ) from exc
    except (PlanningError, RepositoryError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return StoryRunResponse(
        run_id=run.id,
        story_key=run.story_key,
        status=run.status,
        tasks=[
            StartedTaskResponse(
                key=task.jira_key or "",
                task_id=task.id,
                status=task.status.value,
                blocked_by=[entry["task_id"] for entry in get_blockers(task)],
            )
            for task in started.tasks
        ],
        failed=started.failed,
    )
