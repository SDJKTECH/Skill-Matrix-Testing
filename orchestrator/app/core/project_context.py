# Checks that a project's CLAUDE.md has the sections every project must provide.
# Every agent reads CLAUDE.md, so it is the one place for project context.
import re
from pathlib import Path

REQUIRED_SECTIONS: tuple[str, ...] = (
    "Purpose",
    "Project structure",
    "Commands",
    "Rules",
    "Docs",
)


def claude_md_sections(text: str) -> set[str]:
    """Lowercase titles of the Markdown headings (any level) in the text."""
    return {
        match.group(1).strip().lower()
        for match in re.finditer(r"^#{1,6}\s+(.+?)\s*#*\s*$", text, re.MULTILINE)
    }


def missing_sections(folder: Path) -> list[str]:
    """Required sections absent from folder/CLAUDE.md (all of them if no file)."""
    file = folder / "CLAUDE.md"

    if not file.is_file():
        return list(REQUIRED_SECTIONS)

    present = claude_md_sections(file.read_text(encoding="utf-8"))
    return [name for name in REQUIRED_SECTIONS if name.lower() not in present]
