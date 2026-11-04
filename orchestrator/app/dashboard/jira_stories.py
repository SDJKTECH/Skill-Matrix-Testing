# Lists the Jira Stories of the project for the dashboard's Stories tab: each Story with
# its Epic and sub-tasks, and whether the sub-tasks have acceptance criteria. Read-only;
# the dashboard's Plan and Start buttons call the story endpoints.
from pydantic import BaseModel

from orchestrator.app.jira.client import JiraApi, adf_to_text, quote_jql
from orchestrator.app.jira.story import acceptance_criteria

MAX_STORIES = 100
_FIELDS = ["summary", "status", "parent", "description"]


class JiraSubtaskView(BaseModel):
    key: str
    summary: str
    status: str
    has_criteria: bool


class JiraStoryView(BaseModel):
    key: str
    summary: str
    status: str
    epic_key: str | None = None
    epic_summary: str | None = None
    subtasks: list[JiraSubtaskView] = []
    # Why the Story cannot be planned yet (empty = ready).
    problems: list[str] = []


def _status(fields: dict) -> str:
    status = fields.get("status") or {}
    return str(status.get("name", "")) if isinstance(status, dict) else ""


def _has_criteria(fields: dict) -> bool:
    description = fields.get("description")
    text = adf_to_text(description) if description else ""
    return bool(acceptance_criteria(text))


def list_jira_stories(
    api: JiraApi, project: str, story_type: str = "Story"
) -> list[JiraStoryView]:
    """Every Story of the project, with its Epic and sub-tasks."""
    stories = api.search(
        f"project = {project} AND issuetype = {quote_jql(story_type)} ORDER BY key ASC",
        MAX_STORIES,
        _FIELDS,
    )

    if not stories:
        return []

    keys = ", ".join(str(story["key"]) for story in stories)
    children = api.search(
        f"project = {project} AND parent in ({keys}) ORDER BY key ASC",
        MAX_STORIES * 30,
        _FIELDS,
    )
    by_parent: dict[str, list[JiraSubtaskView]] = {}

    for child in children:
        fields = child.get("fields") or {}
        parent = (fields.get("parent") or {}).get("key")
        by_parent.setdefault(str(parent), []).append(
            JiraSubtaskView(
                key=str(child["key"]),
                summary=str(fields.get("summary", "")),
                status=_status(fields),
                has_criteria=_has_criteria(fields),
            )
        )

    views = []
    for story in stories:
        fields = story.get("fields") or {}
        epic = fields.get("parent") or {}
        epic_fields = epic.get("fields") or {} if isinstance(epic, dict) else {}
        subtasks = by_parent.get(str(story["key"]), [])
        problems = []

        if not subtasks:
            problems.append("The Story has no sub-tasks.")

        missing = [sub.key for sub in subtasks if not sub.has_criteria]
        if missing:
            problems.append("No acceptance criteria in: " + ", ".join(missing))

        views.append(
            JiraStoryView(
                key=str(story["key"]),
                summary=str(fields.get("summary", "")),
                status=_status(fields),
                epic_key=epic.get("key") if isinstance(epic, dict) else None,
                epic_summary=epic_fields.get("summary"),
                subtasks=subtasks,
                problems=problems,
            )
        )

    return views
