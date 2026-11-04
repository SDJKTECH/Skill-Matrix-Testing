import pytest

from orchestrator.app.core.exceptions import IssueSourceError
from orchestrator.app.jira.client import JiraApi
from orchestrator.app.jira.story import acceptance_criteria, read_story


def doc(*paragraphs: str) -> dict:
    return {
        "type": "doc",
        "content": [
            {"type": "paragraph", "content": [{"type": "text", "text": text}]}
            for text in paragraphs
        ],
    }


def bullets(*items: str) -> dict:
    return {
        "type": "bulletList",
        "content": [
            {
                "type": "listItem",
                "content": [
                    {"type": "paragraph", "content": [{"type": "text", "text": item}]}
                ],
            }
            for item in items
        ],
    }


STORY = {
    "key": "SMT-9",
    "fields": {
        "summary": "Export skills report",
        "description": doc("As a manager I want a report."),
        "issuetype": {"name": "Story"},
        "status": {"name": "To Do"},
        "parent": {"key": "SMT-1"},
        "labels": ["reports"],
    },
}
EPIC = {
    "key": "SMT-1",
    "fields": {
        "summary": "Reporting",
        "description": doc("All reports."),
        "issuetype": {"name": "Epic"},
        "status": {"name": "In Progress"},
    },
}
CHILD_1 = {
    "key": "SMT-10",
    "fields": {
        "summary": "Add endpoint",
        "description": {
            "type": "doc",
            "content": [
                doc("Add the endpoint.")["content"][0],
                doc("Acceptance criteria:")["content"][0],
                bullets("Returns 200", "Returns CSV"),
            ],
        },
        "issuetype": {"name": "Sub-task"},
        "status": {"name": "To Do"},
        "labels": ["backend"],
        "priority": {"name": "High"},
    },
}
CHILD_2 = {
    "key": "SMT-11",
    "fields": {
        "summary": "Add button",
        "description": None,
        "issuetype": {"name": "Sub-task"},
        "status": {"name": "To Do"},
        "issuelinks": [
            {
                "type": {"name": "Blocks"},
                "inwardIssue": {"key": "SMT-10"},
            }
        ],
    },
}


def make_api(answers: dict, calls: list):
    def transport(method, path, body):
        calls.append((method, path, body))
        key = path.split("/issue/")[-1].split("?")[0] if "/issue/" in path else None

        if method == "GET" and key in answers:
            return answers[key]

        if method == "POST" and path == "/search/jql":
            return {"issues": answers["children"]}

        return None

    return JiraApi("https://x.atlassian.net", "a@b.c", "t", transport=transport)


def test_reads_story_epic_and_sub_tasks() -> None:
    calls: list = []
    api = make_api(
        {"SMT-9": STORY, "SMT-1": EPIC, "children": [CHILD_1, CHILD_2]}, calls
    )

    bundle = read_story(api, "SMT-9")

    assert bundle.story.key == "SMT-9"
    assert bundle.story.description == "As a manager I want a report."
    assert bundle.labels == ["reports"]
    assert bundle.epic is not None and bundle.epic.key == "SMT-1"
    assert bundle.url == "https://x.atlassian.net/browse/SMT-9"
    first, second = bundle.sub_tasks
    assert (first.key, first.priority, first.labels) == ("SMT-10", "High", ["backend"])
    assert first.criteria == ["Returns 200", "Returns CSV"]
    assert second.criteria == [] and second.blocked_by == ["SMT-10"]


def test_reading_a_story_writes_nothing_to_jira() -> None:
    calls: list = []
    api = make_api({"SMT-9": STORY, "SMT-1": EPIC, "children": []}, calls)

    read_story(api, "SMT-9")

    assert all(method == "GET" or path == "/search/jql" for method, path, _ in calls), (
        calls
    )


def test_story_without_epic_or_sub_tasks() -> None:
    story = {"key": "SMT-9", "fields": {**STORY["fields"], "parent": None}}
    api = make_api({"SMT-9": story, "children": []}, [])

    bundle = read_story(api, "SMT-9")

    assert bundle.epic is None and bundle.sub_tasks == []


def test_missing_story_is_an_error() -> None:
    with pytest.raises(IssueSourceError):
        read_story(make_api({"children": []}, []), "SMT-404")


def test_child_search_asks_for_the_story_children_in_order() -> None:
    calls: list = []
    api = make_api({"SMT-9": STORY, "SMT-1": EPIC, "children": []}, calls)

    read_story(api, "SMT-9")

    search = next(body for method, path, body in calls if path == "/search/jql")
    assert search["jql"] == 'parent = "SMT-9" ORDER BY created ASC'
    assert "priority" in search["fields"]


@pytest.mark.parametrize(
    ("description", "expected"),
    [
        ("Do it.\n\nAcceptance criteria:\n- one\n- two\n\nNotes", ["one", "two"]),
        ("Acceptance Criteria: works offline", ["works offline"]),
        ("## Acceptance criteria\n1. first\n2) second", ["first", "second"]),
        ("[ ] todo\nAcceptance criteria\n[x] done", ["done"]),
        ("No criteria here.", []),
        ("", []),
    ],
)
def test_acceptance_criteria_parsing(description, expected) -> None:
    assert acceptance_criteria(description) == expected
