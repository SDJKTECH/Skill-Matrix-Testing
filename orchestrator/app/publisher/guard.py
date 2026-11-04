# The only way the Jira Publisher agent touches Jira. The rules of its brief are
# enforced here, not left to the prompt: one project, Stories and Subtasks only, no
# Epic creation or editing, no deletes, every Subtask under a Story, stop on the first
# failure, and check the result in Jira afterwards.
import re
from dataclasses import dataclass, field

from orchestrator.app.core.config import Settings
from orchestrator.app.core.exceptions import OrchestratorError, PlanningError
from orchestrator.app.jira.client import JiraApi, quote_jql

MAX_STORIES = 15
MAX_SUBTASKS_PER_STORY = 30
MAX_SEARCH_RESULTS = 50
PRIORITIES = {"Highest", "High", "Medium", "Low", "Lowest"}
_LABEL = re.compile(r"[A-Za-z0-9_.-]{1,50}")
_SEARCH_FIELDS = ["summary", "issuetype", "parent", "status"]


@dataclass
class SubtaskDraft:
    summary: str
    description: str
    labels: list[str] = field(default_factory=list)
    priority: str | None = None


@dataclass
class StoryDraft:
    ref: str
    epic: str
    summary: str
    description: str
    subtasks: list[SubtaskDraft] = field(default_factory=list)


@dataclass
class Item:
    """One issue as made (or looked up) in Jira."""

    key: str
    issue_type: str
    summary: str
    parent: str | None


@dataclass
class PublishResult:
    ok: bool
    created: list[Item] = field(default_factory=list)
    failed: str | None = None
    error: str | None = None
    verified: list[Item] = field(default_factory=list)
    problems: list[str] = field(default_factory=list)


