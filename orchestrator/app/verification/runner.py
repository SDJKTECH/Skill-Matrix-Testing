# Runs the verification checks: pytest, ruff check and ruff format --check.
# Each runs in a clean environment with a timeout and returns its output.
import re
import shlex
import sys
from dataclasses import dataclass
from pathlib import Path

from orchestrator.app.agents.agent_runner import (
    SECRET_ENV_VARS,
    AgentExecutionError,
    ProcessRunner,
    SubprocessRunner,
)
from orchestrator.app.core.config import Settings
from orchestrator.app.core.exceptions import OrchestratorError
from orchestrator.app.vcs.git_manager import changed_paths, files_changed_since


def check_strip_env() -> set[str]:
    """Env vars hidden from checks: secrets and the orchestrator's own settings.

    The checked project must run in a clean environment, not the one the
    orchestrator was configured with.
    """
    return set(SECRET_ENV_VARS) | {name.upper() for name in Settings.model_fields}


@dataclass(frozen=True)
class VerificationCheckResult:
    """The outcome of one check: name, passed, and its output."""

    check_name: str
    passed: bool
    details: str


_PYTHON_TEST = re.compile(r"(^|/)(test_[^/]*|[^/]*_test)\.py$")
_SCRIPT_TEST = re.compile(r"\.(test|spec)\.[cm]?[jt]sx?$")


class VerificationRunner:
    """Runs the quality checks in a task's worktree."""

    def __init__(
        self,
        runner: ProcessRunner | None = None,
        timeout_seconds: int = 300,
        ruff_target: str = "orchestrator",
        test_command: str | None = None,
        lint_command: str | None = None,
        project_subdir: str | None = None,
        base_branch: str = "main",
    ) -> None:
        self.runner = runner or SubprocessRunner(strip_env=check_strip_env())
        self.timeout_seconds = timeout_seconds
        self.ruff_target = ruff_target
        self.test_command = test_command
        self.lint_command = lint_command
        self.project_subdir = project_subdir
        self.base_branch = base_branch

    def run_checks(self, worktree: Path) -> list[VerificationCheckResult]:
        """Run the checks and return one result each.

        By default: pytest, ruff check and ruff format --check on the worktree.
        With a project test_command: that command (and lint_command if set), run
        inside the project folder of the worktree.
        """
        if not self.test_command and self.project_subdir:
            return self._check_new_work(worktree)

        cwd = worktree

        if self.test_command:
            checks = [("unit_tests", shlex.split(self.test_command))]
            if self.lint_command:
                checks.append(("lint", shlex.split(self.lint_command)))
            if self.project_subdir and (worktree / self.project_subdir).is_dir():
                cwd = worktree / self.project_subdir
        else:
            checks = [
                ("unit_tests", [sys.executable, "-m", "pytest", "-v"]),
                (
                    "ruff_check",
                    [sys.executable, "-m", "ruff", "check", self.ruff_target],
                ),
                (
                    "ruff_format",
                    [
                        sys.executable,
                        "-m",
                        "ruff",
                        "format",
                        "--check",
                        self.ruff_target,
                    ],
                ),
            ]

        results: list[VerificationCheckResult] = []

        for check_name, command in checks:
            try:
                execution = self.runner.run(
                    command,
                    cwd=cwd,
                    timeout_seconds=self.timeout_seconds,
                )
                details = "\n".join(
                    part
                    for part in (
                        f"Command: {' '.join(command)}",
                        f"Exit code: {execution.return_code}",
                        execution.stdout,
                        execution.stderr,
                    )
                    if part
                )
                results.append(
                    VerificationCheckResult(
                        check_name=check_name,
                        passed=execution.return_code == 0,
                        details=details,
                    )
                )
            except AgentExecutionError as exc:
                results.append(
                    VerificationCheckResult(
                        check_name=check_name,
                        passed=False,
                        details=f"Command: {' '.join(command)}\nError: {exc}",
                    )
                )

        return results

    # ----- a project with no test command of its own -----

    def _new_files(self, worktree: Path) -> list[str] | None:
        """Files this task added or changed inside the project (not older code).

        Compared with the base branch, plus anything not yet committed. Paths are
        relative to the project folder. None when the base branch cannot be found,
        as then nothing can be said about what the task changed.
        """
        changed: set[str] = set(changed_paths(worktree))
        compared = False

        for base in (self.base_branch, f"origin/{self.base_branch}"):
            try:
                changed |= set(files_changed_since(worktree, base))
                compared = True
                break
            except OrchestratorError:
                continue

        if not compared:
            return None

        prefix = (self.project_subdir or "").strip("/") + "/"
        return sorted(
            path[len(prefix) :]
            for path in changed
            if path.startswith(prefix) and (worktree / path).is_file()
        )

    def _check_new_work(self, worktree: Path) -> list[VerificationCheckResult]:
        """Run only what the agents added: their new Python tests, and a syntax check.

        The project's existing code and tests are never run. Script tests (jest,
        vitest) are listed but not run, as the project's packages are not installed
        in a worktree.
        """
        folder = worktree / (self.project_subdir or "")
        files = self._new_files(worktree)

        if files is None:
            return [
                VerificationCheckResult(
                    "new_work",
                    False,
                    f"Could not compare with the base branch '{self.base_branch}', "
                    "so the task's new files are unknown.",
                )
            ]

        python_files = [name for name in files if name.endswith(".py")]
        python_tests = [name for name in python_files if _PYTHON_TEST.search(name)]
        script_tests = [name for name in files if _SCRIPT_TEST.search(name)]
        results: list[VerificationCheckResult] = []

        if python_files:
            results.append(
                self._run(
                    "python_syntax",
                    [sys.executable, "-m", "py_compile", *python_files],
                    folder,
                )
            )

        if python_tests:
            results.append(
                self._run(
                    "unit_tests",
                    [sys.executable, "-m", "pytest", "-q", *python_tests],
                    folder,
                )
            )
        else:
            note = "No new or changed Python test files, so no tests were run."
            if script_tests:
                note += " Script tests were not run: " + ", ".join(script_tests)
            results.append(VerificationCheckResult("unit_tests", True, note))

        return results

    def _run(
        self, check_name: str, command: list[str], cwd: Path
    ) -> VerificationCheckResult:
        """Run one check command; a start failure or timeout is a failed check."""
        try:
            execution = self.runner.run(
                command, cwd=cwd, timeout_seconds=self.timeout_seconds
            )
        except AgentExecutionError as exc:
            return VerificationCheckResult(
                check_name, False, f"Command: {' '.join(command)}\nError: {exc}"
            )

        details = "\n".join(
            part
            for part in (
                f"Command: {' '.join(command)}",
                f"Exit code: {execution.return_code}",
                execution.stdout,
                execution.stderr,
            )
            if part
        )
        return VerificationCheckResult(check_name, execution.return_code == 0, details)
