"""
Google Cloud Function that fetches certificate mappings from the ProviderCertificateMapping table.
Joins with MasterCertificateProvider and MasterCertificate to return complete mapping details.
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


def fetch_certificate_mapping() -> List[Dict[str, Any]]:
    """
    Fetch certificate mappings from the database.
    Joins ProviderCertificateMapping with MasterCertificateProvider and MasterCertificate
    to return complete mapping details including provider name, certificate name, level, and other details.
    """
    schema = os.getenv("DB_SCHEMA")
    
    # Validate required environment variables
    required_vars = ["DB_HOST", "DB_USER", "DB_PASS", "DB_NAME"]
    missing_vars = [var for var in required_vars if not os.getenv(var)]
    if missing_vars:
        raise ValueError(f"Missing required environment variables: {', '.join(missing_vars)}")
    
    engine = get_db_engine()
    
    # Query to join provider_certificate_mapping with master_certificate_provider and master_certificate
    # Returns complete mapping details with provider and certificate information
    query = text(f"""
        SELECT 
            pcm.id AS "mappingId",
            pcm.provider_id AS "providerId",
            pcm.certificate_id AS "certificateId",
            pcm.created_at AS "createdAt",
            pcm.updated_at AS "updatedAt",
            mcp.id AS "providerTableId",
            mcp.cert_provider AS "certProvider",
            mcp.created_at AS "providerCreatedAt",
            mcp.updated_at AS "providerUpdatedAt",
            mc.id AS "certificateTableId",
            mc.cert_name AS "certName",
            mc.cert_level AS "certLevel",
            mc.valid_years AS "validYears",
            mc.created_at AS "certificateCreatedAt",
            mc.updated_at AS "certificateUpdatedAt"
        FROM "{schema}".provider_certificate_mapping pcm
        JOIN "{schema}".master_certificate_provider mcp ON mcp.id = pcm.provider_id
        JOIN "{schema}".master_certificate mc ON mc.id = pcm.certificate_id
        ORDER BY pcm.id
    """)
    
    with engine.connect() as conn:
        result = conn.execute(query)
        rows = result.fetchall()
        # Convert rows to list of dicts
        return [dict(row._mapping) for row in rows]


def get_certificate_mapping_v2(request: Request):
    """
    Cloud Function entry point for getting certificate mappings.
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
        # Fetch data from database
        rows = fetch_certificate_mapping()
        
        # Convert to JSON-serializable format
        mappings = []
        for row in rows:
            mapping = {}
            for key, value in row.items():
                # Convert datetime objects to ISO strings
                if hasattr(value, 'isoformat'):
                    mapping[key] = value.isoformat()
                else:
                    mapping[key] = value
            mappings.append(mapping)
        
        logger.info(f"✅ Loaded {len(mappings)} certificate mappings")
        # Return as array
        return (json.dumps(mappings), 200, headers)
        
    except ValueError:
        logger.exception("❌ Validation error fetching certificate mappings")
        error_response = {"error": "Invalid request. Please verify the input and try again."}
        headers = get_cors_headers(request)
        headers['Content-Type'] = 'application/json'
        return (json.dumps(error_response), 400, headers)
    except SQLAlchemyError:
        logger.exception("❌ Error fetching certificate mappings")
        error_response = {
            "error": "Unable to load certificate mappings right now. Please try again."
        }
        headers = get_cors_headers(request)
        headers['Content-Type'] = 'application/json'
        return (json.dumps(error_response), 500, headers)
    except Exception:
        logger.exception("❌ Unexpected error fetching certificate mappings")
        error_response = {
            "error": "Something went wrong while loading certificate mappings. Please try again."
        }
        headers = get_cors_headers(request)
        headers['Content-Type'] = 'application/json'
        return (json.dumps(error_response), 500, headers)


"""
Deployment command (Production):

gcloud functions deploy get_certificate_mapping_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point get_certificate_mapping_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --allow-unauthenticated \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=production
"""

"""
Deployment command (Development):

gcloud functions deploy dev_get_certificate_mapping_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point get_certificate_mapping_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --allow-unauthenticated \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=development
"""

"""
Local testing command:

functions-framework --target=get_certificate_mapping_v2 --source main.py --debug --port=8100

Test URL: http://127.0.0.1:8100/
"""
