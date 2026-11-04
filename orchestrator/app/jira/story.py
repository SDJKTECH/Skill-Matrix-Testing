# Reads one Jira Story for a story run: the Story, its Epic and every sub-task with
# the details the planner needs. Read-only; nothing is written to Jira.
import re
from dataclasses import dataclass, field

from orchestrator.app.core.exceptions import IssueSourceError
from orchestrator.app.jira.client import STORY_FIELDS, JiraApi, quote_jql
from orchestrator.app.jira.source import JiraRecord, blockers, read_record

MAX_SUB_TASKS = 100

_CRITERIA_HEADING = re.compile(r"^\W*acceptance\s+criteria\b\W*(.*)$", re.IGNORECASE)
_BULLET = re.compile(r"^\s*(?:[-*•]|\d+[.)]|\[[ xX]\])\s*")


def acceptance_criteria(description: str) -> list[str]:
    """The acceptance criteria listed in a description (empty if it has none).

    Looks for a line starting "Acceptance criteria" and takes what follows: text on
    the same line after the colon, then the lines after it up to the first blank
    line that follows at least one criterion.
    """
    criteria: list[str] = []
    collecting = False

    for raw in description.splitlines():
        line = raw.strip()

        if not collecting:
            match = _CRITERIA_HEADING.match(line)
            if match:
                collecting = True
                if match.group(1).strip():
                    criteria.append(_BULLET.sub("", match.group(1)).strip())
            continue

        if not line:
            if criteria:
                break
            continue

        criteria.append(_BULLET.sub("", line).strip())

    return criteria


@dataclass(frozen=True)
class SubTask:
    """A Story's child issue: what the builder will be asked to do."""

    key: str
    summary: str
    description: str = ""
    criteria: list[str] = field(default_factory=list)
    labels: list[str] = field(default_factory=list)
    priority: str | None = None
    status: str | None = None
    type: str = ""
    url: str = ""
    blocked_by: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class StoryBundle:
    """A Story with its Epic (if any) and sub-tasks, in Jira's creation order."""

    story: JiraRecord
    url: str = ""
    labels: list[str] = field(default_factory=list)
    epic: JiraRecord | None = None
    sub_tasks: list[SubTask] = field(default_factory=list)


def _labels(fields: dict) -> list[str]:
    labels = fields.get("labels")
    return [str(label) for label in labels] if isinstance(labels, list) else []


def _priority(fields: dict) -> str | None:
    priority = fields.get("priority")
    name = priority.get("name") if isinstance(priority, dict) else None
    return str(name) if name else None


def _sub_task(api: JiraApi, item: dict) -> SubTask | None:
    record = read_record(item)

    if record is None:
        return None

    fields = item.get("fields") or {}
    return SubTask(
        key=record.key,
        summary=record.summary,
        description=record.description,
        criteria=acceptance_criteria(record.description),
        labels=_labels(fields),
        priority=_priority(fields),
        status=record.status,
        type=record.type,
        url=api.browse_url(record.key),
        blocked_by=blockers(fields),
    )


def read_story(api: JiraApi, key: str) -> StoryBundle:
    """Read the Story `key`, its Epic and its sub-tasks from Jira.

    Raises IssueSourceError if the issue is missing or has no summary.
    """
    item = api.issue(key, ",".join(STORY_FIELDS))
    story = read_record(item) if item else None

    if story is None:
        raise IssueSourceError(f"Jira issue {key} was not found or has no summary.")

    fields = (item or {}).get("fields") or {}
    epic = None

    if story.parent_key:
        parent = api.issue(story.parent_key)
        epic = read_record(parent) if parent else None

    children = api.search(
        f"parent = {quote_jql(story.key)} ORDER BY created ASC",
        limit=MAX_SUB_TASKS,
        fields=STORY_FIELDS,
    )
    sub_tasks = [task for child in children if (task := _sub_task(api, child))]

    return StoryBundle(
        story=story,
        url=api.browse_url(story.key),
        labels=_labels(fields),
        epic=epic,
        sub_tasks=sub_tasks,
    )
