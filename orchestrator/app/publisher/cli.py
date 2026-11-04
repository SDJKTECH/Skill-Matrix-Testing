# The command the Jira Publisher agent runs (its only tool). Prints JSON.
#   python -m orchestrator.app.publisher.cli epics
#   python -m orchestrator.app.publisher.cli search --text "quiz"
#   python -m orchestrator.app.publisher.cli create --session DIR   (plan JSON on stdin)
# `create` works only when the server recorded the user's "confirm" for the session.
import argparse
import dataclasses
import json
import sys
from pathlib import Path

from orchestrator.app.core.config import get_settings
from orchestrator.app.core.exceptions import OrchestratorError
from orchestrator.app.jira.client import make_jira_api
from orchestrator.app.publisher.guard import JiraPublisher, parse_plan

CONFIRMED = "CONFIRMED"


def _print(data: object) -> None:
    print(json.dumps(data, indent=2, default=lambda o: dataclasses.asdict(o)))


def consume_confirmation(session: str) -> bool:
    """True once per confirmation: the marker is removed as it is used."""
    marker = Path(session) / CONFIRMED

    if not marker.is_file():
        return False

    marker.unlink()
    return True


def run(argv: list[str], stdin: str = "") -> int:
    parser = argparse.ArgumentParser(prog="publisher")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("epics")
    search = sub.add_parser("search")
    search.add_argument("--text", required=True)
    create = sub.add_parser("create")
    create.add_argument("--session", required=True)
    args = parser.parse_args(argv)

    settings = get_settings()

    try:
        publisher = JiraPublisher(make_jira_api(settings), settings)

        if args.command == "epics":
            _print({"epics": publisher.epics()})
        elif args.command == "search":
            _print({"results": publisher.search(args.text)})
        else:
            # Check the plan first, so a bad plan does not use up the confirmation.
            drafts = parse_plan(json.loads(stdin or "null"), publisher.project)
            publisher.check_epics(drafts)

            if not consume_confirmation(args.session):
                _print(
                    {
                        "ok": False,
                        "error": "Not confirmed. Show the proposal and wait for the "
                        "user to reply 'confirm'. Nothing was created.",
                    }
                )
                return 2

            _print(dataclasses.asdict(publisher.publish(drafts)))
    except (OrchestratorError, json.JSONDecodeError) as exc:
        _print({"ok": False, "error": str(exc)})
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(run(sys.argv[1:], "" if sys.stdin.isatty() else sys.stdin.read()))
