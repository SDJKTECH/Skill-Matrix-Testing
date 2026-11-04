"""
Google Cloud Function serving raw employee-training records (V2 Schema) for
the Training Analytics admin dashboard. Returns JSON, one row per
employee_trainings record joined against its batch and training hierarchy
names; the frontend aggregates/cross-filters client-side.

GET /?mode=training (default) → { "count": <int>, "records": [ {area_name,
    sub_area_name, module_name, training_quarter, batch_status, ...}, ... ] }

GET /?mode=certificates → { "count": <int>, "records": [ {employee_id,
    cert_name, cert_provider, cert_level, ...}, ... ] }
Certificates have no batch/training-hierarchy link, so this mode can't be
cross-filtered by Area/Sub Area/Module/Batch Quarter. Folded into this same
function rather than a separate endpoint since both modes feed the one
Training Analytics dashboard.
"""
import logging
import os
from urllib.parse import quote_plus
from pathlib import Path

from flask import jsonify, make_response
from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool
from sqlalchemy.exc import SQLAlchemyError
from dotenv import load_dotenv

import sys
sys.path.append(str(Path(__file__).parent.parent.parent))
try:
    from utils.sso_auth import require_sso_bearer
except ImportError:
    require_sso_bearer = None

# Load from backend/.env for local development only (deployed functions use
# Cloud Functions env vars)
try:
    env_file = Path(__file__).parent.parent.parent / ".env"
    if env_file.exists():
        load_dotenv(env_file)
except Exception:
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
    return create_engine(db_url, poolclass=NullPool, future=True)


def _cors_response(data, status=200):
    """Helper function to add CORS headers to a JSON response."""
    response = make_response(jsonify(data), status)
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return response


def fetch_training_analytics_data(connection, schema):
    """One row per employee_trainings record, with batch/hierarchy names and the
    employee's own name/email/department/manager (LEFT-joined, per addTraining_v2)."""
    query = text(f'''
        SELECT
            et.employee_training_id,
            et.employee_id,
            e.name AS employee_name,
            e.email AS employee_email,
            e.department,
            mgr.name AS manager_name,
            et.training_status,
            et.status_remarks,
            et.employee_type,
            tb.id AS batch_id,
            ma.area_id,
            ma.area_name,
            ms.sub_area_name,
            mm.module_name,
            tb.batch_num,
            tb.batch_desc,
            tb.training_quarter,
            tb.batch_status
        FROM "{schema}".employee_trainings et
        LEFT JOIN "{schema}".employee e ON e.id = et.employee_id
        LEFT JOIN "{schema}".employee mgr ON mgr.id = e.reports_to
        JOIN "{schema}".training_batches tb ON tb.id = et.batch_id
        JOIN "{schema}".training_hierarchy_links thl ON tb.training_hierarchy_id = thl.training_hierarchy_id
        JOIN "{schema}".master_area ma ON thl.area_id = ma.area_id
        JOIN "{schema}".master_subarea ms ON thl.sub_area_id = ms.sub_area_id
        JOIN "{schema}".master_module mm ON thl.module_id = mm.module_id
    ''')
    rows = connection.execute(query).mappings().all()

    results = []
    for row in rows:
        entry = dict(row)
        if entry.get("batch_status") is not None:
            entry["batch_status"] = str(entry["batch_status"])
        if entry.get("training_status") is not None:
            entry["training_status"] = str(entry["training_status"])
        if entry.get("employee_type") is not None:
            entry["employee_type"] = str(entry["employee_type"])
        results.append(entry)
    return results


def fetch_certificate_analytics_data(connection, schema):
    """
    Fetch one row per employee_certificates record, joined with its
    provider/certificate catalog names. No status column exists; the
    frontend derives Valid/Expiring Soon/Expired from issued_date/
    expiry_date (see certRecordAdapter.jsx's getCertExpiryStatus).
    """
    query = text(f'''
        SELECT
            ec.id AS employee_certificate_id,
            ec.employee_id,
            mc.cert_name,
            mcp.cert_provider,
            mc.cert_level,
            mc.valid_years,
            ec.issued_date,
            ec.expiry_date
        FROM "{schema}".employee_certificates ec
        JOIN "{schema}".provider_certificate_mapping pcm ON pcm.id = ec.certificate_id
        JOIN "{schema}".master_certificate mc ON mc.id = pcm.certificate_id
        JOIN "{schema}".master_certificate_provider mcp ON mcp.id = pcm.provider_id
    ''')
    rows = connection.execute(query).mappings().all()

    results = []
    for row in rows:
        entry = dict(row)
        if entry.get("issued_date") is not None:
            entry["issued_date"] = entry["issued_date"].isoformat()
        if entry.get("expiry_date") is not None:
            entry["expiry_date"] = entry["expiry_date"].isoformat()
        results.append(entry)
    return results


def get_training_analytics_v2(request):
    """Cloud Function entry point. `mode` query param selects the dataset:
    'training' (default) or 'certificates' — see module docstring."""
    if request.method == "OPTIONS":
        return _cors_response("", 204)

    if require_sso_bearer:
        _claims, auth_error = require_sso_bearer(request)
        if auth_error is not None:
            return auth_error

    mode = (request.args.get("mode") or "training").strip().lower()
    if mode not in ("training", "certificates"):
        return _cors_response({"error": f"Invalid mode '{mode}'. Expected 'training' or 'certificates'."}, 400)

    schema = os.getenv("DB_SCHEMA")
    logger.info(f"Using schema: {schema}, mode: {mode}")

    try:
        engine = get_db_engine()
        with engine.begin() as connection:
            records = (
                fetch_certificate_analytics_data(connection, schema)
                if mode == "certificates"
                else fetch_training_analytics_data(connection, schema)
            )

        logger.info(f"Returning {len(records)} {mode} analytics records")
        return _cors_response({"count": len(records), "records": records}, 200)

    except SQLAlchemyError as e:
        logger.error(f"Database Error: {e}")
        return _cors_response({"error": "Database error occurred"}, 500)
    except Exception as e:
        logger.error(f"Unexpected Error: {e}")
        return _cors_response({"error": str(e)}, 500)


"""
Deployment command (Production):

gcloud functions deploy get_training_analytics_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point get_training_analytics_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=production
"""

"""
Deployment command (Development):

gcloud functions deploy dev_get_training_analytics_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point get_training_analytics_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
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
   functions-framework --target=get_training_analytics_v2 --source main.py --debug --port=8097

3. Test URLs:
   http://127.0.0.1:8097/                       (training records, default)
   http://127.0.0.1:8097/?mode=certificates      (certificate records)
"""
