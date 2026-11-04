import json
import subprocess
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from orchestrator.app.api.story_routes import (
    get_story_jira_api,
    get_story_settings,
)
from orchestrator.app.api.story_routes import router as story_router
from orchestrator.app.core.config import Settings
from orchestrator.app.core.exceptions import PlanningError
from orchestrator.app.db.database import Base, get_db
from orchestrator.app.db.models import StoryRun, Task, TaskStatus
from orchestrator.app.jira.client import JiraApi
from orchestrator.app.jira.importer import sync_jira_items
from orchestrator.app.jira.models import JiraItem
from orchestrator.app.jira.source import JiraRecord, JiraWorkItem
from orchestrator.app.jira.story_run import latest_planned_run, start_story_run
from orchestrator.tests.helpers import init_repository


def text_doc(text: str) -> dict:
    return {
        "type": "doc",
        "content": [{"type": "paragraph", "content": [{"type": "text", "text": text}]}],
    }


def issue(key, summary, kind, parent=None, text=None) -> dict:
    return {
        "key": key,
        "fields": {
            "summary": summary,
            "description": text_doc(text) if text else None,
            "issuetype": {"name": kind},
            "status": {"name": "To Do"},
            "parent": {"key": parent} if parent else None,
        },
    }


def make_api(children: list[dict]) -> JiraApi:
    answers = {
        "SMT-9": issue("SMT-9", "Export report", "Story", "SMT-1", "Story text."),
        "SMT-1": issue("SMT-1", "Reporting", "Epic", None, "Epic text."),
    }

    def transport(method, path, body):
        key = path.split("/issue/")[-1].split("?")[0] if "/issue/" in path else None
        if method == "GET" and key in answers:
            return answers[key]
        if method == "POST" and path == "/search/jql":
            return {"issues": children}
        return None

    return JiraApi("https://x.atlassian.net", "a@b.c", "t", transport=transport)


CHILDREN = [
    issue("SMT-10", "Endpoint", "Sub-task", "SMT-9", "Acceptance criteria: ok"),
    issue("SMT-11", "Button", "Sub-task", "SMT-9", "Acceptance criteria: ok"),
]

PLAN = {
    "story_key": "SMT-9",
    "doc_target": "docs/x.md",
    "concerns": [],
    "tasks": {
        "SMT-10": {
            "key": "SMT-10",
            "files": ["a.py"],
            "new_files": ["b.py"],
            "depends_on": [],
            "parallel_safe": True,
            "complexity": "small",
            "expected_outcome": "CSV returned",
            "context_notes": "reuse helper",
        },
        "SMT-11": {
            "key": "SMT-11",
            "files": [],
            "new_files": ["c.py"],
            "depends_on": ["SMT-10"],
            "parallel_safe": False,
            "complexity": "medium",
            "expected_outcome": "",
            "context_notes": "",
        },
    },
}


@pytest.fixture
def env(tmp_path: Path):
    repo = tmp_path / "repo"
    init_repository(repo)
    git = ["git", "-C", str(repo)]
    subprocess.run([*git, "checkout", "-q", "-b", "development"], check=True)
    (repo / "only_on_development.txt").write_text("x\n", encoding="utf-8")
    subprocess.run([*git, "add", "-A"], check=True)
    subprocess.run([*git, "commit", "-q", "-m", "dev"], check=True)

    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    settings = Settings(
        _env_file=None,
        repository_path=repo,
        worktrees_dir=str(tmp_path / "wt"),
        base_branch="development",
        github_repo="o/r",
    )
    yield factory, settings, tmp_path
    engine.dispose()


def planned_run(session, plan=PLAN) -> StoryRun:
    run = StoryRun(
        story_key="SMT-9",
        status="planned",
        base_branch="development",
        plan=json.dumps(plan),
    )
    session.add(run)
    session.commit()
    return run


def test_start_creates_one_task_per_sub_task_from_the_base_branch(env) -> None:
    factory, settings, tmp_path = env

    with factory() as session:
        run = planned_run(session)

        started = start_story_run(session, settings, make_api(CHILDREN), run)

        first, second = started.tasks
        assert run.status == "running" and started.failed == {}
        assert (first.jira_key, second.jira_key) == ("SMT-10", "SMT-11")
        assert (
            tmp_path / "wt" / f"task-{first.id}" / "only_on_development.txt"
        ).exists()
        assert first.story_run_id == run.id == second.story_run_id
        assert json.loads(first.files) == ["a.py", "b.py"]
        assert (first.complexity, first.parallel_safe) == ("small", True)
        assert first.expected_outcome == "CSV returned"
        assert first.context_notes == "reuse helper"
        assert second.expected_outcome is None and second.parallel_safe is False


