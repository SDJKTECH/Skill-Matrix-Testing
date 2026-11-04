"""
Google Cloud Function for SQL Agent (Gen2 compatible).
Allows natural language queries to be converted to SQL and executed safely.
Uses OpenAI LLM for SQL generation and validation.

Compatible with both Gen1 and Gen2 Cloud Functions.
"""
import logging
from flask import Flask, Request, jsonify, make_response

from service import run_sql_pipeline

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

# Flask app for local development only (not used in Cloud Functions)
app = Flask(__name__)


def _cors_response(data, status=200):
    """Helper function to add CORS headers to any response (private - not an entry point)"""
    response = make_response(jsonify(data), status)
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return response


# helpers for request metadata

def extract_request_info(request) -> dict:
    """Return a dictionary of contextual info from an HTTP request object.

    The function is intentionally lightweight so it can be used with Flask,
    FastAPI (``starlette.Request``) or any other framework that exposes the
    relevant attributes. Calling code might look like::

        info = extract_request_info(request)
        result = run_sql_pipeline(question, request_info=info)

    """
    return {
        "request_id": getattr(request, "request_id", None) or request.headers.get("X-Request-ID"),
        "timestamp": getattr(request, "timestamp", None) or request.headers.get("X-Timestamp"),
        "client_ip": request.remote_addr or request.client.host if hasattr(request, "client") else None,
        "user_agent": request.headers.get("User-Agent"),
        "origin": request.headers.get("Origin"),
        "endpoint": request.path,
        "method": request.method,
    }


# Cloud Functions entrypoint style (request object)
def ask_question_v2(request: Request):
    """
    Cloud Functions entry point compatible with Flask request.
    
    Handles requests at both root path (/) and /query path.
    Cloud Functions Gen2 routes all requests to this entry point.
    
    Request body:
    {
        "question": <string>  // Natural language question
        "session_id": <string> (optional)  // Session ID for follow-up questions
    }
    """
    if request.method == "OPTIONS":
        response = make_response("", 204)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response.headers["Access-Control-Max-Age"] = "3600"
        return response

    if request.method != "POST":
        return _cors_response({"error": "Method not allowed"}, 405)

    try:
        payload = request.get_json(silent=True)
        if not payload:
            return _cors_response({"error": "Missing JSON body"}, 400)

        question = payload.get("question")
        session_id = payload.get("session_id")

        if not question:
            return _cors_response({"error": "Missing 'question' field"}, 400)
        info = extract_request_info(request)
        

        # Run the synchronous pipeline
        result = run_sql_pipeline(question=question, session_id=session_id, request_info=info)

        return _cors_response(result, 200)

    except ValueError as e:
        # User-friendly validation errors (SQL validation, LLM parsing, etc.)
        logger.warning(f"Validation error: {str(e)}")
        return _cors_response({"error": str(e)}, 400)
    except Exception as e:
        # Unexpected errors - log full details but return user-friendly message
        error_msg = str(e)
        logger.exception(f"Unexpected error in ask_question_v2 handler: {error_msg}")
        
        # Provide more specific error messages for common issues
        if "OPENAI_API_KEY" in error_msg or "api key" in error_msg.lower():
            return _cors_response({
                "error": "OpenAI API key is not configured. Please check your environment variables."
            }, 500)
        elif "DB_" in error_msg or "database" in error_msg.lower() or "connection" in error_msg.lower():
            return _cors_response({
                "error": "Database connection error. Please check your database configuration."
            }, 500)
        else:
            return _cors_response({
                "error": f"An error occurred: {error_msg[:100]}. Please check the backend logs for details."
            }, 500)


# Flask route wrappers so you can run locally with `python flask_api.py`
# Root route matches Cloud Function entry point behavior
@app.route("/", methods=["POST", "OPTIONS"])
def _root_flask():
    return ask_question_v2(request)

# Keep /query route for backward compatibility
@app.route("/query", methods=["POST", "OPTIONS"])
def _query_flask():
    return ask_question_v2(request)


@app.route("/health", methods=["GET"])
def health():
    return _cors_response({"status": "ok"}, 200)


"""
===========================================
DEPLOYMENT COMMANDS (Gen2)
===========================================

Development Deployment:
------------------------
gcloud functions deploy dev_ask_question_v2 \
  --gen2 \
  --runtime python310 \
  --trigger-http \
  --entry-point ask_question_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --allow-unauthenticated \
  --region asia-south1 \
  --set-env-vars ENV=development,OPENAI_API_KEY=YOUR_KEY_HERE,DB_USER=YOUR_DB_USER,DB_PASS=YOUR_DB_PASS,DB_NAME=YOUR_DB_NAME,DB_HOST=YOUR_DB_HOST,DB_PORT=5432,DB_SCHEMA=skill_matrix_v2_dev

Production Deployment:
---------------------
gcloud functions deploy ask_question_v2 \
  --gen2 \
  --runtime python310 \
  --trigger-http \
  --entry-point ask_question_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --allow-unauthenticated \
  --region asia-south1 \
  --set-env-vars ENV=production,OPENAI_API_KEY=YOUR_KEY_HERE,DB_USER=YOUR_DB_USER,DB_PASS=YOUR_DB_PASS,DB_NAME=YOUR_DB_NAME,DB_HOST=YOUR_DB_HOST,DB_PORT=5432,DB_SCHEMA=skill_matrix_v2_prod

Local Testing:
--------------
functions-framework --target=ask_question_v2 --source main.py --debug --port=8120
"""
