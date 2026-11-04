import json
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from orchestrator.app.agents.agent_runner import AgentExecutionResult
from orchestrator.app.api.publisher_routes import get_publisher_chat
from orchestrator.app.api.publisher_routes import router as publisher_router
from orchestrator.app.core.config import Settings
from orchestrator.app.core.exceptions import IssueSourceError, PlanningError
from orchestrator.app.publisher import cli
from orchestrator.app.publisher.guard import JiraPublisher, parse_plan
from orchestrator.app.publisher.service import PublisherChat


class FakeApi:
    """Records creates; keeps issues so searches and lookups can verify them."""

    def __init__(self, fail_on: str | None = None, wrong_parent: bool = False):
        self.issues = {
            "SMT-1": ("Epic", "Training", None, "SMT"),
            "OTH-1": ("Epic", "Elsewhere", None, "OTH"),
            "SMT-2": ("Story", "A story", "SMT-1", "SMT"),
        }
        self.fail_on, self.wrong_parent = fail_on, wrong_parent
        self.created, self.counter = [], 10
        self.deleted = []

    def issue(self, key, fields=""):
        found = self.issues.get(key)
        if found is None:
            return None
        kind, _, _, project = found
        return {
            "key": key,
            "fields": {"issuetype": {"name": kind}, "project": {"key": project}},
        }

    def search(self, jql, limit=50, fields=None):
        self.last_jql = jql
        return [
            {
                "key": key,
                "fields": {
                    "summary": summary,
                    "issuetype": {"name": kind},
                    "parent": {"key": parent} if parent else None,
                },
            }
            for key, (kind, summary, parent, _) in self.issues.items()
        ]

    def create_issue(
        self,
        project,
        issue_type,
        summary,
        description,
        parent=None,
        labels=None,
        priority=None,
    ):
        if summary == self.fail_on:
            raise IssueSourceError("Jira said no")
        self.counter += 1
        key = f"SMT-{self.counter}"
        shown_parent = "SMT-1" if self.wrong_parent and parent != "SMT-1" else parent
        self.issues[key] = (issue_type, summary, shown_parent, project)
        self.created.append((project, issue_type, summary, parent, labels, priority))
        return key

    def delete_issue(self, key):
        self.deleted.append(key)


PLAN = {
    "stories": [
        {
            "ref": "S1",
            "epic": "SMT-1",
            "summary": "Take a quiz",
            "description": "Story text",
            "subtasks": [
                {
                    "summary": "Quiz API",
                    "description": "Acceptance criteria:\nworks",
                    "labels": ["backend"],
                    "priority": "High",
                },
                {"summary": "Quiz page", "description": "Acceptance criteria:\nworks"},
            ],
        }
    ]
}


def publisher(api=None) -> tuple[JiraPublisher, FakeApi]:
    api = api or FakeApi()
    return JiraPublisher(api, Settings(_env_file=None)), api


def test_a_good_plan_creates_stories_then_subtasks_and_verifies() -> None:
    pub, api = publisher()

    result = pub.publish(parse_plan(PLAN, "SMT"))

    assert result.ok and result.problems == [] and result.failed is None
    assert [(c[1], c[3]) for c in api.created] == [
        ("Story", "SMT-1"),
        ("Subtask", "SMT-11"),
        ("Subtask", "SMT-11"),
    ]
    assert {c[0] for c in api.created} == {"SMT"}
    assert api.created[1][4:] == (["backend"], "High")
    assert [item.key for item in result.verified] != []
    assert api.deleted == []


def test_the_first_failure_stops_everything_without_deleting() -> None:
    pub, api = publisher(FakeApi(fail_on="Quiz API"))

    result = pub.publish(parse_plan(PLAN, "SMT"))

    assert not result.ok
    assert result.failed == "Subtask 'Quiz API' under SMT-11"
    assert "Jira said no" in (result.error or "")
    assert [c[2] for c in api.created] == ["Take a quiz"]
    assert api.deleted == []


def test_a_wrong_parent_in_jira_is_reported_not_called_success() -> None:
    pub, _ = publisher(FakeApi(wrong_parent=True))

    result = pub.publish(parse_plan(PLAN, "SMT"))

    assert not result.ok
    assert any("expected a Subtask under SMT-11" in p for p in result.problems)


@pytest.mark.parametrize("epic", ["OTH-1", "SMT-2", "SMT-999"])
def test_a_story_needs_an_existing_epic_of_the_project(epic: str) -> None:
    pub, api = publisher()
    plan = json.loads(json.dumps(PLAN))
    plan["stories"][0]["epic"] = epic

    with pytest.raises(PlanningError):
        pub.publish(parse_plan(plan, "SMT"))

    assert api.created == []


@pytest.mark.parametrize(
    "change",
    [
        lambda p: p.update(stories=[]),
        lambda p: p["stories"][0].update(epic="OTH-1"),
        lambda p: p["stories"][0].update(epic=None),
        lambda p: p["stories"][0].update(summary=" "),
        lambda p: p["stories"][0]["subtasks"][0].update(labels=["has space"]),
        lambda p: p["stories"][0]["subtasks"][0].update(priority="Urgent"),
        lambda p: p["stories"][0]["subtasks"][0].update(description=""),
        lambda p: p.update(stories=[PLAN["stories"][0]] * 16),
    ],
)
def test_bad_plans_are_rejected(change) -> None:
    plan = json.loads(json.dumps(PLAN))
    change(plan)

    with pytest.raises(PlanningError):
        parse_plan(plan, "SMT")


def test_the_publisher_has_no_way_to_delete_or_make_epics() -> None:
    names = {name for name in dir(JiraPublisher) if not name.startswith("_")}

    assert names == {"epics", "search", "check_epics", "publish", "verify"}


