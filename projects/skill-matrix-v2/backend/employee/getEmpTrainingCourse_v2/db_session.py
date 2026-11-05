"""DB engine + raw queries only — no formatting here, that's service.py's job."""
import json
import os
from pathlib import Path
from urllib.parse import quote_plus

from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool
from dotenv import load_dotenv

try:
    env_file = Path(__file__).parent.parent.parent / ".env"
    if env_file.exists():
        load_dotenv(env_file)
except Exception:
    pass


def get_db_engine():
    """Create and return a SQLAlchemy engine using environment variables."""
    db_user = quote_plus(os.getenv("DB_USER"))
    db_pass = quote_plus(os.getenv("DB_PASS"))
    db_name = os.getenv("DB_NAME")
    db_host = os.getenv("DB_HOST")
    db_port = os.getenv("DB_PORT")
    db_url = f"postgresql+psycopg2://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}"
    return create_engine(db_url, poolclass=NullPool, future=True)


engine = None


def get_engine():
    """Get or create the database engine (lazy initialization)."""
    global engine
    if engine is None:
        engine = get_db_engine()
    return engine


# Enrollment is employee_trainings (employee x batch); a batch carries courses via training_batch_course_map (many-to-many).
_COURSE_ENROLLMENT_COLUMNS = """
    tc.course_id, tc.title, tc.description, tc.version, tc.course_type,
    tc.duration_minutes, tc.course_status, tc.created_at, tc.updated_at,
    et.employee_training_id AS enrollment_id, et.training_status AS enrollment_status,
    et.created_at AS enrolled_at, et.start_date AS started_at, et.end_date AS completed_at
"""


def query_emp_courses(schema, employee_id, course_id=None, lesson_id=None):
    """mode=emp_course — enrolled courses (via employee_trainings -> training_batches -> training_courses)."""
    query_str = f'''
        SELECT {_COURSE_ENROLLMENT_COLUMNS}, tl.lesson_id, tl.material_type, tl.material_url,
               tl.material_upload_status, tl.hls_manifest_path,
               etp.last_position_secs AS last_position_seconds
        FROM "{schema}".employee_trainings et
        INNER JOIN "{schema}".training_batches tb ON tb.id = et.batch_id
        INNER JOIN "{schema}".training_batch_course_map tbcm ON tbcm.training_batch_id = tb.id
        INNER JOIN "{schema}".training_courses tc ON tc.course_id = tbcm.course_id
        LEFT JOIN LATERAL (
            SELECT lesson_id, material_type, material_url, material_upload_status, hls_manifest_path
            FROM "{schema}".training_lessons
            WHERE course_id = tc.course_id
            {"AND lesson_id = :lesson_id" if lesson_id is not None else ""}
            ORDER BY sequence ASC
            LIMIT 1
        ) tl ON true
        LEFT JOIN "{schema}".employee_training_progress etp
            ON etp.employee_training_id = et.employee_training_id AND etp.lesson_id = tl.lesson_id
        WHERE et.employee_id = :employee_id
    '''
    params = {"employee_id": employee_id}
    if course_id is not None:
        query_str += " AND tc.course_id = :course_id"
        params["course_id"] = course_id
    if lesson_id is not None:
        params["lesson_id"] = lesson_id
    query_str += " ORDER BY tc.title"

    with get_engine().connect() as conn:
        return conn.execute(text(query_str), params).fetchall()


def query_course_lessons(schema, employee_id, course_id):
    """mode=emp_course_lessons — lessons in a course with this employee's per-lesson progress if any."""
    query_str = f'''
        SELECT tl.lesson_id, tl.sequence, tl.title, tl.material_type, tl.duration_minutes,
               tl.material_upload_status,
               etp.progress_percentage AS progress_pct, etp.last_position_secs AS last_position_seconds,
               CASE WHEN etp.progress_percentage = 100 THEN 'Completed'
                    WHEN etp.progress_id IS NOT NULL THEN 'In Progress'
                    ELSE 'Not Started' END AS progress_status
        FROM "{schema}".training_lessons tl
        LEFT JOIN "{schema}".employee_training_progress etp
            ON etp.lesson_id = tl.lesson_id
            AND etp.employee_training_id IN (
                SELECT et.employee_training_id
                FROM "{schema}".employee_trainings et
                INNER JOIN "{schema}".training_batch_course_map tbcm ON tbcm.training_batch_id = et.batch_id
                WHERE et.employee_id = :employee_id AND tbcm.course_id = :course_id
            )
        WHERE tl.course_id = :course_id
        ORDER BY tl.sequence ASC
    '''
    with get_engine().connect() as conn:
        return conn.execute(text(query_str), {"employee_id": employee_id, "course_id": course_id}).fetchall()


