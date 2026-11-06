# Asks the read-only story-sequencer agent to order the sub-tasks of one Jira Story,
# then checks its answer against Jira and the code. The sequencer orders; it never
# re-plans: a plan that adds, drops or changes sub-tasks is rejected.
import json
import logging
import re
import subprocess
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath

from orchestrator.app.agents.agent_runner import (
    ProcessRunner,
    SubprocessRunner,
    build_claude_command,
    resolve_executable,
)
from orchestrator.app.agents.model_router import ModelRouter
from orchestrator.app.core.config import Settings
from orchestrator.app.core.exceptions import OrchestratorError, PlanningError
from orchestrator.app.jira.story import StoryBundle
from orchestrator.app.planning.planner import result_text

logger = logging.getLogger(__name__)

SEQUENCER_TIMEOUT_SECONDS = 600
READ_ONLY_TOOLS = ["Read", "Grep", "Glob"]
COMPLEXITIES = ("small", "medium", "large")
MAX_FILE_LIST = 3000
MAX_TEXT = 2000


@dataclass
class TaskPlan:
    """What the sequencer decided for one sub-task."""

    key: str
    files: list[str] = field(default_factory=list)
    new_files: list[str] = field(default_factory=list)
    depends_on: list[str] = field(default_factory=list)
    parallel_safe: bool = True
    complexity: str = "medium"
    verification: str = ""
    expected_outcome: str = ""
    context_notes: str = ""
    concerns: list[str] = field(default_factory=list)


@dataclass
class StoryPlan:
    """A validated plan: one TaskPlan per Jira sub-task, in Jira's order."""

    story_key: str
    doc_target: str
    tasks: list[TaskPlan]
    concerns: list[str] = field(default_factory=list)

    def to_json(self) -> str:
        return json.dumps(
            {
                "story_key": self.story_key,
                "doc_target": self.doc_target,
                "concerns": self.concerns,
                "tasks": {task.key: task.__dict__ for task in self.tasks},
            },
            indent=2,
        )


def project_files(project_folder: Path) -> list[str]:
    """Tracked files of the project folder, relative to it (reads git, runs no code)."""
    result = subprocess.run(
        ["git", "ls-files"],
        cwd=project_folder,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
    )

    if result.returncode != 0:
        raise PlanningError(
            f"Could not list files in {project_folder}: {result.stderr}"
        )

    return [line for line in result.stdout.splitlines() if line.strip()]


def build_prompt(bundle: StoryBundle, docs_dir: str, files: list[str]) -> str:
    """The message that asks the sequencer to order a Story's sub-tasks."""
    epic = (
        f"Epic {bundle.epic.key}: {bundle.epic.summary}\n{bundle.epic.description}\n\n"
        if bundle.epic
        else ""
    )
    tasks = "\n\n".join(
        f"[{task.key}] {task.summary}\n"
        f"{task.description[:MAX_TEXT] or '(no description)'}\n"
        "Acceptance criteria:\n" + "\n".join(f"- {item}" for item in task.criteria)
        for task in bundle.sub_tasks
    )
    listed = files[:MAX_FILE_LIST]
    more = (
        f"\n... and {len(files) - len(listed)} more" if len(files) > len(listed) else ""
    )
    return (
        f"Sequence the sub-tasks of Jira Story {bundle.story.key}. The docs folder "
        f"is `{docs_dir}`. Follow your instructions: read CLAUDE.md, then the docs "
        "folder, then only the files the docs point to. Do not add, drop, merge or "
        "split sub-tasks and do not change their acceptance criteria.\n\n"
        + epic
        + f"Story {bundle.story.key}: {bundle.story.summary}\n"
        f"{bundle.story.description[:MAX_TEXT]}\n\n"
        f"Sub-tasks:\n\n{tasks}\n\n"
        "Files in the project (relative paths):\n"
        + "\n".join(listed)
        + more
        + "\n\nReply with only the JSON object described in your instructions."
    )


def _strings(value: object) -> list[str]:
    return [str(item) for item in value] if isinstance(value, list) else []


