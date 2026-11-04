import json

from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.orm import sessionmaker

from orchestrator.app.db.database import Base
from orchestrator.app.db.migrations import migrate_task_columns
from orchestrator.app.db.models import (
    Milestone,
    PlanConcern,
    Project,
    StoryRun,
    Task,
)

NEW_TASK_COLUMNS = {
    "story_run_id",
    "files",
    "complexity",
    "parallel_safe",
    "expected_outcome",
    "context_notes",
}


def test_fresh_database_has_the_story_run_tables(tmp_path) -> None:
    engine = create_engine(f"sqlite:///{tmp_path / 'fresh.db'}")
    Base.metadata.create_all(engine)

    tables = set(inspect(engine).get_table_names())
    task_columns = {column["name"] for column in inspect(engine).get_columns("tasks")}

    assert {"story_runs", "plan_concerns"} <= tables
    assert NEW_TASK_COLUMNS <= task_columns
    engine.dispose()


def test_story_run_owns_tasks_and_concerns(tmp_path) -> None:
    engine = create_engine(f"sqlite:///{tmp_path / 'runs.db'}")
    Base.metadata.create_all(engine)

    with sessionmaker(bind=engine, expire_on_commit=False)() as session:
        project = Project(name="demo", local_path=str(tmp_path))
        session.add(project)
        session.flush()
        milestone = Milestone(project_id=project.id, code="M1", title="M1")
        run = StoryRun(story_key="SMT-9", project_id=project.id, plan='{"tasks": []}')
        session.add_all([milestone, run])
        session.flush()
        task = Task(
            milestone_id=milestone.id,
            title="SMT-10: Add endpoint",
            story_run_id=run.id,
            files=json.dumps(["backend/reports/export.py"]),
            complexity="small",
            parallel_safe=True,
            context_notes="Reuse the CSV helper.",
        )
        session.add(task)
        session.flush()
        session.add(PlanConcern(story_run_id=run.id, task_id=task.id, text="Vague AC"))
        session.add(PlanConcern(story_run_id=run.id, text="Docs folder is empty"))
        session.commit()

        saved = session.scalar(select(StoryRun).where(StoryRun.story_key == "SMT-9"))

        assert saved is not None
        assert saved.status == "checked" and saved.base_branch == "development"
        assert saved.cost_usd == 0.0 and saved.finished_at is None
        assert [item.title for item in saved.tasks] == ["SMT-10: Add endpoint"]
        assert saved.tasks[0].parallel_safe is True
        assert json.loads(saved.tasks[0].files) == ["backend/reports/export.py"]
        assert sorted(c.text for c in saved.concerns) == [
            "Docs folder is empty",
            "Vague AC",
        ]

    engine.dispose()


def test_tasks_without_a_story_run_are_unchanged(tmp_path) -> None:
    engine = create_engine(f"sqlite:///{tmp_path / 'plain.db'}")
    Base.metadata.create_all(engine)

    with sessionmaker(bind=engine, expire_on_commit=False)() as session:
        project = Project(name="demo", local_path=str(tmp_path))
        session.add(project)
        session.flush()
        milestone = Milestone(project_id=project.id, code="M1", title="M1")
        session.add(milestone)
        session.flush()
        task = Task(milestone_id=milestone.id, title="Plain task")
        session.add(task)
        session.commit()

        assert task.story_run_id is None and task.story_run is None
        assert task.files is None and task.parallel_safe is None

    engine.dispose()


def test_legacy_tasks_table_gains_the_columns_and_keeps_its_rows(tmp_path) -> None:
    engine = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}")

    with engine.begin() as connection:
        connection.execute(
            text("CREATE TABLE tasks (id INTEGER PRIMARY KEY, title VARCHAR(250))")
        )
        connection.execute(text("INSERT INTO tasks (id, title) VALUES (1, 'Old')"))

    migrate_task_columns(engine)
    migrate_task_columns(engine)

    columns = {column["name"] for column in inspect(engine).get_columns("tasks")}
    assert NEW_TASK_COLUMNS <= columns

    with engine.connect() as connection:
        row = connection.execute(
            text("SELECT title, story_run_id, files FROM tasks")
        ).one()

    assert row == ("Old", None, None)
    engine.dispose()
