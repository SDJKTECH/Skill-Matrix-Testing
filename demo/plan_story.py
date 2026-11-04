"""Plan one Jira Story: read it, check the project, run the sequencer, save the plan.

Reads Jira and runs one read-only agent (it costs a little). It writes nothing to
Jira, starts no builder, and does not start the server or any poller.

    python demo/plan_story.py --project skill-matrix-v2 --story SMT-9
"""

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from orchestrator.app.core.config import Settings  # noqa: E402
from orchestrator.app.core.exceptions import OrchestratorError  # noqa: E402
from orchestrator.app.db.database import SessionLocal, create_tables  # noqa: E402
from orchestrator.app.db.migrations import migrate_task_columns  # noqa: E402
from orchestrator.app.jira.client import make_jira_api  # noqa: E402
from orchestrator.app.planning.story_planner import StorySequencer  # noqa: E402
from orchestrator.app.planning.story_service import plan_story  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--project", required=True, help="a folder under projects/")
    parser.add_argument("--story", required=True, help="Jira story key, e.g. SMT-9")
    args = parser.parse_args()

    settings = Settings(project=args.project, repository_path=ROOT)

    from orchestrator.app.db.database import engine

    create_tables()
    migrate_task_columns(engine)

    try:
        with SessionLocal() as session:
            run, plan = plan_story(
                session,
                settings,
                make_jira_api(settings),
                StorySequencer(settings),
                args.story,
            )
    except OrchestratorError as exc:
        sys.exit(f"Not planned:\n{exc}")

    print(f"Story run {run.id} for {plan.story_key} saved (status: {run.status}).")
    print(f"Doc target: {plan.doc_target}")
    for task in plan.tasks:
        waits = f" after {', '.join(task.depends_on)}" if task.depends_on else ""
        print(f"  {task.key}: {task.complexity}, files={len(task.files)}{waits}")
    for concern in plan.concerns:
        print(f"  concern: {concern}")


if __name__ == "__main__":
    main()