def _clean_path(path: str) -> str | None:
    """A normalised project-relative path, or None if it is absolute or escapes."""
    pure = PurePosixPath(path.replace("\\", "/"))

    if pure.is_absolute() or ".." in pure.parts or not pure.parts:
        return None

    return str(pure)


def _has_cycle(graph: dict[str, list[str]]) -> bool:
    state: dict[str, int] = {}

    def visit(node: str) -> bool:
        if state.get(node) == 1:
            return True
        if state.get(node) == 2:
            return False
        state[node] = 1
        if any(visit(other) for other in graph.get(node, [])):
            return True
        state[node] = 2
        return False

    return any(visit(node) for node in graph)


def _reaches(graph: dict[str, list[str]], start: str, target: str) -> bool:
    seen: set[str] = set()
    stack = [start]

    while stack:
        node = stack.pop()
        if node == target:
            return True
        if node not in seen:
            seen.add(node)
            stack.extend(graph.get(node, []))

    return False


def validate_plan(
    text: str, bundle: StoryBundle, files: list[str], docs_dir: str
) -> StoryPlan:
    """Parse the sequencer's reply and check it; raise PlanningError on problems."""
    start, end = text.find("{"), text.rfind("}")

    try:
        data = json.loads(text[start : end + 1]) if 0 <= start < end else None
    except json.JSONDecodeError:
        data = None

    if not isinstance(data, dict) or not isinstance(data.get("tasks"), dict):
        raise PlanningError("The sequencer did not answer with a JSON plan.")

    errors: list[str] = []
    jira_keys = [task.key for task in bundle.sub_tasks]
    planned = data["tasks"]
    added = sorted(set(planned) - set(jira_keys))
    dropped = [key for key in jira_keys if key not in planned]

    if added:
        errors.append(f"added sub-tasks that are not in Jira: {', '.join(added)}")
    if dropped:
        errors.append(f"left out Jira sub-tasks: {', '.join(dropped)}")

    known = set(files)
    graph: dict[str, list[str]] = {}
    plans: dict[str, TaskPlan] = {}
    notes: list[str] = []
    # A file another sub-task of this Story creates does not exist yet, but a
    # sub-task may build on it (for example a screen on the component before it).
    created_by: dict[str, str] = {}
    for key in jira_keys:
        entry = planned.get(key)
        if isinstance(entry, dict):
            for path in _strings(entry.get("new_files")):
                cleaned_path = _clean_path(path)
                if cleaned_path:
                    created_by.setdefault(cleaned_path, key)

    for key in jira_keys:
        entry = planned.get(key)
        if not isinstance(entry, dict):
            continue

        task_files = [path.replace("\\", "/") for path in _strings(entry.get("files"))]
        unknown = [
            path for path in task_files if path not in known and path not in created_by
        ]
        if unknown:
            errors.append(f"{key} names files not in the file list: {unknown}")

        new_files = _strings(entry.get("new_files"))
        cleaned = [_clean_path(path) for path in new_files]
        if any(path is None for path in cleaned):
            errors.append(f"{key} has a new file outside the project: {new_files}")

        depends = _strings(entry.get("depends_on"))
        for path in task_files:
            maker = created_by.get(path)
            if path not in known and maker and maker != key and maker not in depends:
                depends.append(maker)
                notes.append(
                    f"{key} waits for {maker}: it uses {path}, which {maker} creates"
                )
        bad = [dep for dep in depends if dep not in jira_keys or dep == key]
        if bad:
            errors.append(f"{key} depends on an unknown key or itself: {bad}")
        graph[key] = [dep for dep in depends if dep in jira_keys and dep != key]

        complexity = str(entry.get("complexity", "")).lower()
        if complexity not in COMPLEXITIES:
            errors.append(f"{key} has complexity '{complexity}', not {COMPLEXITIES}")

        plans[key] = TaskPlan(
            key=key,
            files=task_files,
            new_files=[path for path in cleaned if path],
            depends_on=list(graph[key]),
            parallel_safe=bool(entry.get("parallel_safe", True)),
            complexity=complexity if complexity in COMPLEXITIES else "medium",
            verification=str(entry.get("verification", ""))[:MAX_TEXT],
            expected_outcome=str(entry.get("expected_outcome", ""))[:MAX_TEXT],
            context_notes=str(entry.get("context_notes", ""))[:MAX_TEXT],
            concerns=_strings(entry.get("concerns")),
        )

    if _has_cycle(graph):
        errors.append("the depends_on links form a cycle")

    doc_target = _clean_path(str(data.get("doc_target", "")))
    docs_root = docs_dir.strip().strip("/\\")

    if not doc_target or not doc_target.endswith(".md"):
        errors.append("doc_target must be a relative .md path")
    elif not doc_target.startswith(docs_root + "/"):
        errors.append(f"doc_target '{doc_target}' is outside the docs folder")

    if errors:
        raise PlanningError(
            "The sequencer's plan was rejected:\n- " + "\n- ".join(errors)
        )

    concerns = _strings(data.get("concerns")) + notes
    _serialise_shared_files(plans, jira_keys, graph, concerns)

    return StoryPlan(
        story_key=bundle.story.key,
        doc_target=doc_target or "",
        tasks=[plans[key] for key in jira_keys],
        concerns=concerns,
    )


