"""Google Cloud Function to add new Training Course entries (training_courses table), with direct-to-GCS file upload for course material."""
import os
import logging
from pathlib import Path

from flask import jsonify, make_response
from sqlalchemy.exc import SQLAlchemyError
from dotenv import load_dotenv

import service

try:
    env_file = Path(__file__).parent.parent.parent / ".env"
    if env_file.exists():
        load_dotenv(env_file)
except Exception:
    pass

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


def _add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return response


def _cors_response(data, status=200):
    """Helper function to add CORS headers to any response (private - not an entry point)."""
    return _add_cors_headers(make_response(jsonify(data), status))


def _options_response():
    response = _add_cors_headers(make_response("", 204))
    response.headers["Access-Control-Max-Age"] = "3600"
    return response


def _handle_get(schema, request):
    mode = request.args.get("mode")
    if mode == "all_course_list":
        result = service.list_courses(schema)
        return _cors_response(result, 200)
    return _cors_response({"error": "mode must be 'all_course_list'"}, 400)


def _handle_post(schema, path, request):
    if path.endswith("/upload-url"):
        data = request.get_json(silent=True) or {}
        result = service.create_upload_url(data.get("filename"), data.get("content_type"))
        return _cors_response(result, 200)

    if path.endswith("/lessons/upload-document"):
        result = service.upload_lesson_document(
            schema, request.form.get("lesson_id"), request.files.get("file"))
        return _cors_response(result, 200)

    if path.endswith("/lessons/upload-video"):
        result = service.upload_lesson_video(
            schema, request.form.get("lesson_id"), request.files.get("file"))
        return _cors_response(result, 200)

    if path.endswith("/lessons/finalize-video"):
        data = request.get_json(silent=True) or {}
        result = service.finalize_lesson_video_upload(
            schema, data.get("lesson_id"), data.get("material_path"))
        return _cors_response(result, 200)

    if path.endswith("/lessons/finalize-document"):
        data = request.get_json(silent=True) or {}
        result = service.finalize_lesson_document_upload(
            schema, data.get("lesson_id"), data.get("material_path"))
        return _cors_response(result, 200)

    if path.endswith("/lessons/transcode-callback"):
        result = service.handle_transcode_callback(schema, request.get_json(silent=True) or {})
        return _cors_response(result, 200)

    if path.endswith("/lessons"):
        result = service.create_lesson(schema, request.get_json(silent=True) or {})
        return _cors_response(result, 201)

    result = service.create_course(schema, request.get_json(silent=True) or {})
    return _cors_response(result, 201)


def add_training_course_v2(request):
    """Cloud Function entry point — routes to service.py, which holds all business logic."""
    if request.method == "OPTIONS":
        return _options_response()

    try:
        schema = os.getenv("DB_SCHEMA")
        path = request.path.rstrip("/")

        if request.method == "GET":
            return _handle_get(schema, request)
        if request.method == "POST":
            return _handle_post(schema, path, request)
        return _cors_response({"error": "Method Not Allowed"}, 405)

    except NotImplementedError as e:
        return _cors_response({"error": str(e) or "Not implemented yet"}, 501)
    except LookupError as e:
        logger.warning(f"Not Found: {e}")
        return _cors_response({"error": str(e)}, 404)
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
gcloud functions deploy dev_add_training_course_v2 \
  --gen2 \
  --runtime python310 \
  --trigger-http \
  --entry-point add_training_course_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --no-allow-unauthenticated \
  --region asia-south1 \
  --set-env-vars ENV=development,DB_USER=YOUR_DB_USER,DB_PASS=YOUR_DB_PASS,DB_NAME=YOUR_DB_NAME,DB_HOST=YOUR_DB_HOST,DB_PORT=5432,DB_SCHEMA=skill_matrix_v2_dev,BUCKET_NAME=YOUR_BUCKET_NAME,TRANSCODER_PUBSUB_TOPIC=YOUR_PUBSUB_TOPIC,TRANSCODER_LOCATION=YOUR_TRANSCODER_LOCATION

Production Deployment:
---------------------
gcloud functions deploy add_training_course_v2 \
  --gen2 \
  --runtime python310 \
  --trigger-http \
  --entry-point add_training_course_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --no-allow-unauthenticated \
  --region asia-south1 \
  --set-env-vars ENV=production,DB_USER=YOUR_DB_USER,DB_PASS=YOUR_DB_PASS,DB_NAME=YOUR_DB_NAME,DB_HOST=YOUR_DB_HOST,DB_PORT=5432,DB_SCHEMA=skill_matrix_v2_prod,BUCKET_NAME=YOUR_BUCKET_NAME,TRANSCODER_PUBSUB_TOPIC=YOUR_PUBSUB_TOPIC,TRANSCODER_LOCATION=YOUR_TRANSCODER_LOCATION

Local Testing:
--------------
functions-framework --target=add_training_course_v2 --source main.py --debug --port=8112
"""
