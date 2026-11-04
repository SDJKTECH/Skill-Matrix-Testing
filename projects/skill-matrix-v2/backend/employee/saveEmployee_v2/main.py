"""
Google Cloud Function that saves/updates employee details in the employee table (v2 schema).
Called when an employee logs in to ensure their details are up-to-date in the database.
Uses snake_case table and column names (v2 schema: skill_matrix_v2_dev).
"""

import json
import os
import logging
from typing import Dict, Optional, Any
from pathlib import Path

import psycopg2
from psycopg2 import sql
from psycopg2.extras import RealDictCursor
from flask import Request
from dotenv import load_dotenv

# Load from backend/.env for local development only (deployed functions use Cloud Functions env vars)
# Try to load .env file if it exists (local development), otherwise use Cloud Functions env vars
try:
    env_file = Path(__file__).parent.parent.parent / ".env"
    if env_file.exists():
        load_dotenv(env_file)
except Exception:
    # Silently continue - Cloud Functions use environment variables set during deployment
    pass

import sys
# Add backend directory to path to import utils
sys.path.append(str(Path(__file__).parent.parent.parent))
try:
    from utils.event_publisher import publish_event
    from utils.event_types import SystemEventType
except ImportError:
    publish_event = None
    SystemEventType = None

logger = logging.getLogger(__name__)


class DevLoginNotAuthorized(Exception):
    """Raised when a dev-login caller's adminEmail is missing or not an admin."""


class DevLoginEmployeeNotFound(Exception):
    """Raised when the target employee for a dev-login lookup doesn't exist."""


def get_db_connection():
    """Create and return a PostgreSQL database connection."""
    conn = psycopg2.connect(
        host=os.getenv("DB_HOST"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASS"),
        dbname=os.getenv("DB_NAME"),
        port=int(os.getenv("DB_PORT")),
        options=f"-c search_path={os.getenv('DB_SCHEMA')}",
    )
    return conn


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


def get_employee_for_dev_login(email: str, admin_email: Optional[str]) -> Dict[str, Any]:
    """
    Read-only lookup for the Dev Login "view as" feature.

    Unlike save_employee_details, this never INSERTs or UPDATEs the employee
    table — Dev Login is a preview for admins, not a real login, so it must
    not overwrite the target employee's real data (e.g. name) or create a
    row for a mistyped email. Requires admin_email to belong to an existing
    employee with an admin role, checked against the DB (not client-supplied).
    """
    schema = os.getenv("DB_SCHEMA")

    if not admin_email:
        raise DevLoginNotAuthorized("Missing adminEmail")

    with get_db_connection() as conn:
        admin_email_lower = admin_email.lower().strip()
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                sql.SQL("SELECT role FROM {employee} WHERE LOWER(email) = LOWER(%s)").format(
                    employee=sql.Identifier(schema, "employee")
                ),
                (admin_email_lower,),
            )
            admin_row = cur.fetchone()

        admin_role = (dict(admin_row).get("role") or "").lower().strip() if admin_row else ""
        if admin_role not in ("admin", "administrator"):
            raise DevLoginNotAuthorized(f"{admin_email} is not authorized for dev login")

        email_lower = email.lower().strip()
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                sql.SQL("SELECT * FROM {employee} WHERE LOWER(email) = LOWER(%s)").format(
                    employee=sql.Identifier(schema, "employee")
                ),
                (email_lower,),
            )
            target_row = cur.fetchone()

        if not target_row:
            raise DevLoginEmployeeNotFound(f"No employee found for {email}")

        target = dict(target_row)
        employee_db_id = target.get("id")
        manager_id = target.get("reports_to")

        is_manager = False
        if employee_db_id:
            with conn.cursor() as cur:
                cur.execute(
                    sql.SQL("SELECT 1 FROM {employee} WHERE reports_to = %s LIMIT 1").format(
                        employee=sql.Identifier(schema, "employee")
                    ),
                    (employee_db_id,),
                )
                is_manager = cur.fetchone() is not None

        manager_email = ""
        if manager_id:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    sql.SQL("SELECT email FROM {employee} WHERE id = %s").format(
                        employee=sql.Identifier(schema, "employee")
                    ),
                    (manager_id,),
                )
                manager_result = cur.fetchone()
                if manager_result:
                    manager_email = dict(manager_result).get("email") or ""

        return {
            "id": employee_db_id,
            "managerEmail": manager_email,
            "cvPublicUrl": target.get("cv_public_url") or "",
            "role": target.get("role") or "User",
            "isManager": is_manager,
            "empId": target.get("emp_id"),
            "jobTitle": target.get("job_title"),
            "department": target.get("department"),
            "message": "Employee details fetched (dev-login preview, read-only)",
        }


