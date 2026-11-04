import subprocess
from pathlib import Path

import pytest

from orchestrator.app.agents.agent_runner import AgentExecutionResult
from orchestrator.app.core.config import Settings
from orchestrator.app.jira.documenter import (
    StoryDocumenter,
    check_documents,
    doc_prefix,
)

SUB = "projects/demo"


class ScriptedRunner:
    """Plays one scripted action per attempt, each acting on the project folder."""

    def __init__(self, *actions, code: int = 0) -> None:
        self.actions, self.code, self.calls = list(actions), code, []

    def run(self, command, *, cwd, timeout_seconds, task_id=None):
        self.calls.append((command, cwd))
        if self.actions:
            self.actions.pop(0)(cwd)
        return AgentExecutionResult(self.code, "{}", "boom", None)


def write_doc(text: str, name: str = "docs/feature.md"):
    def action(cwd: Path) -> None:
        (cwd / name).parent.mkdir(parents=True, exist_ok=True)
        (cwd / name).write_text(text, encoding="utf-8")

    return action


@pytest.fixture
def worktree(tmp_path: Path) -> Path:
    repo = tmp_path / "repo"
    (repo / SUB / "docs").mkdir(parents=True)
    (repo / SUB / "app.py").write_text("x = 1\n", encoding="utf-8")
    (repo / SUB / "docs" / "old.md").write_text("old\n", encoding="utf-8")
    for args in (
        ["init", "-q"],
        ["add", "-A"],
        ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "x"],
    ):
        subprocess.run(["git", "-C", str(repo), *args], check=True)
    return repo


def documenter(worktree: Path, runner: ScriptedRunner) -> StoryDocumenter:
    settings = Settings(
        _env_file=None,
        repository_path=worktree,
        project_subdir=SUB,
        docs_dir="docs",
    )
    return StoryDocumenter(settings, runner)


def run(worktree: Path, runner: ScriptedRunner):
    return documenter(worktree, runner).write(
        worktree, "SMT-9: Export", "docs/feature.md", ["projects/demo/app.py"]
    )


def status(worktree: Path) -> str:
    return subprocess.run(
        ["git", "-C", str(worktree), "status", "--porcelain"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout


def test_a_good_document_is_committed(worktree: Path) -> None:
    runner = ScriptedRunner(write_doc("Uses `app.py` and `docs/old.md`.\n"))

    result = run(worktree, runner)

    assert result.ok and result.files == [f"{SUB}/docs/feature.md"]
    assert status(worktree) == ""
    command, cwd = runner.calls[0]
    assert cwd == worktree / SUB
    assert command[command.index("--agent") + 1] == "documenter"
    assert command[command.index("--model") + 1] == "sonnet"


def test_the_agent_prompt_names_the_docs_folder_and_the_changed_files(
    worktree: Path,
) -> None:
    runner = ScriptedRunner(write_doc("ok\n"))

    run(worktree, runner)

    prompt = runner.calls[0][0][-1]
    assert "docs/" in prompt and "projects/demo/app.py" in prompt


def test_a_change_outside_the_docs_folder_is_retried_then_discarded(
    worktree: Path,
) -> None:
    def touches_code(cwd: Path) -> None:
        (cwd / "app.py").write_text("x = 2\n", encoding="utf-8")
        write_doc("doc\n")(cwd)

    runner = ScriptedRunner(touches_code, touches_code)

    result = run(worktree, runner)

    assert not result.ok and len(runner.calls) == 2
    assert "outside the docs folder" in result.problems[0]
    assert status(worktree) == ""
    assert (worktree / SUB / "app.py").read_text(encoding="utf-8") == "x = 1\n"


def test_the_retry_is_told_what_was_wrong_and_can_succeed(worktree: Path) -> None:
    runner = ScriptedRunner(
        write_doc("See `missing.py`.\n"), write_doc("See `app.py`.\n")
    )

    result = run(worktree, runner)

    assert result.ok and len(runner.calls) == 2
    assert "missing.py" in runner.calls[1][0][-1]


def test_a_document_naming_a_missing_file_fails(worktree: Path) -> None:
    runner = ScriptedRunner(write_doc("`src/ghost.py`\n"), write_doc("`src/ghost.py`"))

    result = run(worktree, runner)

    assert not result.ok
    assert "src/ghost.py" in result.problems[0]


def test_no_document_written_fails(worktree: Path) -> None:
    result = run(worktree, ScriptedRunner())

    assert not result.ok
    assert "No document was written" in result.problems[0]


def test_a_failing_agent_fails_without_changes(worktree: Path) -> None:
    result = run(worktree, ScriptedRunner(code=1))

    assert not result.ok and "could not run" in result.problems[0]
    assert status(worktree) == ""


def test_a_dirty_worktree_is_refused_before_the_agent_runs(worktree: Path) -> None:
    (worktree / SUB / "app.py").write_text("changed\n", encoding="utf-8")
    runner = ScriptedRunner(write_doc("ok\n"))

    result = run(worktree, runner)

    assert not result.ok and runner.calls == []
    assert (worktree / SUB / "app.py").read_text(encoding="utf-8") == "changed\n"


def test_without_docs_dir_nothing_runs(worktree: Path) -> None:
    runner = ScriptedRunner()
    settings = Settings(_env_file=None, repository_path=worktree)

    result = StoryDocumenter(settings, runner).write(worktree, "s", "", [])

    assert not result.ok and runner.calls == []


def test_doc_prefix_and_check_documents(worktree: Path) -> None:
    assert doc_prefix(SUB, "docs") == "projects/demo/docs/"
    assert doc_prefix(None, "docs/") == "docs/"

    write_doc("`app.py` and `docs/old.md`\n")(worktree / SUB)
    problems, documents = check_documents(
        worktree, worktree / SUB, "projects/demo/docs/"
    )

    assert problems == [] and documents == [f"{SUB}/docs/feature.md"]
