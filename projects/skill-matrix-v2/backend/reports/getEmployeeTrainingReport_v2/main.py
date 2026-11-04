import logging
import os
import json
import io
import pandas as pd
from typing import Dict, Any
from urllib.parse import quote_plus
from pathlib import Path
from datetime import datetime

from flask import Request, make_response
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

# Load from backend/.env for local development only
try:
    env_file = Path(__file__).parent.parent.parent / ".env"
    if env_file.exists():
        load_dotenv(env_file)
except Exception:
    pass

# Configure logging
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

def get_db_engine():
    """
    Creates and returns a SQLAlchemy database engine using environment variables.
    """
    db_user = quote_plus(os.getenv("DB_USER"))
    db_pass = quote_plus(os.getenv("DB_PASS"))
    db_name = os.getenv("DB_NAME")
    db_host = os.getenv("DB_HOST")
    db_port = os.getenv("DB_PORT")

    db_url = f"postgresql+psycopg2://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}"
    return create_engine(db_url, poolclass=NullPool, future=True)

def _cors_response(response, status: int = 200):
    """
    Helper function to add CORS headers to a response.
    """
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return response

def fetch_employee_trainings_data(conn, schema: str):
    """
    Fetches the raw data for the training report.
    """
    query = text(f"""
        SELECT 
            e.emp_id,
            e.name,
            e.email as emp_email,
            m.email as manager_email,
            ma.area_name,
            ms.sub_area_name,
            mm.module_name,
            tb.batch_num,
            tb.batch_desc,
            tb.batch_status,
            tb.batch_status_remarks,
            tb.training_mode,
            tb.trainer,
            tb.training_quarter,
            tb.duration,
            tb.batch_size,
            tb.prerequisite,
            tb.training_content,
            tb.resources,
            et.competency,
            et.training_status,
            et.status_remarks,
            et.employee_type,
            et.nominated_by,
            et.start_date,
            et.end_date
        FROM "{schema}".employee_trainings et
        LEFT JOIN "{schema}".training_batches tb ON tb.id = et.batch_id
        JOIN "{schema}".training_hierarchy_links thl ON tb.training_hierarchy_id = thl.training_hierarchy_id
        JOIN "{schema}".master_area ma ON thl.area_id = ma.area_id
        JOIN "{schema}".master_subarea ms ON thl.sub_area_id = ms.sub_area_id
        JOIN "{schema}".master_module mm ON thl.module_id = mm.module_id
        JOIN "{schema}".employee e ON et.employee_id = e.id
        LEFT JOIN "{schema}".employee m ON e.reports_to = m.id
        ORDER BY e.emp_id, ma.area_name, ms.sub_area_name, mm.module_name
    """)
    
    return pd.read_sql(query, conn)

def generate_excel_report(df: pd.DataFrame) -> bytes:
    """
    Generates Excel file without merged cells for employee details.
    """
    # Format dates
    if 'start_date' in df.columns:
        df['start_date'] = pd.to_datetime(df['start_date']).dt.strftime('%Y-%m-%d')
    if 'end_date' in df.columns:
        df['end_date'] = pd.to_datetime(df['end_date']).dt.strftime('%Y-%m-%d')

    output = io.BytesIO()
    
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='EmployeeTrainings')

    output.seek(0)
    return output.getvalue()

def get_employee_training_report_v2(request: Request):
    """
    Cloud Function Entry Point.
    """
    if request.method == "OPTIONS":
        response = make_response("", 204)
        return _cors_response(response)

    if require_sso_bearer:
        _claims, auth_error = require_sso_bearer(request)
        if auth_error is not None:
            return auth_error

    try:
        schema = os.getenv("DB_SCHEMA")
        engine = get_db_engine()

        with engine.begin() as conn:
            df = fetch_employee_trainings_data(conn, schema)
            excel_bytes = generate_excel_report(df)
            
            response = make_response(excel_bytes)
            response.headers["Content-Type"] = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            timestamp = datetime.now().strftime("%d-%m-%Y_%H-%M")
            response.headers["Content-Disposition"] = f"attachment; filename=EmployeeTrainingReport_{timestamp}.xlsx"
            return _cors_response(response)

    except SQLAlchemyError as e:
        logger.error(f"Database Error: {e}")
        return _cors_response(make_response(json.dumps({"error": "Database error occurred"}), 500))
    except Exception as e:
        logger.error(f"Unexpected Error: {e}")
        return _cors_response(make_response(json.dumps({"error": str(e)}), 500))


"""
Deployment command (Production):

gcloud functions deploy get_employee_training_report_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point get_employee_training_report_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --allow-unauthenticated \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=production
"""

"""
Deployment command (Development):

gcloud functions deploy dev_get_employee_training_report_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point get_employee_training_report_v2 \
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
   functions-framework --target=get_employee_training_report_v2 --source main.py --debug --port=8086

3. Test URL: http://127.0.0.1:8086/
"""