def save_employee_details(
    employee_id: Optional[str],
    email: str,
    name: str,
    job_title: Optional[str] = None,
    department: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Save or update employee details in the employee table (v2 schema).

    Args:
        employee_id: Employee ID (maps to emp_id column in v2 schema)
        email: Employee email (unique identifier)
        name: Employee display name
        job_title: Optional job title (maps to job_title column in v2 schema)
        department: Optional department

    Returns:
        Dictionary with managerEmail (retrieved via manager_id), cvPublicUrl, role, and isManager
    """
    schema = os.getenv("DB_SCHEMA")
    
    with get_db_connection() as conn:
        conn.autocommit = False
        
        try:
            # Normalize email to lowercase
            email_lower = email.lower().strip()
            
            # Check if employee exists - use SELECT * to get all columns
            # This handles cases where managerEmail, cvPublicUrl, or role might not exist
            check_query = sql.SQL("""
                SELECT *
                FROM {employee}
                WHERE LOWER(email) = LOWER(%s)
            """).format(employee=sql.Identifier(schema, "employee"))
            
            existing_employee = None
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(check_query, (email_lower,))
                result = cur.fetchone()
                if result:
                    existing_employee = dict(result)
            
            # Check if user is a manager (any employee has this user's id as their reports_to)
            is_manager = False
            if existing_employee:
                # Get the employee's id
                employee_db_id = existing_employee.get("id")
                
                if employee_db_id:
                    # Check if any other employee has this id as their reports_to
                    is_manager_query = sql.SQL("""
                        SELECT 1
                        FROM {employee}
                        WHERE reports_to = %s
                        LIMIT 1
                    """).format(employee=sql.Identifier(schema, "employee"))
                    
                    with conn.cursor() as cur:
                        cur.execute(is_manager_query, (employee_db_id,))
                        is_manager_result = cur.fetchone()
                        is_manager = True if is_manager_result else False
            
            if existing_employee:
                # Employee exists → update details. COALESCE lets a caller
                # (e.g. dev-login) omit emp_id/job_title/department without
                # overwriting real data; no-op when real values are sent.
                update_query = sql.SQL("""
                    UPDATE {employee}
                    SET emp_id = COALESCE(%s, emp_id),
                        name = %s,
                        job_title = COALESCE(%s, job_title),
                        department = COALESCE(%s, department),
                        updated_at = NOW()
                    WHERE LOWER(email) = LOWER(%s)
                """).format(employee=sql.Identifier(schema, "employee"))
                
                with conn.cursor() as cur:
                    cur.execute(
                        update_query,
                        (
                            employee_id,
                            name,
                            job_title,
                            department,
                            email_lower,
                        ),
                    )
                
                conn.commit()
                logger.info(f"Updated employee {email_lower}")
                
                # Extract manager email (via reports_to), cv_public_url, role, and id (v2 schema uses snake_case)
                employee_db_id = existing_employee.get("id")
                manager_id = existing_employee.get("reports_to")
                cv_url = existing_employee.get("cv_public_url") or ""
                role = existing_employee.get("role") or "User"
                
                # Get manager email if manager_id exists
                manager_email = ""
                if manager_id:
                    manager_email_query = sql.SQL("""
                        SELECT email FROM {employee} WHERE id = %s
                    """).format(employee=sql.Identifier(schema, "employee"))
                    with conn.cursor(cursor_factory=RealDictCursor) as cur:
                        cur.execute(manager_email_query, (manager_id,))
                        manager_result = cur.fetchone()
                        if manager_result:
                            manager_email = dict(manager_result).get("email") or ""
                
                # Real DB values (same COALESCE fallback as the UPDATE above)
                result_dict = {
                    "id": employee_db_id,
                    "managerEmail": manager_email,
                    "cvPublicUrl": cv_url,
                    "role": role,
                    "isManager": is_manager,
                    "empId": employee_id if employee_id is not None else existing_employee.get("emp_id"),
                    "jobTitle": job_title if job_title is not None else existing_employee.get("job_title"),
                    "department": department if department is not None else existing_employee.get("department"),
                    "message": "Employee details updated successfully",
                }

                # Fire Webhook Event Dispatcher
                if publish_event and SystemEventType:
                    try:
                        publish_event(conn, SystemEventType.EMPLOYEE_UPDATED.value, {
                            "action": "UPDATE",
                            "data": {
                                "employee_id": employee_id,
                                "email": email_lower,
                                "name": name,
                                "job_title": job_title,
                                "department": department
                            }
                        })
                    except Exception as e:
                        logger.error(f"Webhook dispatch failed: {e}")

                return result_dict
            else:
                # Employee doesn't exist → insert new employee
                # Insert emp_id, email, name, job_title, and department (v2 schema uses snake_case)
                insert_query = sql.SQL("""
                    INSERT INTO {employee}
                        (emp_id, email, name, job_title, department, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, NOW(), NOW())
                """).format(employee=sql.Identifier(schema, "employee"))
                
                with conn.cursor() as cur:
                    cur.execute(
                        insert_query,
                        (
                            employee_id,
                            email_lower,
                            name,
                            job_title,
                            department,
                        ),
                    )
                
                conn.commit()
                logger.info(f"Created new employee {email_lower}")
                
                # Fetch the newly created employee's id
                employee_db_id = None
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute(check_query, (email_lower,))
                    result = cur.fetchone()
                    if result:
                        employee_db_id = dict(result).get("id")
                
                result_dict = {
                    "id": employee_db_id,
                    "managerEmail": "",
                    "cvPublicUrl": "",
                    "role": "User",
                    "isManager": is_manager,
                    "empId": employee_id,
                    "jobTitle": job_title,
                    "department": department,
                    "message": "Employee created successfully",
                }
                
                # Fire Webhook Event Dispatcher
                if publish_event and SystemEventType:
                    try:
                        publish_event(conn, SystemEventType.EMPLOYEE_CREATED.value, {
                            "action": "CREATE",
                            "data": {
                                "employee_id": employee_id,
                                "email": email_lower,
                                "name": name,
                                "job_title": job_title,
                                "department": department
                            }
                        })
                    except Exception as e:
                        logger.error(f"Webhook dispatch failed: {e}")
                        
                return result_dict
                
        except psycopg2.IntegrityError as e:
            conn.rollback()
            # Handle unique constraint violations
            if "email" in str(e):
                logger.error(f"Email {email_lower} already exists")
                raise ValueError(f"Email {email_lower} already exists")
            else:
                raise
        except Exception as e:
            conn.rollback()
            logger.exception(f"Error saving employee {email_lower}")
            raise


def save_employee_v2(request: Request):
    """
    Cloud Function entry point for saving/updating employee details.
    Accepts POST with employeeId, userPrincipalName (email), displayName, jobTitle, department.
    """
    # Handle CORS preflight
    if request.method == "OPTIONS":
        headers = get_cors_headers(request)
        headers["Access-Control-Max-Age"] = "3600"
        return ("", 204, headers)
    
    headers = get_cors_headers(request)
    headers["Content-Type"] = "application/json"
    
    try:
        if request.method != "POST":
            return (json.dumps({"error": "Method not allowed"}), 405, headers)
        
        data = request.get_json(silent=True) or {}

        email = data.get("userPrincipalName")  # This is the email field from Azure AD

        # Validate required fields
        if not email:
            return (
                json.dumps({"error": "Missing required field: userPrincipalName"}),
                400,
                headers,
            )

        # Normalize email to lowercase
        email = str(email).lower().strip()

        # Dev Login "view as" flow: read-only lookup, never writes to the
        # employee table. adminEmail is checked against the DB's role column
        # rather than trusted as-is.
        if data.get("isDevLogin"):
            result = get_employee_for_dev_login(
                email=email,
                admin_email=data.get("adminEmail"),
            )
            return (json.dumps(result), 200, headers)

        # employeeId is not required — omitting it lets save_employee_details's
        # COALESCE preserve the existing value instead of overwriting it.
        employee_id = data.get("employeeId")
        name = data.get("displayName")

        if not name:
            return (
                json.dumps({"error": "Missing required field: displayName"}),
                400,
                headers,
            )

        # Extract optional fields
        job_title = data.get("jobTitle")
        department = data.get("department")

        # Save employee details
        result = save_employee_details(
            employee_id=str(employee_id) if employee_id else None,
            email=email,
            name=str(name),
            job_title=job_title,
            department=department,
        )

        return (json.dumps(result), 200, headers)

    except DevLoginNotAuthorized as e:
        headers = get_cors_headers(request)
        headers["Content-Type"] = "application/json"
        return (json.dumps({"error": str(e) or "Not authorized for dev login"}), 403, headers)
    except DevLoginEmployeeNotFound as e:
        headers = get_cors_headers(request)
        headers["Content-Type"] = "application/json"
        return (json.dumps({"error": str(e) or "Employee not found"}), 404, headers)
    except ValueError as e:
        headers = get_cors_headers(request)
        headers["Content-Type"] = "application/json"
        return (json.dumps({"error": str(e)}), 400, headers)
    except psycopg2.Error as exc:
        logger.exception("Database error in save_employee")
        headers = get_cors_headers(request)
        headers["Content-Type"] = "application/json"
        return (
            json.dumps({"error": f"Database error: {str(exc)}"}),
            500,
            headers,
        )
    except Exception as exc:
        logger.exception("Error in save_employee")
        headers = get_cors_headers(request)
        headers["Content-Type"] = "application/json"
        return (json.dumps({"error": str(exc)}), 500, headers)


"""
Deployment command (Production):

gcloud functions deploy save_employee \
  --runtime python310 \
  --trigger-http \
  --entry-point save_employee \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --allow-unauthenticated \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=production
"""

"""
Deployment command (Development):

gcloud functions deploy dev_save_employee_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point save_employee_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --allow-unauthenticated \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=development
"""

"""
Local testing command:

functions-framework --target=save_employee_v2 --source main.py --debug --port=8080

Test URL: http://127.0.0.1:8080/
Test with POST:
curl -X POST http://127.0.0.1:8080/ \
  -H "Content-Type: application/json" \
  -d '{
    "employeeId": "EMP001",
    "userPrincipalName": "test@example.com",
    "displayName": "Test User",
    "jobTitle": "Software Engineer",
    "department": "Engineering"
  }'
"""

