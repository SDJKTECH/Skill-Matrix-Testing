"""Business logic — calls db_session.py for raw rows."""
import logging
import re
from datetime import timedelta

from google.cloud import storage
from db_session import query_emp_courses, query_course_lessons, query_emp_all_courses, upsert_progress

_HLS_FILENAME_RE = re.compile(r"^[A-Za-z0-9_.-]+\.(m3u8|ts)$")

logger = logging.getLogger(__name__)

ALLOWED_PROGRESS_STATUSES = {"Not Started", "In Progress", "Completed"}


class ContentUnavailableError(Exception):
    """Course material exists in the DB but can't be fetched from storage right now (expired/invalid credentials, GCS outage, missing blob, etc)."""


def _rows_to_dicts(rows):
    """Row -> dict, with datetime/enum values normalized to JSON-safe strings."""
    results = []
    for row in rows:
        entry = dict(row._mapping)
        for key, value in entry.items():
            if hasattr(value, "isoformat"):
                entry[key] = value.isoformat()
        if entry.get("course_type"):
            entry["course_type"] = str(entry["course_type"])
        if entry.get("course_status"):
            entry["course_status"] = str(entry["course_status"])
        if entry.get("enrollment_status"):
            entry["enrollment_status"] = str(entry["enrollment_status"])
        if entry.get("material_type"):
            entry["material_type"] = str(entry["material_type"])
        if entry.get("material_upload_status"):
            entry["material_upload_status"] = str(entry["material_upload_status"])
        if entry.get("progress_status"):
            entry["progress_status"] = str(entry["progress_status"])
        results.append(entry)
    return results


def _resolve_content_url(material_url, expiration_minutes=15):
    """gs://bucket/object -> signed https URL, or None if signing isn't available (caller then proxies instead)."""
    if not material_url:
        return None
    if not material_url.startswith("gs://"):
        return material_url

    bucket_name, _, blob_name = material_url[len("gs://"):].partition("/")
    client = storage.Client()
    blob = client.bucket(bucket_name).blob(blob_name)
    try:
        return blob.generate_signed_url(
            version="v4", expiration=timedelta(minutes=expiration_minutes), method="GET"
        )
    except Exception as e:
        logger.warning(f"Signed URL unavailable (expected in local dev with ADC), will proxy instead: {e}")
        return None


def fetch_emp_courses(schema, employee_id, course_id=None, lesson_id=None):
    """mode=emp_course — enrolled courses, each with a content_url. Video is always proxied via mode=stream-hls once Ready, never signed directly."""
    rows = query_emp_courses(schema, employee_id, course_id, lesson_id)
    results = _rows_to_dicts(rows)

    for entry in results:
        material_url = entry.pop("material_url", None)
        entry.pop("hls_manifest_path", None)

        if entry.get("material_type") == "Video":
            entry["content_url"] = None
            entry["content_proxy_required"] = False
            continue

        content_url = None
        if material_url:
            try:
                content_url = _resolve_content_url(material_url)
            except Exception as e:
                logger.warning(f"Could not resolve content_url for course_id={entry.get('course_id')}: {e}")
        entry["content_url"] = content_url
        entry["content_proxy_required"] = bool(material_url) and content_url is None

    return results


def fetch_course_lessons(schema, employee_id, course_id):
    """mode=emp_course_lessons — every lesson in this course with this employee's progress; requires enrollment."""
    if not query_emp_courses(schema, employee_id, course_id):
        raise LookupError(f"No enrolled course {course_id} found for employee {employee_id}")
    rows = query_course_lessons(schema, employee_id, course_id)
    return _rows_to_dicts(rows)


def _stream_blob_chunks(blob, chunk_size=256 * 1024):
    """Yield a GCS blob's bytes in chunks; on failure, just log and stop — headers are already sent."""
    try:
        with blob.open("rb") as f:
            while True:
                chunk = f.read(chunk_size)
                if not chunk:
                    break
                yield chunk
    except Exception as e:
        logger.error(f"Failed while streaming course material ({blob.name}): {e}")
        return


