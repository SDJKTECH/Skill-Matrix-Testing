from pathlib import Path

import pytest
from pydantic import ValidationError

from orchestrator.app.core.config import Settings


def make_project(root: Path, name: str, config: str | None) -> Path:
    folder = root / "projects" / name
    folder.mkdir(parents=True)
    if config is not None:
        (folder / "orchestrator.config.toml").write_text(config, encoding="utf-8")
    return folder


def test_project_config_fills_settings(tmp_path: Path) -> None:
    make_project(
        tmp_path, "demo", 'github_repo = "acme/demo"\nbase_branch = "develop"\n'
    )

    settings = Settings(_env_file=None, repository_path=tmp_path, project="demo")

    assert settings.github_repo == "acme/demo"
    assert settings.base_branch == "develop"
    assert settings.project_subdir == "projects/demo"


def test_explicit_setting_wins_over_project_config(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    make_project(tmp_path, "demo", 'github_repo = "acme/demo"\n')
    monkeypatch.setenv("GITHUB_REPO", "other/repo")

    settings = Settings(_env_file=None, repository_path=tmp_path, project="demo")

    assert settings.github_repo == "other/repo"


def test_project_without_config_file_uses_defaults(tmp_path: Path) -> None:
    make_project(tmp_path, "bare", None)

    settings = Settings(_env_file=None, repository_path=tmp_path, project="bare")

    assert settings.base_branch == "main"
    assert settings.project_subdir == "projects/bare"


def test_unknown_project_is_rejected(tmp_path: Path) -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, repository_path=tmp_path, project="missing")


def test_secrets_cannot_live_in_project_config(tmp_path: Path) -> None:
    make_project(tmp_path, "demo", 'jira_api_token = "secret"\n')

    with pytest.raises(ValidationError):
        Settings(_env_file=None, repository_path=tmp_path, project="demo")


def test_project_path_outside_repo_is_rejected(tmp_path: Path) -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, repository_path=tmp_path, project="../..")
