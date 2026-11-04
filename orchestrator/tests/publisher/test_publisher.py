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


def test_the_agent_command_can_only_read(monkeypatch, capsys) -> None:
    pub, api = publisher()
    monkeypatch.setattr(cli, "make_jira_api", lambda settings: api)

    assert cli.run(["epics"]) == 0
    assert cli.run(["search", "--text", "quiz"]) == 0
    with pytest.raises(SystemExit):
        cli.run(["create", "--session", "x"])

    assert api.created == []
    assert not hasattr(cli, "consume_confirmation")
    capsys.readouterr()


# ----- the chat service and routes -----

PLAN_BLOCK = "```plan\n" + json.dumps(PLAN) + "\n```"


class FakeRunner:
    def __init__(self, reply="reply", session_id="abc-123", code=0):
        self.reply, self.session_id, self.code = reply, session_id, code
        self.calls = []

    def run(self, command, *, cwd, timeout_seconds, task_id=None):
        self.calls.append((command, cwd))
        out = json.dumps({"result": self.reply, "session_id": self.session_id})
        return AgentExecutionResult(self.code, out, "boom", None)


def chat(tmp_path: Path, runner: FakeRunner, api: FakeApi | None = None):
    api = api or FakeApi()
    settings = Settings(_env_file=None, repository_path=tmp_path)
    service = PublisherChat(
        settings, runner, publisher_factory=lambda: JiraPublisher(api, settings)
    )
    return service, api


def test_the_agent_gets_one_read_only_tool_and_is_resumed(tmp_path: Path) -> None:
    runner = FakeRunner()
    service, _ = chat(tmp_path, runner)

    first = service.send(None, "As an employee I want quizzes")
    service.send(first.session_id, "add a QA subtask")

    one, two = (call[0] for call in runner.calls)
    assert first.text == "reply" and not first.can_confirm
    assert one[one.index("--agent") + 1] == "jira-publisher"
    assert "--resume" not in one
    assert two[two.index("--resume") + 1] == "abc-123"
    assert one[one.index("--allowedTools") + 1] == (
        "Bash(python -m orchestrator.app.publisher.cli:*)"
    )
    assert one[-1] == "As an employee I want quizzes"


def test_a_proposal_is_held_with_its_counts_and_the_block_is_hidden(
    tmp_path: Path,
) -> None:
    service, api = chat(tmp_path, FakeRunner(f"The tree.\n{PLAN_BLOCK}"))

    reply = service.send(None, "need quizzes")

    assert reply.can_confirm and api.created == []
    assert "```" not in reply.text and "The tree." in reply.text
    assert "1 Stories, 2 Subtasks" in reply.text


def test_confirm_creates_exactly_the_held_plan_once(tmp_path: Path) -> None:
    service, api = chat(tmp_path, FakeRunner(PLAN_BLOCK))
    session = service.send(None, "need quizzes").session_id

    done = service.send(session, "Confirm")

    assert [c[1] for c in api.created] == ["Story", "Subtask", "Subtask"]
    assert "Created and verified" in done.text and not done.can_confirm
    with pytest.raises(Exception, match="no proposal"):
        service.send(session, "confirm")
    assert len(api.created) == 3


def test_any_other_message_withdraws_the_proposal(tmp_path: Path) -> None:
    runner = FakeRunner(PLAN_BLOCK)
    service, api = chat(tmp_path, runner)
    session = service.send(None, "need quizzes").session_id

    runner.reply = "Which Epic do you want?"
    reply = service.send(session, "actually, another idea")

    assert not reply.can_confirm
    with pytest.raises(Exception, match="no proposal"):
        service.send(session, "confirm")
    assert api.created == []


def test_the_agent_is_told_what_the_system_created(tmp_path: Path) -> None:
    runner = FakeRunner(PLAN_BLOCK)
    service, _ = chat(tmp_path, runner)
    session = service.send(None, "need quizzes").session_id
    service.send(session, "confirm")

    service.send(session, "thanks")

    assert "the system created it" in runner.calls[-1][0][-1]
    assert "SMT-11" in runner.calls[-1][0][-1]


def test_a_failure_during_creation_is_reported_with_what_exists(
    tmp_path: Path,
) -> None:
    service, api = chat(tmp_path, FakeRunner(PLAN_BLOCK), FakeApi(fail_on="Quiz API"))
    session = service.send(None, "need quizzes").session_id

    done = service.send(session, "confirm")

    assert "Stopped at Subtask 'Quiz API'" in done.text and "Jira said no" in done.text
    assert "Story SMT-11" in done.text


def test_an_unusable_plan_block_cannot_be_confirmed(tmp_path: Path) -> None:
    bad = json.dumps({"stories": [{"epic": "OTH-1", "summary": "x"}]})
    service, api = chat(tmp_path, FakeRunner(f"tree\n```plan\n{bad}\n```"))

    reply = service.send(None, "need quizzes")

    assert not reply.can_confirm and "could not be used" in reply.text
    with pytest.raises(Exception, match="no proposal"):
        service.send(reply.session_id, "confirm")
    assert api.created == []


def test_confirm_before_any_proposal_is_refused(tmp_path: Path) -> None:
    service, _ = chat(tmp_path, FakeRunner())

    with pytest.raises(Exception, match="no proposal"):
        service.send(None, "confirm")


def test_an_agent_failure_is_reported(tmp_path: Path) -> None:
    service, _ = chat(tmp_path, FakeRunner(code=1))

    with pytest.raises(Exception, match="publisher failed"):
        service.send(None, "hello")


def test_the_routes_serve_the_page_and_relay_messages(tmp_path: Path) -> None:
    service, _ = chat(tmp_path, FakeRunner(PLAN_BLOCK))
    app = FastAPI()
    app.include_router(publisher_router)
    app.dependency_overrides[get_publisher_chat] = lambda: service
    client = TestClient(app)

    page = client.get("/publisher")
    reply = client.post("/publisher/message", json={"message": "need quizzes"})
    empty = client.post("/publisher/message", json={"message": "  "})
    done = client.post(
        "/publisher/message",
        json={"message": "confirm", "session_id": reply.json()["session_id"]},
    )

    assert page.status_code == 200 and "Jira Publisher" in page.text
    assert reply.json()["can_confirm"] is True
    assert empty.status_code == 422
    assert done.json()["can_confirm"] is False and "Created" in done.json()["reply"]


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
