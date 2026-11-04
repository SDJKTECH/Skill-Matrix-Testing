# Plans one Jira Story end to end and saves the result as a story run:
# read the story, run the pre-run checks, run the sequencer, save plan and concerns.
# Used by the HTTP endpoint and by demo/plan_story.py. Writes nothing to Jira.
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from orchestrator.app.core.config import Settings
from orchestrator.app.core.exceptions import PlanningError
from orchestrator.app.db.models import PlanConcern, Project, StoryRun
from orchestrator.app.jira.client import JiraApi
from orchestrator.app.jira.story import read_story
from orchestrator.app.planning.story_checks import ensure_story_ready
from orchestrator.app.planning.story_planner import StoryPlan, StorySequencer


def plan_story(
    session: Session,
    settings: Settings,
    api: JiraApi,
    sequencer: StorySequencer,
    story_key: str,
) -> tuple[StoryRun, StoryPlan]:
    """Check and plan a Story; save it as a "planned" story run.

    Raises PlanningError when the project is not set up, a check fails or the
    sequencer's plan is rejected (nothing is saved then), and IssueSourceError when
    Jira cannot be read.
    """
    if settings.repository_path is None or not settings.project_subdir:
        raise PlanningError(
            "Set REPOSITORY_PATH and PROJECT (or --project) to plan a story."
        )

    folder = Path(settings.repository_path) / settings.project_subdir
    bundle = read_story(api, story_key)
    ensure_story_ready(folder, settings.docs_dir, bundle)
    plan = sequencer.plan(bundle, folder, settings.docs_dir or "")

    project_id = session.scalar(
        select(Project.id).where(Project.local_path == str(settings.repository_path))
    )
    run = StoryRun(
        story_key=bundle.story.key,
        project_id=project_id,
        base_branch=settings.base_branch,
        status="planned",
        plan=plan.to_json(),
        doc_target=plan.doc_target,
    )
    session.add(run)
    session.flush()

    for text in plan.concerns:
        session.add(PlanConcern(story_run_id=run.id, text=text))
    for task in plan.tasks:
        for text in task.concerns:
            session.add(PlanConcern(story_run_id=run.id, text=f"{task.key}: {text}"))

    session.commit()
    return run, plan
