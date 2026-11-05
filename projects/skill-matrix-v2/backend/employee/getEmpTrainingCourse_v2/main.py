"""Google Cloud Function: GET /?employee_id=<int>[&course_id=<int>][&lesson_id=<int>]&mode=emp_course|emp_course_lessons|emp_all_course → courses.
mode=emp_course optionally takes lesson_id to pick a specific lesson's content (defaults to the course's first lesson).
mode=emp_course_lessons lists every lesson in a course with this employee's per-lesson progress, for a lesson-list sidebar.
GET /stream-hls/<employee_id>/<course_id>/<lesson_id>/<filename> → proxies a Ready video lesson's HLS manifest/segment.
POST / {mode: "saveEmpCourseProgress", employee_id, course_id, lesson_id, status, progress_pct, position_seconds}
→ saves resume progress. Same function, same POST call either way — mode picks the operation."""
import os
import logging
from pathlib import Path

from flask import jsonify, make_response, Response
from sqlalchemy.exc import SQLAlchemyError
from dotenv import load_dotenv
from service import (
    fetch_emp_courses,
    fetch_course_lessons,
    fetch_emp_all_courses,
    save_progress,
    stream_content,
    stream_hls_asset,
    ContentUnavailableError,
)

try:
    env_file = Path(__file__).parent.parent.parent / ".env"
    if env_file.exists():
        load_dotenv(env_file)
except Exception:
    pass

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


def _cors_response(data, status=200):
    """Helper function to add CORS headers to any response (private - not an entry point)."""
    response = make_response(jsonify(data), status)
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return response


def _parse_hls_path(path):
    """.../stream-hls/<employee_id>/<course_id>/<lesson_id>/<filename> -> that tuple, or None if no match."""
    parts = path.rstrip("/").split("/")
    if "stream-hls" not in parts:
        return None
    tail = parts[parts.index("stream-hls") + 1:]
    if len(tail) != 4:
        return None
    try:
        employee_id, course_id, lesson_id = int(tail[0]), int(tail[1]), int(tail[2])
    except ValueError:
        return None
    return employee_id, course_id, lesson_id, tail[3]


def handle_post(schema, request):
    """mode=saveEmpCourseProgress — the only POST mode today. Mirrors handle_get's mode dispatch,
    just read from the JSON body instead of the query string."""
    data = request.get_json(silent=True) or {}
    mode = data.get("mode", "")
    if mode != "saveEmpCourseProgress":
        return _cors_response({"error": "mode must be 'saveEmpCourseProgress'"}, 400)

    result = save_progress(schema, data)
    return _cors_response(result, 200)


def handle_get(schema, request):
    """mode=emp_course → this employee's enrolled courses only; mode=emp_all_course → full published catalog + enrollment status if any."""
    employee_id = request.args.get("employee_id")
    if not employee_id:
        return _cors_response({"error": "Missing required query parameter: employee_id"}, 400)
    try:
        employee_id = int(employee_id)
    except ValueError:
        return _cors_response({"error": "employee_id must be an integer"}, 400)

    course_id = request.args.get("course_id")
    if course_id is not None:
        try:
            course_id = int(course_id)
        except ValueError:
            return _cors_response({"error": "course_id must be an integer"}, 400)

    lesson_id = request.args.get("lesson_id")
    if lesson_id is not None:
        try:
            lesson_id = int(lesson_id)
        except ValueError:
            return _cors_response({"error": "lesson_id must be an integer"}, 400)

    mode = request.args.get("mode", "")
    if mode == "download_content":
        if course_id is None:
            return _cors_response({"error": "course_id is required for mode=download_content"}, 400)
        stream, content_type, filename = stream_content(schema, employee_id, course_id, lesson_id)
        response = Response(stream, content_type=content_type)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Content-Disposition"] = f'inline; filename="{filename}"'
        return response

    if mode == "emp_course":
        results = fetch_emp_courses(schema, employee_id, course_id, lesson_id)
    elif mode == "emp_course_lessons":
        if course_id is None:
            return _cors_response({"error": "course_id is required for mode=emp_course_lessons"}, 400)
        results = fetch_course_lessons(schema, employee_id, course_id)
    elif mode == "emp_all_course":
        results = fetch_emp_all_courses(schema, employee_id)
    else:
        return _cors_response({"error": "mode must be 'emp_course', 'emp_course_lessons' or 'emp_all_course'"}, 400)

    return _cors_response({"count": len(results), "results": results}, 200)


def get_emp_training_course_v2(request):
    """Cloud Function entry point."""
    if request.method == "OPTIONS":
        response = make_response("", 204)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response.headers["Access-Control-Max-Age"] = "3600"
        return response

    try:
        schema = os.getenv("DB_SCHEMA")

        if request.method == "GET":
            hls_params = _parse_hls_path(request.path)
            if hls_params:
                employee_id, course_id, lesson_id, filename = hls_params
                stream, content_type, _ = stream_hls_asset(schema, employee_id, course_id, lesson_id, filename)
                response = Response(stream, content_type=content_type)
                response.headers["Access-Control-Allow-Origin"] = "*"
                return response
            return handle_get(schema, request)
        elif request.method == "POST":
            return handle_post(schema, request)
        else:
            return _cors_response({"error": "Method Not Allowed"}, 405)

    except LookupError as e:
        logger.warning(f"Not Found: {e}")
        return _cors_response({"error": str(e)}, 404)
    except ContentUnavailableError as e:
        logger.error(f"Content Unavailable: {e}")
        return _cors_response({"error": str(e)}, 503)
    except ValueError as e:
        logger.warning(f"Validation/Auth Error: {e}")
        return _cors_response({"error": str(e)}, 400)
    except SQLAlchemyError as e:
        logger.error(f"Database Error: {e}")
        return _cors_response({"error": "Database error occurred"}, 500)
    except Exception as e:
        logger.error(f"Unexpected Error: {e}")
        return _cors_response({"error": "Internal server error"}, 500)


"""
===========================================
DEPLOYMENT COMMANDS (Gen2)
===========================================

Development Deployment:
------------------------
gcloud functions deploy dev_get_emp_training_course_v2 \
  --gen2 \
  --runtime python310 \
  --trigger-http \
  --entry-point get_emp_training_course_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --allow-unauthenticated \
  --region asia-south1 \
  --set-env-vars ENV=development,DB_USER=YOUR_DB_USER,DB_PASS=YOUR_DB_PASS,DB_NAME=YOUR_DB_NAME,DB_HOST=YOUR_DB_HOST,DB_PORT=5432,DB_SCHEMA=skill_matrix_v2_dev

Production Deployment:
---------------------
gcloud functions deploy get_emp_training_course_v2 \
  --gen2 \
  --runtime python310 \
  --trigger-http \
  --entry-point get_emp_training_course_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --allow-unauthenticated \
  --region asia-south1 \
  --set-env-vars ENV=production,DB_USER=YOUR_DB_USER,DB_PASS=YOUR_DB_PASS,DB_NAME=YOUR_DB_NAME,DB_HOST=YOUR_DB_HOST,DB_PORT=5432,DB_SCHEMA=skill_matrix_v2_prod

Local Testing:
--------------
functions-framework --target=get_emp_training_course_v2 --source main.py --debug --port=8094
"""
