# Per-project configuration: projects/<name>/orchestrator.config.toml.
# Adding a project means adding a folder and this file; no orchestrator code changes.
import tomllib
from pathlib import Path

CONFIG_FILENAME = "orchestrator.config.toml"

# Config key -> Settings field. Only these keys may appear in the file, so secrets
# (tokens, API keys) can never be committed there by mistake.
ALLOWED_KEYS: dict[str, str] = {
    "github_repo": "github_repo",
    "base_branch": "base_branch",
    "git_remote": "git_remote",
    "issue_label": "issue_label",
    "jira_project": "jira_project",
    "jira_base_url": "jira_base_url",
    "jira_trigger_status": "jira_trigger_status",
    "jira_jql": "jira_jql",
    "jira_skip_types": "jira_skip_types",
    "jira_code_root": "jira_code_root",
    "jira_tests_root": "jira_tests_root",
    "verification_ruff_target": "verification_ruff_target",
    "docs_dir": "docs_dir",
    "test_command": "test_command",
    "lint_command": "lint_command",
}


class ProjectConfigError(ValueError):
    """The project folder or its config file is missing or invalid."""


def project_dir(repo_root: Path, name: str, projects_dir: str = "projects") -> Path:
    """The folder of a project; `name` may be a bare name or a path inside the repo."""
    root = repo_root.resolve()
    candidate = Path(name)
    path = candidate if candidate.is_absolute() else root / projects_dir / name
    if not path.exists() and not candidate.is_absolute():
        path = root / candidate

    path = path.resolve()
    if root not in path.parents:
        raise ProjectConfigError(f"Project folder {path} is not inside {root}.")
    if not path.is_dir():
        raise ProjectConfigError(f"Project folder {path} does not exist.")
    return path


def load_project_config(folder: Path) -> dict[str, object]:
    """Settings overrides from the project's config file ({} when it has none)."""
    file = folder / CONFIG_FILENAME
    if not file.is_file():
        return {}

    try:
        data = tomllib.loads(file.read_text(encoding="utf-8"))
    except tomllib.TOMLDecodeError as exc:
        raise ProjectConfigError(f"{file} is not valid TOML: {exc}") from exc

    unknown = sorted(set(data) - set(ALLOWED_KEYS))
    if unknown:
        raise ProjectConfigError(
            f"{file}: unknown key(s) {', '.join(unknown)}. "
            f"Allowed: {', '.join(sorted(ALLOWED_KEYS))}."
        )
    return {ALLOWED_KEYS[key]: value for key, value in data.items()}
