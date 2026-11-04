# Runs the Jira Publisher agent for the chat page. One page session = one Claude Code
# conversation (resumed on every message).
#
# The agent searches and proposes; it never writes to Jira. Its proposal ends with a
# machine-readable plan block, which the server checks and keeps. Only when the user's
# message is exactly "confirm" does the server create that plan, through the guarded
# JiraPublisher. Any other message replaces the proposal, so a changed proposal always
# needs a new "confirm".
import json
import logging
import os
import re
import sys
import threading
import uuid
from collections.abc import Callable
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
from orchestrator.app.jira.client import make_jira_api
from orchestrator.app.planning.planner import result_text
from orchestrator.app.publisher.guard import (
    JiraPublisher,
    PublishResult,
    StoryDraft,
    parse_plan,
)

logger = logging.getLogger(__name__)

PUBLISHER_TIMEOUT_SECONDS = 900
MAX_MESSAGE_CHARS = 20000
CLI_PREFIX = "python -m orchestrator.app.publisher.cli"
ALLOWED_TOOLS = [f"Bash({CLI_PREFIX}:*)"]
_PLAN_BLOCK = re.compile(r"```plan\s*(\{.*?\})\s*```", re.DOTALL)


class PublisherError(OrchestratorError):
    """The publisher chat could not answer."""


@dataclass(frozen=True)
class Reply:
    """What the page shows: the text, and whether a plan is waiting for confirm."""

    session_id: str
    text: str
    can_confirm: bool


class VenvRunner(SubprocessRunner):
    """Runs the agent with this server's Python first on PATH, so its `python` works."""

    def _environment(self) -> dict[str, str]:
        env = super()._environment()
        path_key = next((key for key in env if key.upper() == "PATH"), "PATH")
        env[path_key] = (
            str(Path(sys.executable).parent) + os.pathsep + env.get(path_key, "")
        )
        return env


@dataclass
class ChatSession:
    claude_session: str | None = None
    plan: list[StoryDraft] | None = None
    # What happened outside the agent (the creation), told to it on the next turn.
    note: str = ""


def count_line(drafts: list[StoryDraft]) -> str:
    """e.g. '3 Stories, 15 Subtasks', counted from the plan itself."""
    subtasks = sum(len(draft.subtasks) for draft in drafts)
    return f"{len(drafts)} Stories, {subtasks} Subtasks"


def extract_plan(
    text: str, project: str = "SMT"
) -> tuple[str, list[StoryDraft] | None, str | None]:
    """Split a reply into (text to show, validated plan or None, problem or None)."""
    matches = _PLAN_BLOCK.findall(text)
    shown = _PLAN_BLOCK.sub("", text).strip()

    if not matches:
        return shown, None, None

    try:
        return shown, parse_plan(json.loads(matches[-1]), project), None
    except (json.JSONDecodeError, OrchestratorError) as exc:
        return shown, None, str(exc)


def report(result: PublishResult) -> str:
    """The outcome of creating a plan, in plain text."""
    lines = [
        f"  {item.issue_type} {item.key} (under {item.parent})  {item.summary}"
        for item in result.created
    ]

    if result.ok:
        return (
            "Created and verified in Jira. Every Story is under its Epic and every "
            "Subtask is under its Story.\n" + "\n".join(lines)
        )

    head = "Not everything was created or verified."
    if result.failed:
        head += f"\nStopped at {result.failed}: {result.error}"
    for problem in result.problems:
        head += f"\n- {problem}"
    made = "\n".join(lines) or "  (nothing was created)"
    return f"{head}\nWhat exists in Jira now:\n{made}"


