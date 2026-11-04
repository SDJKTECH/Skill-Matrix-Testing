# Serves the dashboard page at GET /dashboard.
# Also serves its data at GET /dashboard/overview.
import threading
import time
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from orchestrator.app.core.config import Settings, get_settings
from orchestrator.app.core.exceptions import IssueSourceError
from orchestrator.app.dashboard.jira_stories import JiraStoryView, list_jira_stories
from orchestrator.app.dashboard.schemas import DashboardOverview, RunDetail
from orchestrator.app.dashboard.service import build_overview, run_detail
from orchestrator.app.db.database import get_db
from orchestrator.app.github.client import detect_github_repo
from orchestrator.app.jira.client import JiraApi, make_jira_api

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

PAGE = Path(__file__).with_name("index.html")


@lru_cache(maxsize=4)
def _detected_repo(repository_path: Path | None) -> str | None:
    """The GitHub repository (owner/name) of the local clone, if it can be found."""
    return detect_github_repo(repository_path)


@router.get("", response_class=HTMLResponse, include_in_schema=False)
def dashboard_page() -> HTMLResponse:
    """The single-page monitoring dashboard."""
    return HTMLResponse(PAGE.read_text(encoding="utf-8"))


JIRA_CACHE_SECONDS = 20
_jira_cache: dict[str, tuple[float, list[JiraStoryView]]] = {}
_jira_lock = threading.Lock()


def get_dashboard_jira_api(settings: Settings = Depends(get_settings)) -> JiraApi:
    """Dependency that builds the Jira client (503 when Jira is not configured)."""
    try:
        return make_jira_api(settings)
    except IssueSourceError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/jira-stories", response_model=list[JiraStoryView])
def dashboard_jira_stories(
    refresh: bool = False,
    settings: Settings = Depends(get_settings),
    api: JiraApi = Depends(get_dashboard_jira_api),
) -> list[JiraStoryView]:
    """The project's Jira Stories with their sub-tasks, for the Plan/Start buttons.

    Cached for a few seconds so the page can ask often; `refresh` skips the cache.
    """
    project = (
        settings.publisher_project
        if not settings.jira_project
        else (settings.jira_project)
    )

    with _jira_lock:
        cached = _jira_cache.get(project)

        if cached and not refresh and time.monotonic() - cached[0] < JIRA_CACHE_SECONDS:
            return cached[1]

        try:
            stories = list_jira_stories(api, project, settings.jira_story_type)
        except IssueSourceError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

        _jira_cache[project] = (time.monotonic(), stories)
        return stories


@router.get("/runs/{run_id}", response_model=RunDetail)
def dashboard_run(run_id: int, session: Session = Depends(get_db)) -> RunDetail:
    """One agent run in full, including the final message the agent reported."""
    detail = run_detail(session, run_id)

    if detail is None:
        raise HTTPException(status_code=404, detail="Agent run not found.")

    return detail


@router.get("/overview", response_model=DashboardOverview)
def dashboard_overview(session: Session = Depends(get_db)) -> DashboardOverview:
    """A snapshot of every task, agent, stage, check and cost for the dashboard."""
    settings = get_settings()
    repo = settings.github_repo or _detected_repo(settings.repository_path)

    return build_overview(
        session,
        repo=repo,
        max_concurrent_agents=settings.max_concurrent_agents,
        polling_enabled=settings.poll_interval_seconds > 0,
    )