def stream_content(schema, employee_id, course_id, lesson_id=None):
    """mode=download_content — proxy the file bytes through this function (fallback when signing is unavailable)."""
    rows = query_emp_courses(schema, employee_id, course_id, lesson_id)
    if not rows:
        raise LookupError(f"No enrolled course {course_id} found for employee {employee_id}")

    entry = dict(rows[0]._mapping)
    material_url = entry.get("material_url")
    if not material_url or not material_url.startswith("gs://"):
        raise ValueError("No downloadable material for this course")

    bucket_name, _, blob_name = material_url[len("gs://"):].partition("/")
    try:
        client = storage.Client()
        blob = client.bucket(bucket_name).blob(blob_name)
        blob.reload()
    except Exception as e:
        logger.error(f"Failed to access course material in storage (course_id={course_id}, path={blob_name}): {e}")
        raise ContentUnavailableError("Course material is temporarily unavailable, please try again shortly") from e

    filename = blob_name.rsplit("/", 1)[-1]
    return _stream_blob_chunks(blob), blob.content_type or "application/octet-stream", filename


def stream_hls_asset(schema, employee_id, course_id, lesson_id, filename):
    """mode=stream-hls — proxy one file (manifest or .ts segment) from a Ready lesson's HLS output folder."""
    if not _HLS_FILENAME_RE.match(filename):
        raise ValueError("Invalid HLS asset filename")

    rows = query_emp_courses(schema, employee_id, course_id, lesson_id)
    if not rows:
        raise LookupError(f"No enrolled course {course_id} found for employee {employee_id}")

    entry = dict(rows[0]._mapping)
    hls_manifest_path = entry.get("hls_manifest_path")
    if entry.get("material_upload_status") != "Ready" or not hls_manifest_path:
        raise ValueError("Video is not ready for playback yet")

    bucket_name, _, manifest_blob_name = hls_manifest_path[len("gs://"):].partition("/")
    hls_dir = manifest_blob_name.rsplit("/", 1)[0]
    blob_name = f"{hls_dir}/{filename}"

    try:
        client = storage.Client()
        blob = client.bucket(bucket_name).blob(blob_name)
        blob.reload()
    except Exception as e:
        logger.error(f"Failed to access HLS asset in storage (lesson_id={lesson_id}, path={blob_name}): {e}")
        raise ContentUnavailableError("Video is temporarily unavailable, please try again shortly") from e

    content_type = (
        "application/x-mpegURL" if filename.endswith(".m3u8")
        else "video/mp2t" if filename.endswith(".ts")
        else blob.content_type or "application/octet-stream"
    )
    return _stream_blob_chunks(blob), content_type, filename


def fetch_emp_all_courses(schema, employee_id):
    """mode=emp_all_course — full published catalog + enrollment status if any, UI-ready."""
    rows = query_emp_all_courses(schema, employee_id)
    return _rows_to_dicts(rows)


def save_progress(schema, data):
    """mode=saveEmpCourseProgress (POST) — validate the body, then UPSERT. position_seconds also doubles as the PDF page number."""
    employee_id = data.get("employee_id")
    course_id = data.get("course_id")
    lesson_id = data.get("lesson_id")
    status = data.get("status")
    progress_pct = data.get("progress_pct")
    position_seconds = data.get("position_seconds")

    missing = [f for f in ("employee_id", "course_id", "lesson_id", "status") if not data.get(f)]
    if missing:
        raise ValueError(f"Missing required fields: {', '.join(missing)}")

    if status not in ALLOWED_PROGRESS_STATUSES:
        raise ValueError(f"status must be one of {sorted(ALLOWED_PROGRESS_STATUSES)}")

    if progress_pct is not None and not (0 <= progress_pct <= 100):
        raise ValueError("progress_pct must be between 0 and 100")

    try:
        employee_id, course_id, lesson_id = int(employee_id), int(course_id), int(lesson_id)
    except (TypeError, ValueError):
        raise ValueError("employee_id, course_id and lesson_id must be integers")

    upsert_progress(schema, employee_id, course_id, lesson_id, status, progress_pct, position_seconds)
    return {"saved": True}