class PublisherChat:
    """Keeps the page sessions and talks to the jira-publisher agent."""

    def __init__(
        self,
        settings: Settings,
        runner: ProcessRunner | None = None,
        publisher_factory: Callable[[], JiraPublisher] | None = None,
    ) -> None:
        self.settings = settings
        self.runner = runner or VenvRunner()
        self.publisher_factory = publisher_factory or (
            lambda: JiraPublisher(make_jira_api(settings), settings)
        )
        self.sessions: dict[str, ChatSession] = {}
        self._lock = threading.Lock()

    def send(self, session_id: str | None, message: str) -> Reply:
        """Handle one user message; return what to show."""
        message = message.strip()

        if not message:
            raise PublisherError("Write a requirement or a reply first.")

        if len(message) > MAX_MESSAGE_CHARS:
            raise PublisherError(
                f"Keep the message under {MAX_MESSAGE_CHARS} characters."
            )

        session_id, session = self._session(session_id)

        if re.fullmatch(r"confirm\.?", message, re.IGNORECASE):
            return self._create(session_id, session)

        session.plan = None  # Any other message withdraws the proposal.
        prompt = f"{session.note}\n\n{message}" if session.note else message
        session.note = ""
        shown, plan, problem = extract_plan(
            self._ask(session, prompt), self.settings.publisher_project
        )
        session.plan = plan

        if plan is not None:
            shown += (
                f"\n\nReady to create: {count_line(plan)}. Press Confirm to create "
                "them in Jira, or tell me what to change."
            )
        elif problem:
            shown += (
                f"\n\n(The plan could not be used: {problem} Ask me to restate the "
                "proposal.)"
            )

        return Reply(session_id, shown, plan is not None)

    def _create(self, session_id: str, session: ChatSession) -> Reply:
        plan, session.plan = session.plan, None  # One confirmation, one attempt.

        if plan is None:
            raise PublisherError("There is no proposal to confirm yet.")

        try:
            result = self.publisher_factory().publish(plan)
        except OrchestratorError as exc:
            raise PublisherError(f"Nothing was created: {exc}") from exc

        text = report(result)
        session.note = (
            f"[System: the user confirmed and the system created it.]\n{text}"
        )
        logger.info("Publisher created: ok=%s items=%s", result.ok, len(result.created))
        return Reply(session_id, text, False)

    def _session(self, session_id: str | None) -> tuple[str, ChatSession]:
        with self._lock:
            if session_id and session_id in self.sessions:
                return session_id, self.sessions[session_id]

            new_id = uuid.uuid4().hex
            self.sessions[new_id] = ChatSession()
            return new_id, self.sessions[new_id]

    def _ask(self, session: ChatSession, prompt: str) -> str:
        if self.settings.repository_path is None:
            raise PublisherError("No repository_path is configured.")

        repository = Path(self.settings.repository_path)

        try:
            decision = ModelRouter(self.settings).route(
                role="jira-publisher",
                definition=repository / ".claude" / "agents" / "jira-publisher.md",
            )
            command = build_claude_command(
                claude_command=resolve_executable(self.settings.claude_command),
                prompt=prompt,
                model=decision.model,
                effort=decision.effort,
                max_budget_usd=self.settings.max_task_cost_usd,
                agent="jira-publisher",
                permission_mode=self.settings.claude_permission_mode,
                allowed_tools=ALLOWED_TOOLS,
                resume=session.claude_session,
            )
            result = self.runner.run(
                command, cwd=repository, timeout_seconds=PUBLISHER_TIMEOUT_SECONDS
            )
        except (OrchestratorError, ValueError) as exc:
            raise PublisherError(f"The publisher could not run: {exc}") from exc

        if result.return_code != 0:
            raise PublisherError(
                "The publisher failed: "
                + re.sub(r"\s+", " ", result.stderr or result.stdout)[:300]
            )

        session.claude_session = _session_id(result.stdout) or session.claude_session
        return result_text(result.stdout)


def _session_id(stdout: str) -> str | None:
    """The Claude conversation id from the agent's JSON output."""
    try:
        payload = json.loads(stdout)
    except (json.JSONDecodeError, TypeError):
        return None

    value = payload.get("session_id") if isinstance(payload, dict) else None
    if isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9-]+", value):
        return value
    return None
