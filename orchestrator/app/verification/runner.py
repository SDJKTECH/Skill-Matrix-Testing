# Runs the verification checks: pytest, ruff check and ruff format --check.
# Each runs in a clean environment with a timeout and returns its output.
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
    ) -> None:
        self.runner = runner or SubprocessRunner(strip_env=check_strip_env())
        self.timeout_seconds = timeout_seconds
        self.ruff_target = ruff_target
        self.test_command = test_command
        self.lint_command = lint_command
        self.project_subdir = project_subdir

    def run_checks(self, worktree: Path) -> list[VerificationCheckResult]:
        """Run the checks and return one result each.

        By default: pytest, ruff check and ruff format --check on the worktree.
        With a project test_command: that command (and lint_command if set), run
        inside the project folder of the worktree.
        """
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
