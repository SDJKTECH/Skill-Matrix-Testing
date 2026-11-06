# Asks the documenter agent to write the feature document of a finished Story, on the
# Story's branch, before its pull request opens. The agent may only change files inside
# the project's docs folder, and every file it names in the document must exist.
# One retry; if it still fails the changes are thrown away and the Story is left for
# a person to document ("needs review"). The documenter never blocks the code's PR.
import logging
import re
from dataclasses import dataclass
from pathlib import Path

from orchestrator.app.agents.agent_runner import (
    ProcessRunner,
    SubprocessRunner,
    build_claude_command,
    resolve_executable,
)
from orchestrator.app.agents.model_router import ModelRouter
from orchestrator.app.core.config import Settings
from orchestrator.app.core.exceptions import OrchestratorError
from orchestrator.app.vcs.git_manager import (
    changed_paths,
    commit_worktree,
    discard_changes,
    files_changed_since,
)

logger = logging.getLogger(__name__)

DOCUMENTER_TIMEOUT_SECONDS = 600
DOCUMENTER_TOOLS = ["Read", "Grep", "Glob", "Write", "Edit"]
MAX_ATTEMPTS = 2
MAX_STORY_TEXT = 3000
MAX_CHANGED_FILES = 100

# A file path written in backticks, e.g. `app/routes.py`.
_FILE_MENTION = re.compile(r"`([\w.\-/]+\.[A-Za-z0-9]{1,6})`")


@dataclass(frozen=True)
class DocResult:
    """How writing the Story's document went."""

    ok: bool
    problems: list[str]
    files: list[str]


def doc_prefix(project_subdir: str | None, docs_dir: str) -> str:
    """The docs folder as a repository-relative path with a trailing slash."""
    parts = [part for part in (project_subdir, docs_dir) if part]
    return "/".join(p.strip("/") for p in parts) + "/"


def check_documents(
    worktree: Path, project_folder: Path, prefix: str
) -> tuple[list[str], list[str]]:
    """Check what the agent changed. Returns (problems, changed document paths)."""
    changed = changed_paths(worktree)
    problems: list[str] = []

    outside = [path for path in changed if not path.startswith(prefix)]
    if outside:
        problems.append(
            "These files are outside the docs folder and must not change: "
            + ", ".join(outside)
        )

    documents = [path for path in changed if path.startswith(prefix)]
    if not documents:
        problems.append("No document was written or updated in the docs folder.")

    for path in documents:
        target = worktree / path

        if not target.is_file():
            continue  # A deleted document names nothing.

        text = target.read_text(encoding="utf-8", errors="replace")
        missing = sorted(
            {
                name
                for name in _FILE_MENTION.findall(text)
                if not _exists(project_folder, name)
            }
        )
        if missing:
            problems.append(
                f"{path} names files that do not exist: " + ", ".join(missing)
            )

    return problems, documents


def _exists(project_folder: Path, name: str) -> bool:
    """True if the project holds this file (a bare name may sit in any folder)."""
    if (project_folder / name).is_file():
        return True

    if "/" in name:
        return False

    return any(project_folder.rglob(name))


class StoryDocumenter:
    """Runs the documenter agent on a Story branch and checks its work."""

    def __init__(self, settings: Settings, runner: ProcessRunner | None = None) -> None:
        self.settings = settings
        self.runner = runner or SubprocessRunner()

    def write(
        self,
        worktree: Path,
        story_text: str,
        doc_target: str,
        changed_files: list[str],
    ) -> DocResult:
        """Write the document in the Story's worktree and commit it.

        The worktree must be clean. On failure after the last attempt the
        worktree is cleaned again and nothing is committed.
        """
        if self.settings.repository_path is None or not self.settings.docs_dir:
            return DocResult(False, ["No docs_dir is configured."], [])

        if changed_paths(worktree):
            return DocResult(False, ["The Story branch has uncommitted changes."], [])

        subdir = self.settings.project_subdir
        project_folder = worktree / subdir if subdir else worktree
        prefix = doc_prefix(subdir, self.settings.docs_dir)
        problems: list[str] = []

        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                self._run_agent(
                    project_folder,
                    self._prompt(story_text, doc_target, changed_files, problems),
                )
            except OrchestratorError as exc:
                problems = [f"The documenter could not run: {exc}"]
            else:
                problems, documents = check_documents(worktree, project_folder, prefix)

                if not problems:
                    commit_worktree(worktree, "Document the Story")
                    return DocResult(True, [], documents)

            logger.warning(
                "Documenter attempt %s failed: %s", attempt, "; ".join(problems)
            )
            discard_changes(worktree)

        return DocResult(False, problems, [])

    def _prompt(
        self,
        story_text: str,
        doc_target: str,
        changed_files: list[str],
        problems: list[str],
    ) -> str:
        docs = doc_prefix(None, self.settings.docs_dir or "")
        listed = "\n".join(f"- {name}" for name in changed_files[:MAX_CHANGED_FILES])
        parts = [
            "You are the documenter. Write the feature document for the finished "
            "Jira Story below.",
            f"Docs folder (the only place you may edit): {docs}",
            f"Write the document at: {doc_target or docs}",
            f"Story:\n{story_text.strip()[:MAX_STORY_TEXT]}",
            f"Files the Story changed (repository paths):\n{listed or '(none listed)'}",
        ]

        if problems:
            parts.append(
                "Your previous attempt was rejected and discarded. Fix this:\n"
                + "\n".join(f"- {problem}" for problem in problems)
            )

        return "\n\n".join(parts)

    def _run_agent(self, project_folder: Path, prompt: str) -> None:
        repository = Path(self.settings.repository_path or "")

        try:
            decision = ModelRouter(self.settings).route(
                role="documenter",
                definition=repository / ".claude" / "agents" / "documenter.md",
            )
            command = build_claude_command(
                claude_command=resolve_executable(self.settings.claude_command),
                prompt=prompt,
                model=decision.model,
                effort=decision.effort,
                max_budget_usd=self.settings.max_task_cost_usd,
                agent="documenter",
                agent_definition=repository / ".claude" / "agents" / "documenter.md",
                permission_mode=self.settings.claude_permission_mode,
                allowed_tools=DOCUMENTER_TOOLS,
            )
            result = self.runner.run(
                command,
                cwd=project_folder,
                timeout_seconds=DOCUMENTER_TIMEOUT_SECONDS,
            )
        except ValueError as exc:
            raise OrchestratorError(str(exc)) from exc

        if result.return_code != 0:
            raise OrchestratorError(
                re.sub(r"\s+", " ", result.stderr or result.stdout)[:300]
            )


def story_changes(worktree: Path, remote: str, base_branch: str) -> list[str]:
    """Files the Story changed against the base branch (remote copy preferred)."""
    for base in (f"{remote}/{base_branch}", base_branch):
        try:
            return files_changed_since(worktree, base)
        except OrchestratorError:
            continue

    return []
