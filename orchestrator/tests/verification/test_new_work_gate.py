import subprocess
import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from orchestrator.app.agents.agent_runner import AgentExecutionResult
from orchestrator.app.core.exceptions import AgentExecutionError
from orchestrator.app.verification.runner import VerificationRunner
from orchestrator.tests.helpers import init_repository

SUB = "projects/demo"
PASSING_TEST = "def test_q():\n    assert True\n"


def git(repo: Path, *args: str) -> None:
    subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True)


def write(repo: Path, name: str, text: str = "x = 1\n") -> None:
    path = repo / SUB / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def commit_agent_work(repo: Path) -> None:
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", "agent work")


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    path = tmp_path / "repo"
    init_repository(path)
    git(path, "checkout", "-q", "-b", "development")
    write(path, "backend/old.py")
    write(path, "backend/test_old.py", PASSING_TEST)
    write(path, "frontend/old.test.js")
    commit_agent_work(path)
    git(path, "checkout", "-q", "-b", "agent/task-1")
    return path


def gate(runner=None, **kwargs) -> tuple[VerificationRunner, MagicMock]:
    if runner is None:
        runner = MagicMock()
        runner.run.return_value = AgentExecutionResult(0, "ok", "", None)

    return (
        VerificationRunner(
            runner=runner, project_subdir=SUB, base_branch="development", **kwargs
        ),
        runner,
    )


def commands(runner: MagicMock) -> list[list[str]]:
    return [call.args[0] for call in runner.run.call_args_list]


def test_only_the_new_python_tests_run_never_the_existing_ones(repo: Path) -> None:
    write(repo, "backend/quiz.py")
    write(repo, "backend/test_quiz.py", PASSING_TEST)
    commit_agent_work(repo)
    verification, runner = gate()

    results = verification.run_checks(repo)

    syntax, tests = commands(runner)
    assert syntax[:3] == [sys.executable, "-m", "py_compile"]
    assert "backend/quiz.py" in syntax and "backend/old.py" not in syntax
    assert tests[:4] == [sys.executable, "-m", "pytest", "-q"]
    assert tests[4:] == ["backend/test_quiz.py"]
    assert [r.check_name for r in results] == ["python_syntax", "unit_tests"]
    assert all(call.kwargs["cwd"] == repo / SUB for call in runner.run.call_args_list)


def test_uncommitted_and_untracked_work_is_included(repo: Path) -> None:
    write(repo, "backend/test_new.py", PASSING_TEST)
    write(repo, "backend/test_old.py", "def test_old():\n    assert 1 == 1\n")
    verification, runner = gate()

    verification.run_checks(repo)

    tests = commands(runner)[-1]
    assert sorted(tests[4:]) == ["backend/test_new.py", "backend/test_old.py"]


def test_with_no_new_tests_nothing_is_run_and_script_tests_are_listed(
    repo: Path,
) -> None:
    write(repo, "frontend/quiz.test.js")
    commit_agent_work(repo)
    verification, runner = gate()

    results = verification.run_checks(repo)

    assert runner.run.call_count == 0
    assert [r.check_name for r in results] == ["unit_tests"]
    assert results[0].passed and "frontend/quiz.test.js" in results[0].details


def test_files_outside_the_project_and_deleted_files_are_ignored(repo: Path) -> None:
    (repo / "orchestrator_test.py").write_text("x = 1\n", encoding="utf-8")
    (repo / SUB / "backend" / "old.py").unlink()
    commit_agent_work(repo)
    verification, runner = gate()

    results = verification.run_checks(repo)

    assert runner.run.call_count == 0 and results[0].passed


def test_a_failing_new_test_fails_the_gate_with_its_output(repo: Path) -> None:
    write(repo, "backend/test_quiz.py", "def test_q():\n    assert False\n")
    commit_agent_work(repo)
    runner = MagicMock()
    runner.run.side_effect = [
        AgentExecutionResult(0, "", "", None),
        AgentExecutionResult(1, "1 failed", "", None),
    ]
    verification, _ = gate(runner)

    results = verification.run_checks(repo)

    assert [r.passed for r in results] == [True, False]
    assert "1 failed" in results[1].details


def test_a_timeout_is_a_failed_check(repo: Path) -> None:
    write(repo, "backend/test_quiz.py", PASSING_TEST)
    commit_agent_work(repo)
    runner = MagicMock()
    runner.run.side_effect = AgentExecutionError("took too long")
    verification, _ = gate(runner)

    results = verification.run_checks(repo)

    assert not any(r.passed for r in results)
    assert "took too long" in results[0].details


def test_an_unknown_base_branch_fails_instead_of_passing_silently(repo: Path) -> None:
    verification, runner = gate()
    verification.base_branch = "nope"

    results = verification.run_checks(repo)

    assert not results[0].passed and runner.run.call_count == 0


def test_a_project_test_command_still_wins(repo: Path) -> None:
    verification, runner = gate(test_command="make test")

    verification.run_checks(repo)

    assert commands(runner) == [["make", "test"]]


def test_without_a_project_the_default_checks_are_unchanged(repo: Path) -> None:
    runner = MagicMock()
    runner.run.return_value = AgentExecutionResult(0, "", "", None)

    VerificationRunner(runner=runner).run_checks(repo)

    assert len(commands(runner)) == 3
