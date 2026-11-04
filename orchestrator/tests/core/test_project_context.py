from pathlib import Path

from orchestrator.app.core.project_context import (
    REQUIRED_SECTIONS,
    claude_md_sections,
    missing_sections,
)

FULL = "\n".join(f"## {name}\ntext\n" for name in REQUIRED_SECTIONS)


def test_complete_claude_md_has_no_missing_sections(tmp_path: Path) -> None:
    (tmp_path / "CLAUDE.md").write_text(FULL, encoding="utf-8")

    assert missing_sections(tmp_path) == []


def test_missing_sections_are_listed(tmp_path: Path) -> None:
    (tmp_path / "CLAUDE.md").write_text("# T\n## Purpose\n## Rules\n", encoding="utf-8")

    assert missing_sections(tmp_path) == ["Project structure", "Commands", "Docs"]


def test_missing_file_reports_every_section(tmp_path: Path) -> None:
    assert missing_sections(tmp_path) == list(REQUIRED_SECTIONS)


def test_headings_match_case_insensitively_at_any_level() -> None:
    assert claude_md_sections("### project STRUCTURE ###\n") == {"project structure"}


def test_skill_matrix_claude_md_is_complete() -> None:
    folder = Path(__file__).resolve().parents[3] / "projects" / "skill-matrix-v2"

    assert missing_sections(folder) == []
