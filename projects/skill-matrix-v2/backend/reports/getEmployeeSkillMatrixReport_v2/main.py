
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
# Try to load .env file if it exists (local development), otherwise use Cloud Functions env vars
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

def generate_report_logic(conn, schema: str):
    """
    Generates the DataFrame for the report.
    """
    
    # 1. Fetch Employees
    # We need: emp_id, name, emp_email, manager_email
    # And we also need to check for updates in Skills, Certificates, Trainings.
    
    # Using SQL to gather data might be efficient, but let's stick to pandas for aggregation 
    # if complex, or SQL if straightforward.
    # The requirement asks for "Skill_update?", "Skill_last_updated_at", etc.
    # "Skill_update?" = "Yes" if updated_at is present? Or recently updated?
    # User said: "Update?" columns will be "Yes" if there is a timestamp, "No" otherwise.
    # Actually, looking at the previous code, it was purely about Competency (DT/NDT).
    # The new requirement is different. 
    # Let's fetch the max updated_at for each category per employee.
    
    query = text(f"""
        WITH 
        SkillUpdates AS (
            SELECT 
                employee_id, 
                MAX(updated_at) as last_updated
            FROM "{schema}".employee_skills
            GROUP BY employee_id
        ),
        CertUpdates AS (
            SELECT 
                employee_id, 
                MAX(updated_at) as last_updated
            FROM "{schema}".employee_certificates
            GROUP BY employee_id
        ),
        TrainingUpdates AS (
            SELECT 
                employee_id, 
                MAX(updated_at) as last_updated
            FROM "{schema}".employee_trainings
            GROUP BY employee_id
        ),
        Managers AS (
             SELECT id, email FROM "{schema}".employee
        )
        SELECT 
            e.emp_id,
            e.name,
            e.email as emp_email,
            m.email as manager_email,
            s.last_updated as skill_last_updated,
            c.last_updated as cert_last_updated,
            t.last_updated as training_last_updated
        FROM "{schema}".employee e
        LEFT JOIN Managers m ON e.reports_to = m.id
        LEFT JOIN SkillUpdates s ON e.id = s.employee_id
        LEFT JOIN CertUpdates c ON e.id = c.employee_id
        LEFT JOIN TrainingUpdates t ON e.id = t.employee_id
        ORDER BY e.id
    """)
    
    df = pd.read_sql(query, conn)
    
    # Process DataFrame
    # Columns required: 
    # emp_id, name, emp_email, manager_email, 
    # Skill_update?, Skill_last_updated_at, 
    # certificat_udated?, cert_last_updated_at, 
    # Training_updated?, training_last_updated_at
    
    result_df = pd.DataFrame()
    result_df["emp_id"] = df["emp_id"]
    result_df["name"] = df["name"]
    result_df["emp_email"] = df["emp_email"]
    result_df["manager_email"] = df["manager_email"]
    
    # Helper to format boolean and date
    def format_yes_no(val):
        return "Yes" if pd.notnull(val) else "No"
    
    def format_date(val):
        return val.strftime("%Y-%m-%d %H:%M:%S") if pd.notnull(val) else ""

    result_df["Skill_update?"] = df["skill_last_updated"].apply(format_yes_no)
    result_df["Skill_last_updated_at"] = df["skill_last_updated"].apply(format_date)
    
    result_df["certificat_udated?"] = df["cert_last_updated"].apply(format_yes_no)
    result_df["cert_last_updated_at"] = df["cert_last_updated"].apply(format_date)
    
    result_df["Training_updated?"] = df["training_last_updated"].apply(format_yes_no)
    result_df["training_last_updated_at"] = df["training_last_updated"].apply(format_date)
    
    return result_df

def get_employee_skill_matrix_report_v2(request: Request):
    """
    Cloud Function Entry Point.
    """
    # Handle CORS OPTIONS
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
            df = generate_report_logic(conn, schema)
            
            # Generate Excel
            output = io.BytesIO()
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                df.to_excel(writer, index=False, sheet_name='Sheet1')
            
            output.seek(0)
            
            response = make_response(output.getvalue())
            response.headers["Content-Type"] = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            timestamp = datetime.now().strftime("%d-%m-%Y_%H-%M")
            response.headers["Content-Disposition"] = f"attachment; filename=EmployeeSkillMatrixReport_{timestamp}.xlsx"
            return _cors_response(response)

    except SQLAlchemyError as e:
        logger.error(f"Database Error: {e}")
        return _cors_response(make_response(json.dumps({"error": "Database error occurred"}), 500))
    except Exception as e:
        logger.error(f"Unexpected Error: {e}")
        return _cors_response(make_response(json.dumps({"error": str(e)}), 500))


"""
Deployment command (Production):

gcloud functions deploy get_employee_skill_matrix_report_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point get_employee_skill_matrix_report_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --allow-unauthenticated \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=production
"""

"""
Deployment command (Development):

gcloud functions deploy dev_get_employee_skill_matrix_report_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point get_employee_skill_matrix_report_v2 \
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
   functions-framework --target=get_employee_skill_matrix_report_v2 --source main.py --debug --port=8083

3. Test URL: http://127.0.0.1:8083/
"""