def _serialise_shared_files(
    plans: dict[str, TaskPlan],
    order: list[str],
    graph: dict[str, list[str]],
    concerns: list[str],
) -> None:
    """Order sub-tasks that touch the same file, so parallel edits cannot collide.

    The later sub-task (in Jira order) is made to depend on the earlier one, and a
    concern says so. Sub-tasks already ordered by depends_on are left alone.
    """
    touched = {key: set(plans[key].files) | set(plans[key].new_files) for key in order}

    for index, later in enumerate(order):
        for earlier in order[:index]:
            shared = touched[later] & touched[earlier]

            if (
                shared
                and not _reaches(graph, later, earlier)
                and not _reaches(graph, earlier, later)
            ):
                graph[later].append(earlier)
                plans[later].depends_on.append(earlier)
                concerns.append(
                    f"{later} waits for {earlier}: both change {sorted(shared)[0]}"
                )


class StorySequencer:
    """Runs the story-sequencer agent and validates what it answers."""

    def __init__(self, settings: Settings, runner: ProcessRunner | None = None) -> None:
        self.settings = settings
        self.runner = runner or SubprocessRunner()

    def plan(
        self, bundle: StoryBundle, project_folder: Path, docs_dir: str
    ) -> StoryPlan:
        """Plan the Story; raise PlanningError if the agent fails or its plan is bad."""
        if self.settings.repository_path is None:
            raise PlanningError("No repository_path is configured.")

        repository = Path(self.settings.repository_path)
        files = project_files(project_folder)

        try:
            decision = ModelRouter(self.settings).route(
                role="story-sequencer",
                definition=repository / ".claude" / "agents" / "story-sequencer.md",
            )
            command = build_claude_command(
                claude_command=resolve_executable(self.settings.claude_command),
                prompt=build_prompt(bundle, docs_dir, files),
                model=decision.model,
                effort=decision.effort,
                max_budget_usd=self.settings.max_task_cost_usd,
                agent="story-sequencer",
                agent_definition=repository
                / ".claude"
                / "agents"
                / "story-sequencer.md",
                permission_mode=self.settings.claude_permission_mode,
                allowed_tools=READ_ONLY_TOOLS,
            )
            result = self.runner.run(
                command,
                cwd=project_folder,
                timeout_seconds=SEQUENCER_TIMEOUT_SECONDS,
            )
        except (OrchestratorError, ValueError) as exc:
            raise PlanningError(f"The story sequencer could not run: {exc}") from exc

        if result.return_code != 0:
            raise PlanningError(
                "The story sequencer failed: "
                + re.sub(r"\s+", " ", result.stderr or result.stdout)[:300]
            )

        return validate_plan(result_text(result.stdout), bundle, files, docs_dir)
