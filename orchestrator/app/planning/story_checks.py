# Checks made before any agent runs for a Jira story. They read files and the
# story only: nothing is executed, so they cost nothing. Every problem is
# reported at once, so one run of the checks tells you everything to fix.
from pathlib import Path

from orchestrator.app.core.exceptions import PlanningError
from orchestrator.app.core.project_context import missing_sections
from orchestrator.app.jira.story import StoryBundle


def story_problems(
    project_folder: Path, docs_dir: str | None, bundle: StoryBundle
) -> list[str]:
    """Everything that stops a story run, as short messages (empty = ready)."""
    problems: list[str] = []
    claude_md = project_folder / "CLAUDE.md"

    # 1. CLAUDE.md has every section.
    absent = missing_sections(project_folder)
    if not claude_md.is_file():
        problems.append(f"{claude_md} is missing.")
    elif absent:
        problems.append(f"CLAUDE.md lacks the section(s): {', '.join(absent)}.")

    # 2. The docs folder is configured, exists, and CLAUDE.md mentions it.
    problems.extend(_docs_problems(project_folder, docs_dir, claude_md))

    # 3. The story has sub-tasks.
    if not bundle.sub_tasks:
        problems.append(f"Story {bundle.story.key} has no sub-tasks.")

    # 4. Every sub-task has acceptance criteria.
    without = [task.key for task in bundle.sub_tasks if not task.criteria]
    if without:
        problems.append(f"No acceptance criteria in: {', '.join(without)}.")

    return problems


def _docs_problems(
    project_folder: Path, docs_dir: str | None, claude_md: Path
) -> list[str]:
    if not docs_dir or not docs_dir.strip():
        return ["docs_dir is not set in the project's orchestrator.config.toml."]

    root = project_folder.resolve()
    folder = (root / docs_dir).resolve()

    if folder != root and root not in folder.parents:
        return [f"docs_dir '{docs_dir}' is outside the project folder."]

    if not folder.is_dir():
        return [f"docs_dir '{docs_dir}' does not exist in {project_folder}."]

    if claude_md.is_file():
        text = claude_md.read_text(encoding="utf-8")
        if docs_dir.strip().strip("/\\") not in text:
            return [f"CLAUDE.md does not mention the docs folder '{docs_dir}'."]

    return []


def ensure_story_ready(
    project_folder: Path, docs_dir: str | None, bundle: StoryBundle
) -> None:
    """Raise PlanningError listing every problem, before any agent is called."""
    problems = story_problems(project_folder, docs_dir, bundle)

    if problems:
        raise PlanningError(
            f"Story {bundle.story.key} is not ready to run:\n- " + "\n- ".join(problems)
        )
