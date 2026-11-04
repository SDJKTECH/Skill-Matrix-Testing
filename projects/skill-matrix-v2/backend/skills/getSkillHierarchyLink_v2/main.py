"""
Google Cloud Function that fetches rows from the SkillHierarchyLink table
with joined master tables (Domain, Discipline, Skill, Framework).
Uses SQLAlchemy ORM and environment variables.
"""

import json
import os
import logging
from typing import Any, Dict, List
from urllib.parse import quote_plus
from flask import Request, jsonify, make_response
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


def fetch_skill_hierarchy_link() -> List[Dict[str, Any]]:
    """Fetch skill hierarchy links with joined master tables."""
    schema = os.getenv("DB_SCHEMA")
    
    # Validate required environment variables
    required_vars = ["DB_HOST", "DB_USER", "DB_PASS", "DB_NAME"]
    missing_vars = [var for var in required_vars if not os.getenv(var)]
    if missing_vars:
        raise ValueError(f"Missing required environment variables: {', '.join(missing_vars)}")
    
    engine = get_db_engine()
    
    query = text(f"""
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
            mf.basic AS L1,
            mf.intermediate AS L2,
            mf.expert AS L3,
            shl.created_at,
            shl.updated_at
        FROM "{schema}".skill_hierarchy_links shl
        LEFT JOIN "{schema}".master_domain md 
            ON md.id = shl.domain_id
        LEFT JOIN "{schema}".master_discipline mdisc 
            ON mdisc.id = shl.discipline_id
        LEFT JOIN "{schema}".master_skill_area msa 
            ON msa.id = shl.skill_area_id
        LEFT JOIN "{schema}".master_framework mf 
            ON mf.id = shl.framework_id
        ORDER BY md.domain_name, mdisc.discipline_name, msa.skill_area, mf.framework_name
    """)
    
    with engine.connect() as conn:
        result = conn.execute(query)
        rows = result.fetchall()
        # Convert rows to list of dicts
        return [dict(row._mapping) for row in rows]


def get_skill_hierarchy_link_v2(request: Request):
    """
    Cloud Function entry point for getting skill hierarchy links.
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
        data = fetch_skill_hierarchy_link()
        
        # Convert to JSON-serializable format (datetime objects to strings)
        results = []
        for row in data:
            result = {}
            for key, value in row.items():
                if hasattr(value, 'isoformat'):
                    result[key] = value.isoformat()
                else:
                    result[key] = value
            results.append(result)
        
        # Return as array (matching frontend expectation)
        return (json.dumps(results), 200, headers)
        
    except (SQLAlchemyError, ValueError) as exc:
        logger.exception("❌ Error fetching skill hierarchy links")
        error_response = {"error": str(exc)}
        headers = get_cors_headers(request)
        headers['Content-Type'] = 'application/json'
        return (json.dumps(error_response), 500, headers)
    except Exception as exc:
        logger.exception("❌ Unexpected error fetching skill hierarchy links")
        error_response = {"error": str(exc)}
        headers = get_cors_headers(request)
        headers['Content-Type'] = 'application/json'
        return (json.dumps(error_response), 500, headers)


"""
Deployment command (Production):

gcloud functions deploy get_skill_hierarchy_link_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point get_skill_hierarchy_link_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --allow-unauthenticated \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=production
"""

"""
Deployment command (Development):

gcloud functions deploy dev_get_skill_hierarchy_link_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point get_skill_hierarchy_link_v2 \
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
   DB_SCHEMA=your-schema-name

2. Then run:
    functions-framework --target=get_skill_hierarchy_link_v2 --source main.py --debug --port=8082

3. Test URL: http://127.0.0.1:8082/
"""

