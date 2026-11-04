import copy
import json
import subprocess
from pathlib import Path

import pytest

from orchestrator.app.agents.agent_runner import AgentExecutionResult
from orchestrator.app.core.config import Settings
from orchestrator.app.core.exceptions import PlanningError
from orchestrator.app.jira.source import JiraRecord
from orchestrator.app.jira.story import StoryBundle, SubTask
from orchestrator.app.planning.story_planner import (
    StorySequencer,
    build_prompt,
    validate_plan,
)

FILES = [
    "CLAUDE.md",
    "backend/reports/export.py",
    "backend/reports/format.py",
    "docs/reports/listReports_v2.md",
]


def bundle() -> StoryBundle:
    return StoryBundle(
        story=JiraRecord(key="SMT-9", summary="Export report", description="Story."),
        epic=JiraRecord(key="SMT-1", summary="Reporting", description="Epic."),
        sub_tasks=[
            SubTask(key="SMT-10", summary="Endpoint", criteria=["returns 200"]),
            SubTask(key="SMT-11", summary="Button", criteria=["button exists"]),
        ],
    )


def good_plan() -> dict:
    return {
        "doc_target": "docs/reports/exportReport_v2.md",
        "concerns": [],
        "tasks": {
            "SMT-10": {
                "files": ["backend/reports/export.py"],
                "new_files": ["backend/reports/csv_helper.py"],
                "depends_on": [],
                "parallel_safe": True,
                "complexity": "small",
                "verification": "call the endpoint",
                "expected_outcome": "CSV is returned",
                "context_notes": "reuse format.py",
                "concerns": [],
            },
            "SMT-11": {
                "files": ["backend/reports/format.py"],
                "new_files": [],
                "depends_on": ["SMT-10"],
                "parallel_safe": False,
                "complexity": "medium",
            },
        },
    }


def check(plan: dict):
    return validate_plan(json.dumps(plan), bundle(), FILES, "docs")


def rejected(plan: dict) -> str:
    with pytest.raises(PlanningError) as raised:
        check(plan)
    return str(raised.value)


def test_a_good_plan_is_accepted_in_jira_order() -> None:
    plan = check(good_plan())

    assert plan.story_key == "SMT-9"
    assert plan.doc_target == "docs/reports/exportReport_v2.md"
    assert [task.key for task in plan.tasks] == ["SMT-10", "SMT-11"]
    assert plan.tasks[0].new_files == ["backend/reports/csv_helper.py"]
    assert plan.tasks[1].depends_on == ["SMT-10"]
    assert json.loads(plan.to_json())["tasks"]["SMT-10"]["complexity"] == "small"


def test_extra_sub_tasks_are_rejected() -> None:
    data = good_plan()
    data["tasks"]["SMT-99"] = copy.deepcopy(data["tasks"]["SMT-10"])

    assert "added sub-tasks that are not in Jira: SMT-99" in rejected(data)


def test_dropped_sub_tasks_are_rejected() -> None:
    data = good_plan()
    del data["tasks"]["SMT-11"]

    assert "left out Jira sub-tasks: SMT-11" in rejected(data)


def test_files_not_in_the_file_list_are_rejected() -> None:
    data = good_plan()
    data["tasks"]["SMT-10"]["files"] = ["backend/reports/nope.py"]

    assert "SMT-10 names files not in the file list" in rejected(data)


def test_new_files_may_not_leave_the_project() -> None:
    data = good_plan()
    data["tasks"]["SMT-10"]["new_files"] = ["../outside.py"]

    assert "new file outside the project" in rejected(data)


def test_a_cycle_is_rejected() -> None:
    data = good_plan()
    data["tasks"]["SMT-10"]["depends_on"] = ["SMT-11"]

    assert "form a cycle" in rejected(data)


def test_unknown_or_self_dependencies_are_rejected() -> None:
    data = good_plan()
    data["tasks"]["SMT-10"]["depends_on"] = ["SMT-10", "SMT-77"]

    assert "depends on an unknown key or itself" in rejected(data)


def test_bad_complexity_is_rejected() -> None:
    data = good_plan()
    data["tasks"]["SMT-10"]["complexity"] = "huge"

    assert "complexity 'huge'" in rejected(data)


