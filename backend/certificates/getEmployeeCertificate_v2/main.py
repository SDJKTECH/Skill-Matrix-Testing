"""
Google Cloud Function that fetches employee certificates from the employee_certificates table.
Joins with provider_certificate_mapping, master_certificate, and master_certificate_provider.
Uses SQLAlchemy ORM and environment variables.
"""

import json
import os
import logging
from typing import Any, Dict, List
from urllib.parse import quote_plus
from flask import Request
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


def fetch_employee_certificates(email: str) -> List[Dict[str, Any]]:
    """
    Fetch employee certificates from the database filtered by email.
    Joins with provider_certificate_mapping, master_certificate, and master_certificate_provider.
    """
    schema = os.getenv("DB_SCHEMA")
    
    # Validate required environment variables
    required_vars = ["DB_HOST", "DB_USER", "DB_PASS", "DB_NAME"]
    missing_vars = [var for var in required_vars if not os.getenv(var)]
    if missing_vars:
        raise ValueError(f"Missing required environment variables: {', '.join(missing_vars)}")
    
    engine = get_db_engine()
    
    # Query to join employee_certificates with provider_certificate_mapping, master_certificate, and master_certificate_provider
    query = text(f"""
        SELECT 
            pcm.id AS "mappingId",
            mc.cert_name AS "certificateName",
            mc.cert_level AS "certLevel",
            mc.valid_years AS "validYears",
            mcp.cert_provider AS "certProvider",
            ec.issued_date AS "issuedDate",
            ec.expiry_date AS "expiryDate",
            ec.id AS "empCertId"
        FROM "{schema}".employee_certificates ec
        JOIN "{schema}".employee e ON e.id = ec.employee_id
        JOIN "{schema}".provider_certificate_mapping pcm ON pcm.id = ec.certificate_id
        JOIN "{schema}".master_certificate mc ON mc.id = pcm.certificate_id
        JOIN "{schema}".master_certificate_provider mcp ON mcp.id = pcm.provider_id
        WHERE LOWER(e.email) = LOWER(:email)
        ORDER BY ec.id
    """)
    
    with engine.connect() as conn:
        result = conn.execute(query, {"email": email})
        rows = result.fetchall()
        # Convert rows to list of dicts
        return [dict(row._mapping) for row in rows]


def get_employee_certificate_v2(request: Request):
    """
    Cloud Function entry point for getting employee certificates.
    Accepts GET or POST with email (query param for GET, body for POST).
    """
    # Handle CORS preflight
    if request.method == 'OPTIONS':
        headers = get_cors_headers(request)
        headers['Access-Control-Max-Age'] = '3600'
        return ('', 204, headers)
    
    # Set CORS headers
    headers = get_cors_headers(request)
    headers['Content-Type'] = 'application/json'
    
    try:
        # Extract email from request
        if request.method not in ["GET", "POST"]:
            return (json.dumps({"error": "Method not allowed"}), 405, headers)
        
        email = None
        if request.method == "POST":
            data = request.get_json(silent=True) or {}
            email = data.get("email")
        elif request.method == "GET":
            email = request.args.get("email")
        
        if not email:
            return (json.dumps({"error": "Missing required field: email"}), 400, headers)
        
        email = str(email).strip().lower()
        
        # Fetch data from database
        rows = fetch_employee_certificates(email)
        
        # Convert to JSON-serializable format
        certificates = []
        for row in rows:
            cert = {}
            for key, value in row.items():
                # Convert datetime objects to ISO strings
                if hasattr(value, 'isoformat'):
                    if key == "issuedDate":
                        # Extract year from issued_date for yearAchieved (if needed by frontend)
                        cert["yearAchieved"] = value.year if hasattr(value, 'year') else None
                        cert["issuedDate"] = value.isoformat()
                    elif key == "expiryDate":
                        cert[key] = value.isoformat() if value else None
                    else:
                        cert[key] = value.isoformat()
                else:
                    cert[key] = value
            certificates.append(cert)
        
        logger.info(f"✅ Loaded {len(certificates)} certificates for employee {email}")
        
        response_data = {
            "email": email,
            "certificates": certificates
        }
        return (json.dumps(response_data), 200, headers)
        
    except ValueError:
        logger.exception("❌ Validation error fetching employee certificates")
        error_response = {"error": "Invalid request. Please verify the input and try again."}
        headers = get_cors_headers(request)
        headers['Content-Type'] = 'application/json'
        return (json.dumps(error_response), 400, headers)
    except SQLAlchemyError:
        logger.exception("❌ Error fetching employee certificates")
        error_response = {
            "error": "Unable to load employee certificates right now. Please try again."
        }
        headers = get_cors_headers(request)
        headers['Content-Type'] = 'application/json'
        return (json.dumps(error_response), 500, headers)
    except Exception:
        logger.exception("❌ Unexpected error fetching employee certificates")
        error_response = {
            "error": "Something went wrong while loading certificates. Please try again."
        }
        headers = get_cors_headers(request)
        headers['Content-Type'] = 'application/json'
        return (json.dumps(error_response), 500, headers)


"""
Deployment command (Production):

gcloud functions deploy get_employee_certificate_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point get_employee_certificate_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --allow-unauthenticated \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=production
"""

"""
Deployment command (Development):

gcloud functions deploy dev_get_employee_certificate_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point get_employee_certificate_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --allow-unauthenticated \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=development
"""

"""
Local testing command:

1. Create a .env file in this directory with your database credentials:
   DB_HOST=your-database-host
   DB_USER=your-database-username
   DB_PASS=your-database-password
   DB_NAME=your-database-name
   DB_PORT=5432
   DB_SCHEMA=skill_matrix_v2_dev

2. Then run:
   functions-framework --target=get_employee_certificate_v2 --source main.py --debug --port=8102

3. Test URL: http://127.0.0.1:8102/
"""
