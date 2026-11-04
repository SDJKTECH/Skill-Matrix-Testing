"""
Cloud Function: accepts JSON body with email and returns skill hierarchy rows.
Uses SQLAlchemy ORM and environment variables.
"""

import os
import json
import logging
from typing import List, Dict
from urllib.parse import quote_plus
from flask import Request, jsonify, make_response
from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool
from sqlalchemy.exc import SQLAlchemyError
from dotenv import load_dotenv
from pathlib import Path

# Load from backend/.env for local development (deployed functions use Cloud Functions env vars)
# Load from backend/.env for local development only (deployed functions use Cloud Functions env vars)
# Try to load .env file if it exists (local development), otherwise use Cloud Functions env vars
try:
    env_file = Path(__file__).parent.parent.parent / ".env"
    if env_file.exists():
        load_dotenv(env_file)
except Exception:
    # Silently continue - Cloud Functions use environment variables set during deployment
    pass

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


def get_db_engine():
    """Create and return a SQLAlchemy engine using environment variables."""
    db_user = quote_plus(os.getenv("DB_USER"))
    db_pass = quote_plus(os.getenv("DB_PASS"))
    db_name = os.getenv("DB_NAME")
    db_host = os.getenv("DB_HOST")
    db_port = os.getenv("DB_PORT")
    
    db_url = f"postgresql+psycopg2://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}"
    
    engine = create_engine(db_url, poolclass=NullPool, future=True)
    return engine


def fetch_skills_for_email(email: str) -> List[Dict[str, str]]:
    """Run the provided query to fetch skill hierarchy data for an email."""
    schema = os.getenv("DB_SCHEMA")
    engine = get_db_engine()
    
    query = text(
        f"""
        SELECT 
            shl.id AS skillhierarchy_id,
            shl.domain_id,
            md.domain_name,
            shl.discipline_id,
            mdisc.discipline_name,
            shl.skill_area_id,
            msa.skill_area,
            shl.framework_id,
            mf.framework_name,
            es.level_selected,
            es.approval_status,
            es.rejection_reason,
            shl.created_at,
            shl.updated_at
        FROM "{schema}".skill_hierarchy_links shl
        JOIN "{schema}".employee_skills es 
            ON es.skill_hierarchy_id = shl.id
        JOIN "{schema}".employee e 
            ON e.id = es.employee_id
        LEFT JOIN "{schema}".master_domain md 
            ON md.id = shl.domain_id
        LEFT JOIN "{schema}".master_discipline mdisc 
            ON mdisc.id = shl.discipline_id
        LEFT JOIN "{schema}".master_skill_area msa 
            ON msa.id = shl.skill_area_id
        LEFT JOIN "{schema}".master_framework mf 
            ON mf.id = shl.framework_id
        WHERE LOWER(e.email) = LOWER(:email)
        """
    )
    
    with engine.connect() as conn:
        result = conn.execute(query, {"email": email})
        rows = result.fetchall()
        # Convert rows to list of dicts
        return [dict(row._mapping) for row in rows]

def get_cors_headers(request: Request) -> Dict[str, str]:
    """
    Get CORS headers that allow localhost for local development
    and Cloud Run origins for deployed frontend.
    """
    origin = request.headers.get('Origin', '')
    # Allow localhost for local development and Cloud Run for deployed frontend
    allowed_origins = [
        'http://localhost:5173',  # Vite dev server
        'https://skill-matrix-v2-dev-140475459295.asia-south1.run.app',  # V2 Dev Cloud Run
    ]
    
    # If origin is in allowed list, use it; otherwise use * for production
    if origin in allowed_origins:
        return {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Credentials': 'true'
        }
    else:
        # For any other origin, allow it (but without credentials)
        return {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }

def _cors_response(data, status=200, request=None):
    """Helper function to add CORS headers to any response (private - not an entry point)"""
    response = make_response(jsonify(data), status)
    if request:
        headers = get_cors_headers(request)
        for key, value in headers.items():
            response.headers[key] = value
    else:
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return response


def get_employee_skill_v2(request: Request):
    """
    Cloud Function entry point.
    Accepts POST/GET with email and returns skill hierarchy rows.
    """
    # Handle CORS preflight
    if request.method == "OPTIONS":
        headers = get_cors_headers(request)
        headers["Access-Control-Max-Age"] = "3600"
        return ("", 204, headers)

    if request.method not in ["GET", "POST"]:
        return _cors_response({"error": "Method not allowed"}, 405, request)

    try:
        # Extract email
        email = None
        if request.method == "POST":
            data = request.get_json(silent=True) or {}
            email = data.get("email")
        elif request.method == "GET":
            email = request.args.get("email")

        if not email:
            return _cors_response({"error": "Missing required field: email"}, 400, request)

        email = str(email).lower().strip()

        rows = fetch_skills_for_email(email)

        # Convert datetime objects to ISO strings
        safe_rows = []
        for row in rows:
            safe_row = {}
            for key, val in row.items():
                if hasattr(val, "isoformat"):
                    safe_row[key] = val.isoformat()
                else:
                    safe_row[key] = val
            
            safe_rows.append(safe_row)

        logger.info(f"✅ Loaded {len(safe_rows)} skills for employee {email}")
        return _cors_response({"email": email, "skills": safe_rows}, 200, request)

    except SQLAlchemyError as e:
        logger.exception("Database error in get_employee_skill_v2")
        return _cors_response({"error": f"Database error: {str(e)}"}, 500, request)
    except Exception as e:
        logger.exception("Unexpected error in get_employee_skill_v2")
        return _cors_response({"error": str(e)}, 500, request)


"""
Deployment command (Production):

gcloud functions deploy get_employee_skill \
  --runtime python310 \
  --trigger-http \
  --entry-point get_employee_skill \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --allow-unauthenticated \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=production
"""

"""
Deployment command (Development):

gcloud functions deploy get_employee_skill_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point get_employee_skill_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --allow-unauthenticated \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=development
"""

"""
Local testing command:

functions-framework --target=get_employee_skill_v2 --source main.py --debug --port=8081

Test URL: http://127.0.0.1:8081/
Test with POST:
curl -X POST http://127.0.0.1:8081/ \
  -H "Content-Type: application/json" \
  -d '{"email": "employee@example.com"}'
"""