@pytest.mark.parametrize(
    "target", ["", "notes.md", "docs/readme.txt", "../docs/x.md", "/docs/x.md"]
)
def test_doc_target_must_be_a_markdown_file_inside_the_docs_folder(target) -> None:
    data = good_plan()
    data["doc_target"] = target

    assert "doc_target" in rejected(data)


def test_an_answer_that_is_not_json_is_rejected() -> None:
    with pytest.raises(PlanningError, match="did not answer with a JSON plan"):
        validate_plan("sorry, no", bundle(), FILES, "docs")


def test_sub_tasks_that_share_a_file_are_ordered() -> None:
    data = good_plan()
    data["tasks"]["SMT-11"]["depends_on"] = []
    data["tasks"]["SMT-11"]["files"] = ["backend/reports/export.py"]

    plan = check(data)

    assert plan.tasks[1].depends_on == ["SMT-10"]
    assert any("SMT-11 waits for SMT-10" in item for item in plan.concerns)


def test_the_prompt_lists_story_sub_tasks_criteria_and_files() -> None:
    prompt = build_prompt(bundle(), "docs", FILES)

    for expected in (
        "SMT-9",
        "Epic SMT-1",
        "[SMT-10] Endpoint",
        "- returns 200",
        "backend/reports/export.py",
        "docs folder is `docs`",
    ):
        assert expected in prompt


class FakeRunner:
    def __init__(self, reply: str = "", code: int = 0) -> None:
        self.reply, self.code, self.calls = reply, code, []

    def run(self, command, *, cwd, timeout_seconds, task_id=None):
        self.calls.append((command, cwd))
        return AgentExecutionResult(
            self.code, json.dumps({"result": self.reply}), "boom", None
        )


@pytest.fixture
def project(tmp_path: Path) -> Path:
    folder = tmp_path / "projects" / "demo"
    (folder / "docs" / "reports").mkdir(parents=True)
    (folder / "backend" / "reports").mkdir(parents=True)
    for name in FILES:
        (folder / name).write_text("x\n", encoding="utf-8")
    subprocess.run(["git", "init", "-q", str(tmp_path)], check=True)
    subprocess.run(["git", "-C", str(tmp_path), "add", "-A"], check=True)
    return folder


def sequencer(tmp_path: Path, runner: FakeRunner) -> StorySequencer:
    settings = Settings(_env_file=None, repository_path=tmp_path)
    return StorySequencer(settings, runner)


def test_sequencer_runs_the_read_only_agent_in_the_project(
    tmp_path: Path, project: Path
) -> None:
    runner = FakeRunner(json.dumps(good_plan()))

    plan = sequencer(tmp_path, runner).plan(bundle(), project, "docs")

    command, cwd = runner.calls[0]
    assert plan.tasks[1].depends_on == ["SMT-10"]
    assert cwd == project
    assert command[command.index("--agent") + 1] == "story-sequencer"
    assert command[command.index("--allowedTools") + 1] == "Read,Grep,Glob"


def test_sequencer_uses_the_model_from_its_agent_file(
    tmp_path: Path, project: Path
) -> None:
    agents = tmp_path / ".claude" / "agents"
    agents.mkdir(parents=True)
    (agents / "story-sequencer.md").write_text(
        "---\nname: story-sequencer\nmodel: opus\neffort: max\n---\nbody\n",
        encoding="utf-8",
    )
    runner = FakeRunner(json.dumps(good_plan()))

    sequencer(tmp_path, runner).plan(bundle(), project, "docs")

    command, _ = runner.calls[0]
    assert command[command.index("--model") + 1] == "opus"
    assert command[command.index("--effort") + 1] == "max"


def test_a_failed_agent_is_a_planning_error(tmp_path: Path, project: Path) -> None:
    with pytest.raises(PlanningError, match="story sequencer failed"):
        sequencer(tmp_path, FakeRunner("x", code=1)).plan(bundle(), project, "docs")


def test_a_bad_plan_from_the_agent_is_rejected(tmp_path: Path, project: Path) -> None:
    data = good_plan()
    del data["tasks"]["SMT-11"]

    with pytest.raises(PlanningError, match="rejected"):
        sequencer(tmp_path, FakeRunner(json.dumps(data))).plan(
            bundle(), project, "docs"
        )
