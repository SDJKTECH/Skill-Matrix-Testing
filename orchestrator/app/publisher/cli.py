# The read-only command the Jira Publisher agent runs (its only tool). Prints JSON.
#   python -m orchestrator.app.publisher.cli epics
#   python -m orchestrator.app.publisher.cli search --text "quiz"
# Creating issues is not possible from here: the server does that, after the user
# presses Confirm (see service.py).
import argparse
import dataclasses
import json
import sys

from orchestrator.app.core.config import get_settings
from orchestrator.app.core.exceptions import OrchestratorError
from orchestrator.app.jira.client import make_jira_api
from orchestrator.app.publisher.guard import JiraPublisher


def _print(data: object) -> None:
    print(json.dumps(data, indent=2, default=lambda o: dataclasses.asdict(o)))


def run(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="publisher")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("epics")
    search = sub.add_parser("search")
    search.add_argument("--text", required=True)
    args = parser.parse_args(argv)

    settings = get_settings()

    try:
        publisher = JiraPublisher(make_jira_api(settings), settings)

        if args.command == "epics":
            _print({"epics": publisher.epics()})
        else:
            _print({"results": publisher.search(args.text)})
    except OrchestratorError as exc:
        _print({"ok": False, "error": str(exc)})
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(run(sys.argv[1:]))