def test_epics_and_search_stay_inside_the_project() -> None:
    pub, api = publisher()

    pub.epics()
    assert api.last_jql.startswith("project = SMT AND issuetype =")
    pub.search('quiz" OR project = OTH')
    assert api.last_jql.startswith("project = SMT AND text ~")
    assert '\\"' in api.last_jql


# ----- the command the agent runs -----


def test_create_refuses_without_the_servers_confirmation(
    tmp_path: Path, monkeypatch, capsys
) -> None:
    pub, api = publisher()
    monkeypatch.setattr(cli, "make_jira_api", lambda settings: api)

    code = cli.run(["create", "--session", str(tmp_path)], json.dumps(PLAN))

    assert code == 2 and api.created == []
    assert "Not confirmed" in capsys.readouterr().out


def test_create_works_once_per_confirmation(
    tmp_path: Path, monkeypatch, capsys
) -> None:
    pub, api = publisher()
    monkeypatch.setattr(cli, "make_jira_api", lambda settings: api)
    (tmp_path / cli.CONFIRMED).write_text("x", encoding="utf-8")

    assert cli.run(["create", "--session", str(tmp_path)], json.dumps(PLAN)) == 0
    out = json.loads(capsys.readouterr().out)
    assert out["ok"] is True and len(out["created"]) == 3

    assert cli.run(["create", "--session", str(tmp_path)], json.dumps(PLAN)) == 2
    assert len(api.created) == 3


def test_a_bad_plan_does_not_use_up_the_confirmation(
    tmp_path: Path, monkeypatch, capsys
) -> None:
    pub, api = publisher()
    monkeypatch.setattr(cli, "make_jira_api", lambda settings: api)
    (tmp_path / cli.CONFIRMED).write_text("x", encoding="utf-8")

    assert cli.run(["create", "--session", str(tmp_path)], "{}") == 1

    assert (tmp_path / cli.CONFIRMED).exists() and api.created == []
    capsys.readouterr()


# ----- the chat service and routes -----


class FakeRunner:
    def __init__(self, session_id="abc-123", code=0):
        self.session_id, self.code, self.calls = session_id, code, []

    def run(self, command, *, cwd, timeout_seconds, task_id=None):
        self.calls.append((command, cwd))
        out = json.dumps({"result": "reply", "session_id": self.session_id})
        return AgentExecutionResult(self.code, out, "boom", None)


def chat(tmp_path: Path, runner: FakeRunner) -> PublisherChat:
    service = PublisherChat(Settings(_env_file=None, repository_path=tmp_path), runner)
    service.root = tmp_path / "sessions"
    return service


def test_the_agent_gets_one_restricted_tool_and_is_resumed(tmp_path: Path) -> None:
    runner = FakeRunner()
    service = chat(tmp_path, runner)

    session, reply = service.send(None, "As an employee I want quizzes")
    service.send(session, "add a QA subtask")

    first, second = (call[0] for call in runner.calls)
    assert reply == "reply" and first[first.index("--agent") + 1] == "jira-publisher"
    assert "--resume" not in first
    assert second[second.index("--resume") + 1] == "abc-123"
    tools = first[first.index("--allowedTools") + 1]
    assert tools == "Bash(python -m orchestrator.app.publisher.cli:*)"
    assert "SESSION=" in first[-1] and "quizzes" in first[-1]


def test_confirm_is_recorded_by_the_server_and_withdrawn_by_any_other_message(
    tmp_path: Path,
) -> None:
    runner = FakeRunner()
    service = chat(tmp_path, runner)
    session, _ = service.send(None, "a requirement")
    marker = service.sessions[session].folder / cli.CONFIRMED

    seen = []
    original = runner.run
    runner.run = lambda *a, **k: (seen.append(marker.exists()), original(*a, **k))[1]

    service.send(session, "Confirm")
    service.send(session, "actually change it")

    assert seen == [True, False]
    assert not marker.exists()


def test_confirm_with_no_proposal_is_refused(tmp_path: Path) -> None:
    with pytest.raises(Exception, match="no proposal"):
        chat(tmp_path, FakeRunner()).send(None, "confirm")


def test_an_agent_failure_is_reported(tmp_path: Path) -> None:
    with pytest.raises(Exception, match="publisher failed"):
        chat(tmp_path, FakeRunner(code=1)).send(None, "hello")


def test_the_routes_serve_the_page_and_relay_messages(tmp_path: Path) -> None:
    service = chat(tmp_path, FakeRunner())
    app = FastAPI()
    app.include_router(publisher_router)
    app.dependency_overrides[get_publisher_chat] = lambda: service
    client = TestClient(app)

    page = client.get("/publisher")
    reply = client.post("/publisher/message", json={"message": "need quizzes"})
    empty = client.post("/publisher/message", json={"message": "  "})

    assert page.status_code == 200 and "Jira Publisher" in page.text
    assert reply.json()["reply"] == "reply" and reply.json()["session_id"]
    assert empty.status_code == 422


def test_the_publisher_is_its_own_app_apart_from_the_orchestrator() -> None:
    from orchestrator.app.main import app as orchestrator
    from orchestrator.app.publisher.app import app as publisher_app

    publisher = TestClient(publisher_app)
    main = TestClient(orchestrator)

    assert publisher.get("/publisher").status_code == 200
    assert publisher.get("/", follow_redirects=False).status_code == 307
    assert publisher.get("/dashboard").status_code == 404
    assert publisher.get("/tasks").status_code == 404
    assert main.get("/publisher").status_code == 404
    assert "/publisher/message" not in orchestrator.openapi()["paths"]
    assert "/publisher/message" in publisher_app.openapi()["paths"]