def _text(value: object, name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise PlanningError(f"{name} must be a non-empty string.")
    return value.strip()


def parse_plan(data: object, project: str) -> list[StoryDraft]:
    """Turn the agent's JSON plan into drafts, or say what is wrong with it."""
    stories = data.get("stories") if isinstance(data, dict) else None

    if not isinstance(stories, list) or not stories:
        raise PlanningError("The plan needs a non-empty 'stories' list.")

    if len(stories) > MAX_STORIES:
        raise PlanningError(f"A plan may have at most {MAX_STORIES} Stories.")

    epic_pattern = re.compile(rf"{re.escape(project)}-\d+")
    drafts: list[StoryDraft] = []

    for index, raw in enumerate(stories, 1):
        if not isinstance(raw, dict):
            raise PlanningError(f"Story {index} must be an object.")

        epic = _text(raw.get("epic"), f"Story {index} epic")
        if not epic_pattern.fullmatch(epic):
            raise PlanningError(
                f"Story {index}: the Epic must be an existing {project} key, "
                f"not '{epic}'."
            )

        subtasks_raw = raw.get("subtasks", [])
        if not isinstance(subtasks_raw, list):
            raise PlanningError(f"Story {index} subtasks must be a list.")
        if len(subtasks_raw) > MAX_SUBTASKS_PER_STORY:
            raise PlanningError(
                f"Story {index} may have at most {MAX_SUBTASKS_PER_STORY} Subtasks."
            )

        subtasks = []
        for number, sub in enumerate(subtasks_raw, 1):
            if not isinstance(sub, dict):
                raise PlanningError(
                    f"Story {index} Subtask {number} must be an object."
                )
            labels = sub.get("labels") or []
            if not isinstance(labels, list) or not all(
                isinstance(label, str) and _LABEL.fullmatch(label) for label in labels
            ):
                raise PlanningError(
                    f"Story {index} Subtask {number}: labels must be simple words "
                    "without spaces."
                )
            priority = sub.get("priority")
            if priority is not None and priority not in PRIORITIES:
                raise PlanningError(
                    f"Story {index} Subtask {number}: priority must be one of "
                    + ", ".join(sorted(PRIORITIES))
                    + "."
                )
            subtasks.append(
                SubtaskDraft(
                    summary=_text(
                        sub.get("summary"), f"Subtask {index}.{number} summary"
                    ),
                    description=_text(
                        sub.get("description"), f"Subtask {index}.{number} description"
                    ),
                    labels=labels,
                    priority=priority,
                )
            )

        drafts.append(
            StoryDraft(
                ref=str(raw.get("ref") or f"S{index}"),
                epic=epic,
                summary=_text(raw.get("summary"), f"Story {index} summary"),
                description=_text(raw.get("description"), f"Story {index} description"),
                subtasks=subtasks,
            )
        )

    return drafts


def _item(issue: dict) -> Item:
    fields = issue.get("fields") or {}
    parent = fields.get("parent") or {}
    kind = fields.get("issuetype") or {}
    return Item(
        key=str(issue.get("key")),
        issue_type=str(kind.get("name", "")),
        summary=str(fields.get("summary", "")),
        parent=parent.get("key") if isinstance(parent, dict) else None,
    )


class JiraPublisher:
    """Reads and writes SMT through the narrow set of actions the brief allows."""

    def __init__(self, api: JiraApi, settings: Settings) -> None:
        self.api = api
        self.project = settings.publisher_project
        self.epic_type = settings.jira_epic_type
        self.story_type = settings.jira_story_type
        self.subtask_type = settings.jira_subtask_type

    def epics(self) -> list[Item]:
        """Every existing Epic of the project."""
        return self._find(
            f"project = {self.project} AND issuetype = {quote_jql(self.epic_type)} "
            "ORDER BY key ASC"
        )

    def search(self, text: str) -> list[Item]:
        """Epics, Stories and Subtasks of the project that mention `text`."""
        return self._find(
            f"project = {self.project} AND text ~ {quote_jql(text)} ORDER BY key ASC"
        )

    def _find(self, jql: str) -> list[Item]:
        found = self.api.search(jql, MAX_SEARCH_RESULTS, _SEARCH_FIELDS)
        return [_item(issue) for issue in found if issue.get("key")]

    def check_epics(self, drafts: list[StoryDraft]) -> None:
        """Every Story's Epic must exist in the project and be an Epic."""
        for epic in sorted({draft.epic for draft in drafts}):
            issue = self.api.issue(epic, "issuetype,project")
            fields = (issue or {}).get("fields") or {}
            kind = (fields.get("issuetype") or {}).get("name")
            project = (fields.get("project") or {}).get("key")

            if issue is None or project != self.project or kind != self.epic_type:
                raise PlanningError(
                    f"{epic} is not an existing {self.epic_type} in {self.project}. "
                    "Ask the user which Epic to use; Epics are never created here."
                )

    def publish(self, drafts: list[StoryDraft]) -> PublishResult:
        """Create the Stories, then their Subtasks; stop at the first failure."""
        self.check_epics(drafts)
        result = PublishResult(ok=False)
        expected: dict[str, str | None] = {}

        for draft in drafts:
            try:
                story_key = self.api.create_issue(
                    self.project,
                    self.story_type,
                    draft.summary,
                    draft.description,
                    draft.epic,
                )
            except OrchestratorError as exc:
                result.failed, result.error = f"Story '{draft.summary}'", str(exc)
                return result

            expected[story_key] = draft.epic
            result.created.append(
                Item(story_key, self.story_type, draft.summary, draft.epic)
            )

            for sub in draft.subtasks:
                try:
                    key = self.api.create_issue(
                        self.project,
                        self.subtask_type,
                        sub.summary,
                        sub.description,
                        story_key,
                        sub.labels or None,
                        sub.priority,
                    )
                except OrchestratorError as exc:
                    result.failed = f"Subtask '{sub.summary}' under {story_key}"
                    result.error = str(exc)
                    return result

                expected[key] = story_key
                result.created.append(
                    Item(key, self.subtask_type, sub.summary, story_key)
                )

        self.verify(result, expected)
        result.ok = not result.problems
        return result

    def verify(self, result: PublishResult, expected: dict[str, str | None]) -> None:
        """Look every created item up in Jira and compare its type and parent."""
        keys = ", ".join(expected)
        try:
            found = {
                item.key: item
                for item in self._find(f"key in ({keys}) ORDER BY key ASC")
            }
        except OrchestratorError as exc:
            result.problems.append(f"Could not verify in Jira: {exc}")
            return

        result.verified = list(found.values())

        for made in result.created:
            seen = found.get(made.key)

            if seen is None:
                result.problems.append(f"{made.key} was not found in Jira.")
            elif seen.issue_type != made.issue_type or seen.parent != made.parent:
                result.problems.append(
                    f"{made.key} is a {seen.issue_type} under {seen.parent}, "
                    f"expected a {made.issue_type} under {made.parent}."
                )
