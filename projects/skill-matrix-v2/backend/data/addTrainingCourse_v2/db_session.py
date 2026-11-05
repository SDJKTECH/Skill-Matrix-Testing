"""DB engine + raw queries only — no formatting here, that's service.py's job.

Each function opens its own connection, like getEmpTrainingCourse_v2's db_session.py.
"""
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


def get_course_by_id(schema, course_id):
    """Return the training_courses row for course_id, or None if it doesn't exist."""
    with get_engine().connect() as connection:
        return connection.execute(
            text(f'SELECT course_id FROM "{schema}".training_courses WHERE course_id = :course_id'),
            {"course_id": course_id},
        ).fetchone()


def list_training_courses(schema):
    """Every course (draft + published) with lesson/quiz counts, newest-updated first — admin course-management landing page."""
    with get_engine().connect() as connection:
        return connection.execute(
            text(f'''
                SELECT tc.course_id, tc.title, tc.description, tc.version, tc.course_type,
                       tc.duration_minutes, tc.course_status, tc.created_by, tc.created_at, tc.updated_at,
                       COUNT(tl.lesson_id) FILTER (WHERE tl.material_type != 'Quiz') AS lesson_count,
                       COUNT(tl.lesson_id) FILTER (WHERE tl.material_type = 'Quiz') AS quiz_count
                FROM "{schema}".training_courses tc
                LEFT JOIN "{schema}".training_lessons tl ON tl.course_id = tc.course_id
                GROUP BY tc.course_id
                ORDER BY tc.updated_at DESC
            ''')
        ).fetchall()


def insert_training_course(schema, title, description, course_type, duration_minutes, course_status):
    """Insert a new training_courses row and return its course_id. Course-level metadata only — material lives on training_lessons."""
    with get_engine().begin() as connection:
        result = connection.execute(
            text(f'''
                INSERT INTO "{schema}".training_courses
                    (title, description, course_type, duration_minutes, course_status)
                VALUES (:title, :description, :course_type, :duration_minutes, :course_status)
                RETURNING course_id
            '''),
            {
                "title": title,
                "description": description,
                "course_type": course_type,
                "duration_minutes": duration_minutes,
                "course_status": course_status,
            },
        )
        return result.scalar()


def get_lesson_by_id(schema, lesson_id):
    """Return the training_lessons row for lesson_id, or None if it doesn't exist."""
    with get_engine().connect() as connection:
        return connection.execute(
            text(f'SELECT lesson_id, course_id FROM "{schema}".training_lessons WHERE lesson_id = :lesson_id'),
            {"lesson_id": lesson_id},
        ).fetchone()


def insert_training_lesson(schema, course_id, sequence, title, material_type, duration_minutes, material_url=None, text_body=None):
    """Insert a new training_lessons row under an existing course and return its lesson_id."""
    with get_engine().begin() as connection:
        result = connection.execute(
            text(f'''
                INSERT INTO "{schema}".training_lessons
                    (course_id, sequence, title, material_type, material_url, text_body, duration_minutes)
                VALUES (:course_id, :sequence, :title, :material_type, :material_url, :text_body, :duration_minutes)
                RETURNING lesson_id
            '''),
            {
                "course_id": course_id,
                "sequence": sequence,
                "title": title,
                "material_type": material_type,
                "material_url": material_url,
                "text_body": text_body,
                "duration_minutes": duration_minutes,
            },
        )
        return result.scalar()


def update_lesson_material_url(schema, lesson_id, material_url):
    """Update material_url (and updated_at) for an existing training_lessons row."""
    with get_engine().begin() as connection:
        connection.execute(
            text(f'''
                UPDATE "{schema}".training_lessons
                SET material_url = :material_url, updated_at = NOW()
                WHERE lesson_id = :lesson_id
            '''),
            {"material_url": material_url, "lesson_id": lesson_id},
        )


def update_lesson_transcode_status(schema, lesson_id, transcoder_job_name):
    """Record the submitted Transcoder job name and (re)set status to Processing, clearing any prior manifest."""
    with get_engine().begin() as connection:
        connection.execute(
            text(f'''
                UPDATE "{schema}".training_lessons
                SET transcoder_job_name = :transcoder_job_name,
                    material_upload_status = 'Processing',
                    hls_manifest_path = NULL,
                    updated_at = NOW()
                WHERE lesson_id = :lesson_id
            '''),
            {"transcoder_job_name": transcoder_job_name, "lesson_id": lesson_id},
        )


def mark_lesson_transcode_failed(schema, lesson_id):
    """Mark material_upload_status Failed — used when job submission itself raises, before any job exists."""
    with get_engine().begin() as connection:
        connection.execute(
            text(f'''
                UPDATE "{schema}".training_lessons
                SET material_upload_status = 'Failed', updated_at = NOW()
                WHERE lesson_id = :lesson_id
            '''),
            {"lesson_id": lesson_id},
        )


def mark_lesson_ready(schema, lesson_id, hls_manifest_path):
    """Mark material_upload_status Ready and store the final HLS manifest path."""
    with get_engine().begin() as connection:
        connection.execute(
            text(f'''
                UPDATE "{schema}".training_lessons
                SET material_upload_status = 'Ready', hls_manifest_path = :hls_manifest_path, updated_at = NOW()
                WHERE lesson_id = :lesson_id
            '''),
            {"hls_manifest_path": hls_manifest_path, "lesson_id": lesson_id},
        )


def get_lesson_by_transcoder_job_name(schema, transcoder_job_name):
    """Return (lesson_id, material_upload_status) for the lesson owning this Transcoder job, or None."""
    with get_engine().connect() as connection:
        return connection.execute(
            text(f'''
                SELECT lesson_id, material_upload_status FROM "{schema}".training_lessons
                WHERE transcoder_job_name = :transcoder_job_name
            '''),
            {"transcoder_job_name": transcoder_job_name},
        ).fetchone()