def query_emp_all_courses(schema, employee_id):
    """mode=emp_all_course — published catalog with this employee's enrollment status if any (LEFT JOIN)."""
    query = text(f'''
        SELECT {_COURSE_ENROLLMENT_COLUMNS}
        FROM "{schema}".training_courses tc
        LEFT JOIN "{schema}".employee_trainings et
            ON et.employee_id = :employee_id
            AND et.batch_id IN (SELECT training_batch_id FROM "{schema}".training_batch_course_map WHERE course_id = tc.course_id)
        WHERE tc.course_status = 'Published'
        ORDER BY tc.title
    ''')
    with get_engine().connect() as conn:
        return conn.execute(query, {"employee_id": employee_id}).fetchall()


def _resolve_employee_training_id(conn, schema, employee_id, course_id):
    """Most recently created employee_trainings row for this employee+course (via its batch)."""
    row = conn.execute(
        text(f'''
            SELECT et.employee_training_id
            FROM "{schema}".employee_trainings et
            INNER JOIN "{schema}".training_batch_course_map tbcm ON tbcm.training_batch_id = et.batch_id
            WHERE et.employee_id = :employee_id AND tbcm.course_id = :course_id
            ORDER BY et.created_at DESC
            LIMIT 1
        '''),
        {"employee_id": employee_id, "course_id": course_id},
    ).fetchone()
    return row.employee_training_id if row else None


def upsert_progress(schema, employee_id, course_id, lesson_id, status, progress_pct, position_seconds):
    """mode=saveEmpCourseProgress (POST) — UPSERT employee_training_progress and roll the status up into employee_trainings."""
    progress_percentage = 100 if status == "Completed" else 0
    progress_detail = json.dumps({"progress_pct": progress_pct})

    with get_engine().begin() as conn:
        employee_training_id = _resolve_employee_training_id(conn, schema, employee_id, course_id)
        if employee_training_id is None:
            raise LookupError(f"No training enrollment found for employee {employee_id} in course {course_id}")

        conn.execute(
            text(f'''
                INSERT INTO "{schema}".employee_training_progress
                    (employee_training_id, lesson_id, progress_percentage, total_time_spent_mins,
                     access_count, last_position_secs, progress_detail, started_at, last_accessed_at,
                     completed_at, created_at, updated_at)
                VALUES
                    (:employee_training_id, :lesson_id, :progress_percentage, 0, 1, :position_seconds,
                     CAST(:progress_detail AS jsonb), NOW(), NOW(),
                     CASE WHEN :status = 'Completed' THEN NOW() ELSE NULL END, NOW(), NOW())
                ON CONFLICT (employee_training_id, lesson_id) DO UPDATE SET
                    progress_percentage = EXCLUDED.progress_percentage,
                    last_position_secs = EXCLUDED.last_position_secs,
                    progress_detail = EXCLUDED.progress_detail,
                    last_accessed_at = NOW(),
                    access_count = "{schema}".employee_training_progress.access_count + 1,
                    completed_at = COALESCE("{schema}".employee_training_progress.completed_at, EXCLUDED.completed_at),
                    updated_at = NOW()
            '''),
            {
                "employee_training_id": employee_training_id,
                "lesson_id": lesson_id,
                "progress_percentage": progress_percentage,
                "position_seconds": position_seconds,
                "progress_detail": progress_detail,
                "status": status,
            },
        )

        # Only promote the self-paced lifecycle — never overwrite an admin-set status from the nomination/approval flow.
        conn.execute(
            text(f'''
                UPDATE "{schema}".employee_trainings
                SET training_status = :status, updated_at = NOW()
                WHERE employee_training_id = :employee_training_id
                  AND training_status IN ('Not Started', 'In Progress')
            '''),
            {"employee_training_id": employee_training_id, "status": status},
        )
