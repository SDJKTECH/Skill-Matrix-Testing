import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from orchestrator.app.core.config import Settings
from orchestrator.app.core.exceptions import IssueSourceError
from orchestrator.app.dashboard import routes
from orchestrator.app.dashboard.jira_stories import list_jira_stories
from orchestrator.app.dashboard.routes import get_dashboard_jira_api
from orchestrator.app.dashboard.routes import router as dashboard_router


def doc(text: str) -> dict:
    return {
        "type": "doc",
        "content": [{"type": "paragraph", "content": [{"type": "text", "text": text}]}],
    }


def issue(key, summary, parent=None, text="", status="To Do", parent_summary=None):
    parent_field = None
    if parent:
        parent_field = {"key": parent, "fields": {"summary": parent_summary}}
    return {
        "key": key,
        "fields": {
            "summary": summary,
            "status": {"name": status},
            "parent": parent_field,
            "description": doc(text) if text else None,
        },
    }


class FakeApi:
    def __init__(self, stories, children):
        self.stories, self.children, self.queries = stories, children, []

    def search(self, jql, limit=50, fields=None):
        self.queries.append(jql)
        return self.stories if "issuetype" in jql else self.children


STORIES = [
    issue("SMT-8", "Attempt a quiz", "SMT-4", parent_summary="Training Lifecycle"),
    issue("SMT-13", "Review results", "SMT-4", parent_summary="Training Lifecycle"),
    issue("SMT-20", "Empty story", "SMT-4"),
]
CHILDREN = [
    issue("SMT-9", "Backend", "SMT-8", "Acceptance criteria:\n- it works"),
    issue("SMT-10", "Frontend", "SMT-8", "Acceptance criteria: ok"),
    issue("SMT-14", "Results page", "SMT-13", "no criteria here"),
]


def test_stories_come_with_their_epic_subtasks_and_readiness() -> None:
    views = list_jira_stories(FakeApi(STORIES, CHILDREN), "SMT")

    ready, not_ready, empty = views
    assert (ready.key, ready.epic_key, ready.epic_summary) == (
        "SMT-8",
        "SMT-4",
        "Training Lifecycle",
    )
    assert [s.key for s in ready.subtasks] == ["SMT-9", "SMT-10"]
    assert ready.problems == []
    assert not_ready.problems == ["No acceptance criteria in: SMT-14"]
    assert empty.problems == ["The Story has no sub-tasks."]


def test_no_stories_means_no_second_query() -> None:
    api = FakeApi([], CHILDREN)

    assert list_jira_stories(api, "SMT") == []
    assert len(api.queries) == 1


def test_queries_stay_inside_the_project() -> None:
    api = FakeApi(STORIES, CHILDREN)

    list_jira_stories(api, "SMT")

    assert all(q.startswith("project = SMT AND") for q in api.queries)


@pytest.fixture
def client():
    routes._jira_cache.clear()
    app = FastAPI()
    app.include_router(dashboard_router)
    api = FakeApi(STORIES, CHILDREN)
    app.dependency_overrides[get_dashboard_jira_api] = lambda: api
    app.dependency_overrides[routes.get_settings] = lambda: Settings(
        _env_file=None, jira_project="SMT"
    )
    return TestClient(app), api


def test_the_endpoint_lists_stories_and_caches_briefly(client) -> None:
    test_client, api = client

    first = test_client.get("/dashboard/jira-stories")
    second = test_client.get("/dashboard/jira-stories")
    fresh = test_client.get("/dashboard/jira-stories?refresh=true")

    assert first.status_code == 200 and [s["key"] for s in first.json()] == [
        "SMT-8",
        "SMT-13",
        "SMT-20",
    ]
    assert second.json() == first.json() == fresh.json()
    assert len(api.queries) == 4  # two queries for the first call, two for the refresh


def test_a_jira_failure_is_a_502_with_the_reason(client) -> None:
    test_client, api = client

    def broken(*args, **kwargs):
        raise IssueSourceError("Jira is unreachable")

    api.search = broken

    response = test_client.get("/dashboard/jira-stories")

    assert response.status_code == 502 and "unreachable" in response.json()["detail"]


def test_a_planned_run_shows_its_plan_tasks_in_the_overview(
    routes_client, seeded_story
) -> None:
    overview = seeded_story()

    (story,) = overview.stories
    assert story.status == "planned"
    assert [t.key for t in story.planned_tasks] == ["SMT-9", "SMT-10"]
    assert story.planned_tasks[1].depends_on == ["SMT-9"]
    assert story.planned_tasks[0].files == ["backend/quiz.py"]


@pytest.fixture
def seeded_story(routes_client):
    from orchestrator.app.dashboard.service import build_overview
    from orchestrator.app.db.models import StoryRun

    def make():
        plan = {
            "story_key": "SMT-8",
            "doc_target": "docs/q.md",
            "concerns": [],
            "tasks": {
                "SMT-9": {"files": ["backend/quiz.py"], "complexity": "small"},
                "SMT-10": {"depends_on": ["SMT-9"], "parallel_safe": False},
            },
        }
        with routes_client.session_factory() as session:
            session.add(
                StoryRun(story_key="SMT-8", status="planned", plan=json.dumps(plan))
            )
            session.commit()
            return build_overview(
                session, repo=None, max_concurrent_agents=2, polling_enabled=True
            )

    return make
