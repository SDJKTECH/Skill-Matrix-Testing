from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from orchestrator.app.api.story_routes import (
    get_sequencer,
    get_story_jira_api,
    get_story_settings,
)
from orchestrator.app.api.story_routes import router as story_router
from orchestrator.app.core.config import Settings
from orchestrator.app.core.exceptions import PlanningError
from orchestrator.app.db.database import Base, get_db
from orchestrator.app.db.models import PlanConcern, StoryRun
from orchestrator.app.jira.client import JiraApi
from orchestrator.app.planning.story_planner import StoryPlan, TaskPlan

CLAUDE_MD = (
    "## Purpose\nx\n## Project structure\ndocs/\n## Commands\nx\n"
    "## Rules\nx\n## Docs\nx\n"
)


def issue(key: str, summary: str, description=None, parent=None) -> dict:
    fields = {
        "summary": summary,
        "description": description,
        "issuetype": {"name": "Story" if key == "SMT-9" else "Sub-task"},
        "status": {"name": "To Do"},
        "parent": {"key": parent} if parent else None,
    }
    return {"key": key, "fields": fields}


def text_doc(text: str) -> dict:
    return {
        "type": "doc",
        "content": [{"type": "paragraph", "content": [{"type": "text", "text": text}]}],
    }


def make_api(with_criteria: bool = True) -> JiraApi:
    child = issue(
        "SMT-10",
        "Endpoint",
        text_doc("Acceptance criteria: returns 200" if with_criteria else "Do it."),
        parent="SMT-9",
    )

    def transport(method, path, body):
        if method == "GET" and "/issue/SMT-9" in path:
            return issue("SMT-9", "Export report", text_doc("Story."))
        if method == "POST" and path == "/search/jql":
            return {"issues": [child]}
        return None

    return JiraApi("https://x.atlassian.net", "a@b.c", "t", transport=transport)


class FakeSequencer:
    def __init__(self, error: str | None = None) -> None:
        self.error, self.calls = error, 0

    def plan(self, bundle, project_folder, docs_dir):
        self.calls += 1
        if self.error:
            raise PlanningError(self.error)
        return StoryPlan(
            story_key=bundle.story.key,
            doc_target="docs/exportReport_v2.md",
            concerns=["story-level worry"],
            tasks=[
                TaskPlan(
                    key="SMT-10",
                    files=["a.py"],
                    complexity="small",
                    concerns=["vague"],
                )
            ],
        )


@pytest.fixture
def env(tmp_path: Path):
    project = tmp_path / "projects" / "demo"
    (project / "docs").mkdir(parents=True)
    (project / "CLAUDE.md").write_text(CLAUDE_MD, encoding="utf-8")
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    settings = Settings(
        _env_file=None,
        repository_path=tmp_path,
        project="demo",
        docs_dir="docs",
        base_branch="development",
    )
    state = {"api": make_api(), "sequencer": FakeSequencer(), "settings": settings}

    def db():
        with factory() as session:
            yield session

    app = FastAPI()
    app.include_router(story_router)
    app.dependency_overrides[get_db] = db
    app.dependency_overrides[get_story_settings] = lambda: state["settings"]
    app.dependency_overrides[get_story_jira_api] = lambda: state["api"]
    app.dependency_overrides[get_sequencer] = lambda: state["sequencer"]
    yield TestClient(app), state, factory
    engine.dispose()


def test_plan_endpoint_saves_a_story_run_with_concerns(env) -> None:
    client, state, factory = env

    response = client.post("/stories/SMT-9/plan")

    assert response.status_code == 200
    body = response.json()
    assert body["story_key"] == "SMT-9" and body["status"] == "planned"
    assert body["base_branch"] == "development"
    assert body["doc_target"] == "docs/exportReport_v2.md"
    assert body["tasks"][0]["key"] == "SMT-10"

    with factory() as session:
        run = session.scalars(select(StoryRun)).one()
        assert run.id == body["run_id"] and "SMT-10" in run.plan
        texts = sorted(c.text for c in session.scalars(select(PlanConcern)))
        assert texts == ["SMT-10: vague", "story-level worry"]


def test_failed_checks_stop_before_the_sequencer_runs(env) -> None:
    client, state, factory = env
    state["api"] = make_api(with_criteria=False)

    response = client.post("/stories/SMT-9/plan")

    assert response.status_code == 422
    assert "No acceptance criteria in: SMT-10" in response.json()["detail"]
    assert state["sequencer"].calls == 0
    with factory() as session:
        assert session.scalars(select(StoryRun)).all() == []


def test_a_rejected_plan_is_not_saved(env) -> None:
    client, state, factory = env
    state["sequencer"] = FakeSequencer(error="The sequencer's plan was rejected")

    response = client.post("/stories/SMT-9/plan")

    assert response.status_code == 422
    with factory() as session:
        assert session.scalars(select(StoryRun)).all() == []


def test_missing_story_is_a_bad_gateway(env) -> None:
    client, state, _ = env
    state["api"] = JiraApi("https://x", "a", "t", transport=lambda *a: None)

    assert client.post("/stories/SMT-404/plan").status_code == 502


def test_without_a_project_the_endpoint_is_unavailable(env, tmp_path: Path) -> None:
    client, state, _ = env
    state["settings"] = Settings(_env_file=None, repository_path=tmp_path)

    assert client.post("/stories/SMT-9/plan").status_code == 503
