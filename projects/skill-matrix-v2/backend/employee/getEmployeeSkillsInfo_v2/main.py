import os
import logging
from urllib.parse import quote_plus
from flask import jsonify, make_response
from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool
from sqlalchemy.exc import SQLAlchemyError
from dotenv import load_dotenv

# Try to load local .env if running locally
try:
    from pathlib import Path
    env_file = Path(__file__).parent.parent.parent / ".env"
    if env_file.exists():
        load_dotenv(env_file)
except Exception:
    pass

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

def get_db_engine():
    """Create and return a SQLAlchemy engine using environment variables."""
    db_user = quote_plus(os.getenv("DB_USER"))
    db_pass = quote_plus(os.getenv("DB_PASS"))
    db_name = os.getenv("DB_NAME")
    db_host = os.getenv("DB_HOST")
    db_port = os.getenv("DB_PORT")

    db_url = f"postgresql+psycopg2://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}"
    return create_engine(db_url, poolclass=NullPool, future=True)

def _cors_response(data, status=200):
    """Helper function to add CORS headers to the response."""
    response = make_response(jsonify(data), status)
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return response

def get_employee_skills_info(request):
    """
    HTTP Cloud Function to fetch summary information of an Employee's ecosystem:
    - active_skills_count
    - pending_approval_count
    - recent_certificate_name
    """
    # Handle CORS preflight request
    if request.method == "OPTIONS":
        headers = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Max-Age": "3600"
        }
        return ("", 204, headers)

    if request.method != "GET":
        return _cors_response({"error": "Method not allowed. Only GET is supported."}, 405)

    employee_id = request.args.get("employee_id")
    if not employee_id:
        return _cors_response({"error": "Missing required query parameter: employee_id"}, 400)

    try:
        employee_id = int(employee_id)
    except ValueError:
        return _cors_response({"error": "employee_id must be an integer"}, 400)

    # Metrics
    active_skills_count = 0
    pending_approval_count = 0
    recent_certificate_name = None

    try:
        engine = get_db_engine()
        schema = os.getenv("DB_SCHEMA")
        with engine.connect() as connection:
            # 1. Gather counts from employee_skills
            # We aggregate by approval_status
            counts_query = text(f"""
                SELECT approval_status, COUNT(*) as status_count
                FROM "{schema}".employee_skills
                WHERE employee_id = :employee_id
                GROUP BY approval_status
            """)
            
            result = connection.execute(counts_query, {"employee_id": employee_id})
            for row in result:
                status = row[0]
                count = row[1]
                if status == 'Approved':
                    active_skills_count = count
                elif status == 'Pending':
                    pending_approval_count = count
            
            # 2. Grab most recent certificate name
            # Falls back to created_at if issued_date is missing
            recent_cert_query = text(f"""
                SELECT mc.cert_name
                FROM "{schema}".employee_certificates ec
                JOIN "{schema}".provider_certificate_mapping pcm ON ec.certificate_id = pcm.id
                JOIN "{schema}".master_certificate mc ON pcm.certificate_id = mc.id
                WHERE ec.employee_id = :employee_id
                ORDER BY COALESCE(ec.issued_date, ec.created_at) DESC
                LIMIT 1
            """)
            
            cert_result = connection.execute(recent_cert_query, {"employee_id": employee_id}).fetchone()
            if cert_result:
                recent_certificate_name = cert_result[0]

        # Final Response Object
        response_data = {
            "active_skills_count": active_skills_count,
            "pending_approval_count": pending_approval_count,
            "recent_certificate_name": recent_certificate_name
        }

        return _cors_response(response_data, 200)

    except SQLAlchemyError as db_err:
        logger.exception("Database error in get_employee_skills_info")
        return _cors_response({"error": "Database error", "details": str(db_err)}, 500)

    except Exception as e:
        logger.exception("Unexpected error in get_employee_skills_info")
        return _cors_response({"error": str(e)}, 500)

"""
Deployment command (Production):

gcloud functions deploy get_employee_skills_info \
  --runtime python311 \
  --trigger-http \
  --entry-point get_employee_skills_info \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --allow-unauthenticated \
  --no-gen2 \
  --region asia-south1 \
  --set-env-vars ENV=production
"""

"""
Deployment command (Development):

gcloud functions deploy dev_get_employee_skills_info \
  --runtime python311 \
  --trigger-http \
  --entry-point get_employee_skills_info \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --allow-unauthenticated \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=development
"""

"""
Local testing command:

1. Validate local .env contains valid skill-matrix-dev-v2 Database variables.
2. Run:
   functions-framework --target=get_employee_skills_info --debug --port=8106
   
3. Test using:
   curl -X GET "http://127.0.0.1:8106/?employee_id=1"
"""
