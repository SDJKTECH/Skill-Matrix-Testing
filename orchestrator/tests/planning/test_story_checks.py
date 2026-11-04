from pathlib import Path

import pytest

from orchestrator.app.core.exceptions import PlanningError
from orchestrator.app.jira.source import JiraRecord
from orchestrator.app.jira.story import StoryBundle, SubTask
from orchestrator.app.planning.story_checks import ensure_story_ready, story_problems

CLAUDE_MD = (
    "# P\n## Purpose\nx\n## Project structure\ndocs/ holds the docs\n"
    "## Commands\nx\n## Rules\nx\n## Docs\nx\n"
)


def bundle(*sub_tasks: SubTask) -> StoryBundle:
    return StoryBundle(
        story=JiraRecord(key="SMT-9", summary="Story"), sub_tasks=list(sub_tasks)
    )


def task(key: str, criteria: list[str] | None = None) -> SubTask:
    return SubTask(
        key=key, summary=key, criteria=["done"] if criteria is None else criteria
    )


@pytest.fixture
def project(tmp_path: Path) -> Path:
    (tmp_path / "CLAUDE.md").write_text(CLAUDE_MD, encoding="utf-8")
    (tmp_path / "docs").mkdir()
    return tmp_path


def test_a_ready_story_has_no_problems(project: Path) -> None:
    assert story_problems(project, "docs", bundle(task("SMT-10"))) == []
    ensure_story_ready(project, "docs", bundle(task("SMT-10")))


def test_missing_claude_md(tmp_path: Path) -> None:
    (tmp_path / "docs").mkdir()

    problems = story_problems(tmp_path, "docs", bundle(task("SMT-10")))

    assert any("CLAUDE.md" in text and "missing" in text for text in problems)


def test_claude_md_with_missing_sections(project: Path) -> None:
    (project / "CLAUDE.md").write_text("## Purpose\ndocs\n", encoding="utf-8")

    problems = story_problems(project, "docs", bundle(task("SMT-10")))

    assert problems == [
        "CLAUDE.md lacks the section(s): Project structure, Commands, Rules, Docs."
    ]


@pytest.mark.parametrize("docs_dir", [None, "", "  "])
def test_docs_dir_must_be_configured(project: Path, docs_dir) -> None:
    problems = story_problems(project, docs_dir, bundle(task("SMT-10")))

    assert problems == [
        "docs_dir is not set in the project's orchestrator.config.toml."
    ]


def test_docs_folder_must_exist(project: Path) -> None:
    problems = story_problems(project, "documentation", bundle(task("SMT-10")))

    assert problems == [f"docs_dir 'documentation' does not exist in {project}."]


def test_docs_dir_cannot_leave_the_project(project: Path) -> None:
    problems = story_problems(project, "../elsewhere", bundle(task("SMT-10")))

    assert problems == ["docs_dir '../elsewhere' is outside the project folder."]


def test_claude_md_must_mention_the_docs_folder(project: Path) -> None:
    (project / "guides").mkdir()

    problems = story_problems(project, "guides", bundle(task("SMT-10")))

    assert problems == ["CLAUDE.md does not mention the docs folder 'guides'."]


def test_story_needs_sub_tasks(project: Path) -> None:
    assert story_problems(project, "docs", bundle()) == [
        "Story SMT-9 has no sub-tasks."
    ]


def test_every_sub_task_needs_acceptance_criteria(project: Path) -> None:
    problems = story_problems(
        project, "docs", bundle(task("SMT-10"), task("SMT-11", []), task("SMT-12", []))
    )

    assert problems == ["No acceptance criteria in: SMT-11, SMT-12."]


def test_all_problems_are_reported_together(tmp_path: Path) -> None:
    with pytest.raises(PlanningError) as raised:
        ensure_story_ready(tmp_path, None, bundle())

    message = str(raised.value)
    assert message.startswith("Story SMT-9 is not ready to run:")
    assert (
        "CLAUDE.md" in message and "docs_dir" in message and "no sub-tasks" in message
    )
