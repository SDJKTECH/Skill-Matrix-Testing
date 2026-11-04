from orchestrator.app.core.config import get_settings


def test_tests_never_poll_jira_or_run_agents_even_with_a_live_env_file() -> None:
    """Starting the app in a test must not poll a real Jira or push to GitHub."""
    settings = get_settings()

    assert settings.poll_interval_seconds == 0
    assert settings.plan_requirements is False
    assert settings.publish_branches is False
    assert settings.open_pull_request is False
    assert settings.comment_on_issues is False
    assert settings.issue_source != "jira"
    assert not settings.jira_base_url and not settings.jira_api_token