def test_dependent_sub_tasks_wait_and_independent_ones_are_queued(env) -> None:
    factory, settings, _ = env

    with factory() as session:
        started = start_story_run(
            session, settings, make_api(CHILDREN), planned_run(session)
        )

        first, second = started.tasks
        assert first.status == TaskStatus.QUEUED and first.blocked_by is None
        assert second.status == TaskStatus.BLOCKED
        assert json.loads(second.blocked_by)[0]["task_id"] == first.id


def test_story_and_epic_are_saved_above_the_tasks(env) -> None:
    factory, settings, _ = env

    with factory() as session:
        started = start_story_run(
            session, settings, make_api(CHILDREN), planned_run(session)
        )

        story = session.scalar(select(JiraItem).where(JiraItem.key == "SMT-9"))
        assert story is not None and story.parent_key == "SMT-1"
        assert started.tasks[0].jira_item.parent_key == "SMT-9"


def test_a_run_that_is_not_planned_is_refused(env) -> None:
    factory, settings, _ = env

    with factory() as session:
        run = planned_run(session)
        run.status = "running"

        with pytest.raises(PlanningError, match="not planned"):
            start_story_run(session, settings, make_api(CHILDREN), run)


def test_changed_sub_tasks_in_jira_require_a_new_plan(env) -> None:
    factory, settings, _ = env

    with factory() as session:
        run = planned_run(session)

        with pytest.raises(PlanningError, match="changed in Jira"):
            start_story_run(session, settings, make_api(CHILDREN[:1]), run)

        assert session.scalars(select(Task)).all() == []
        assert run.status == "planned"


def test_sub_tasks_that_already_have_tasks_are_refused(env) -> None:
    factory, settings, _ = env

    with factory() as session:
        start_story_run(session, settings, make_api(CHILDREN), planned_run(session))
        second = planned_run(session)

        with pytest.raises(PlanningError, match="Already imported as tasks"):
            start_story_run(session, settings, make_api(CHILDREN), second)


def test_latest_planned_run_ignores_started_runs(env) -> None:
    factory, _, _ = env

    with factory() as session:
        old = planned_run(session)
        old.status = "running"
        newer = planned_run(session)

        assert latest_planned_run(session, "SMT-9") is newer
        assert latest_planned_run(session, "SMT-404") is None


def test_story_mode_leaves_story_sub_tasks_to_story_runs(env) -> None:
    factory, settings, tmp_path = env
    story = JiraRecord("SMT-9", "Story", "S", "", None, None)
    under_story = JiraWorkItem(
        record=JiraRecord("SMT-10", "Task", "child", "", "To Do", "SMT-9"),
        ancestors=[story],
    )
    plain = JiraWorkItem(record=JiraRecord("SMT-50", "Task", "alone", "", "To Do"))

    class Source:
        def list_items(self):
            return [under_story, plain]

    with factory() as session:
        from orchestrator.app.jira.importer import ensure_repository_milestone

        milestone = ensure_repository_milestone(
            session, Path(settings.repository_path), None
        )
        result = sync_jira_items(
            session,
            milestone,
            Source(),
            tmp_path / "wt",
            base_branch="development",
            skip_story_children=True,
        )

        assert [task.jira_key for task in result.imported] == ["SMT-50"]
        assert result.skipped == ["SMT-10"]


def test_endpoints_plan_then_run(env) -> None:
    factory, settings, _ = env
    api = make_api(CHILDREN)

    def db():
        with factory() as session:
            yield session

    app = FastAPI()
    app.include_router(story_router)
    app.dependency_overrides[get_db] = db
    app.dependency_overrides[get_story_settings] = lambda: settings
    app.dependency_overrides[get_story_jira_api] = lambda: api
    client = TestClient(app)

    assert client.post("/stories/SMT-9/run").status_code == 404

    with factory() as session:
        planned_run(session)

    response = client.post("/stories/SMT-9/run")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "running"
    by_key = {task["key"]: task for task in body["tasks"]}
    assert by_key["SMT-10"]["status"] == "queued"
    assert by_key["SMT-11"]["status"] == "blocked"
    assert by_key["SMT-11"]["blocked_by"] == [by_key["SMT-10"]["task_id"]]
    assert client.post("/stories/SMT-9/run").status_code == 404
