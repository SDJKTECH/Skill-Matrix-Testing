# Runs the Jira Publisher agent for the chat page. One page session = one Claude Code
# conversation (resumed on every message) plus a folder that holds the confirmation.
# The server, not the agent, records "confirm": the agent's create command refuses to
# run without it, and any other message clears it, so a changed proposal needs a
# new one.
import logging
import os
import re
import sys
import tempfile
import threading
import uuid
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
from orchestrator.app.planning.planner import result_text
from orchestrator.app.publisher.cli import CONFIRMED

logger = logging.getLogger(__name__)

PUBLISHER_TIMEOUT_SECONDS = 900
MAX_MESSAGE_CHARS = 20000
CLI_PREFIX = "python -m orchestrator.app.publisher.cli"
ALLOWED_TOOLS = [f"Bash({CLI_PREFIX}:*)"]


class PublisherError(OrchestratorError):
    """The publisher chat could not answer."""


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
    folder: Path
    claude_session: str | None = None


class PublisherChat:
    """Keeps the page sessions and talks to the jira-publisher agent."""

    def __init__(self, settings: Settings, runner: ProcessRunner | None = None) -> None:
        self.settings = settings
        self.runner = runner or VenvRunner()
        self.root = Path(tempfile.gettempdir()) / "jira-publisher"
        self.sessions: dict[str, ChatSession] = {}
        self._lock = threading.Lock()

    def send(self, session_id: str | None, message: str) -> tuple[str, str]:
        """Pass the user's message to the agent; return (session id, its reply)."""
        message = message.strip()

        if not message:
            raise PublisherError("Write a requirement or a reply first.")

        if len(message) > MAX_MESSAGE_CHARS:
            raise PublisherError(
                f"Keep the message under {MAX_MESSAGE_CHARS} characters."
            )

        session_id, session = self._session(session_id)
        marker = session.folder / CONFIRMED
        marker.unlink(missing_ok=True)  # Any message withdraws an earlier confirm.

        if re.fullmatch(r"confirm\.?", message, re.IGNORECASE):
            if session.claude_session is None:
                raise PublisherError("There is no proposal to confirm yet.")
            marker.write_text("confirmed\n", encoding="utf-8")
            prompt = (
                f"SESSION={session.folder}\nThe user replied: confirm. Their "
                "confirmation is recorded for the proposal you last showed. Create "
                "it now with the create command, unchanged."
            )
        else:
            prompt = f"SESSION={session.folder}\n{message}"

        reply = self._ask(session, prompt)
        # A confirmation the agent did not use must not carry over to a later turn.
        marker.unlink(missing_ok=True)
        return session_id, reply

    def _session(self, session_id: str | None) -> tuple[str, ChatSession]:
        with self._lock:
            if session_id and session_id in self.sessions:
                return session_id, self.sessions[session_id]

            new_id = uuid.uuid4().hex
            folder = self.root / new_id
            folder.mkdir(parents=True, exist_ok=True)
            self.sessions[new_id] = ChatSession(folder)
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
    import json

    try:
        payload = json.loads(stdout)
    except (json.JSONDecodeError, TypeError):
        return None

    value = payload.get("session_id") if isinstance(payload, dict) else None
    return (
        value
        if isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9-]+", value)
        else None
    )
