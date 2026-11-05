"""
Google Cloud Function that updates the manager email for an employee.
Uses SQLAlchemy ORM and auto-creates manager if not found (for @jktech.com emails).
"""

import os
import logging
from typing import Dict, Any, Optional
from urllib.parse import quote_plus
from flask import Request, jsonify, make_response
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.pool import NullPool
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


def is_jktech_email(email: str) -> bool:
    """Check if email ends with @jktech.com"""
    return email.lower().endswith("@jktech.com")


def get_or_create_manager(manager_email: str, conn) -> Optional[int]:
    """
    Get manager_id from manager_email. If not found and email is @jktech.com,
    create a new employee record for the manager.
    
    Returns:
        manager_id (int) or None
    """
    manager_email_lower = manager_email.lower().strip()
    schema = os.getenv("DB_SCHEMA")
    
    # First, try to find existing manager
    find_manager_sql = text(
        f'SELECT id FROM "{schema}".employee WHERE LOWER(email) = LOWER(:email)'
    )
    result = conn.execute(find_manager_sql, {"email": manager_email_lower}).fetchone()
    
    if result:
        return result[0]  # Manager exists, return their ID
    
    # Manager not found - check if we should create them
    if not is_jktech_email(manager_email_lower):
        logger.warning(f"Manager {manager_email_lower} not found and not a @jktech.com email")
        return None
    
    # Create new employee record for manager
    logger.info(f"Creating new employee record for manager: {manager_email_lower}")
    
    insert_manager_sql = text(
        f"""
        INSERT INTO "{schema}".employee (email, role, created_at, updated_at)
        VALUES (:email, :role, NOW(), NOW())
        RETURNING id
        """
    )
    
    try:
        result = conn.execute(
            insert_manager_sql,
            {
                "email": manager_email_lower,
                "role": "Manager"  # Set role to Manager when created as a manager
            }
        ).fetchone()
        
        if result:
            manager_id = result[0]
            logger.info(f"Created new manager employee with id={manager_id} and role=Manager for {manager_email_lower}")
            return manager_id
    except SQLAlchemyError as e:
        logger.error(f"Error creating manager employee: {e}")
        raise
    
    return None


def _update_manager_email(
    email: str,
    manager_email: str,
) -> Dict[str, Any]:
    """
    Update the manager_id for an employee by converting manager_email to manager_id.
    If manager doesn't exist and email is @jktech.com, creates a new employee record.
    
    Args:
        email: Employee email (unique identifier)
        manager_email: Manager email to set (will be converted to manager_id)
        
    Returns:
        Dictionary with updated managerEmail and managerId
    """
    schema = os.getenv("DB_SCHEMA")
    engine = get_db_engine()
    
    with engine.begin() as conn:
        try:
            # Normalize emails to lowercase
            email_lower = email.lower().strip()
            manager_email_lower = manager_email.lower().strip() if manager_email else None
            
            if not manager_email_lower:
                raise ValueError("Manager email is required")
            
            # Get or create manager_id from manager_email
            manager_id = get_or_create_manager(manager_email_lower, conn)
            
            if not manager_id:
                raise ValueError(f"Manager not found for email: {manager_email_lower} and cannot be auto-created")
            
            # Update manager's role to "Manager" if not already set
            # This ensures that when someone sets a manager, the manager's role is updated
            update_manager_role_sql = text(
                f"""
                UPDATE "{schema}".employee
                SET role = 'Manager',
                    updated_at = NOW()
                WHERE id = :manager_id
                  AND (role IS NULL OR role != 'Manager')
                """
            )
            conn.execute(update_manager_role_sql, {"manager_id": manager_id})
            logger.info(f"Updated role to 'Manager' for manager_id={manager_id} if needed")
            
            # Update reports_to for the employee (manager relationship)
            update_sql = text(
                f"""
                UPDATE "{schema}".employee
                SET reports_to = :manager_id,
                    updated_at = NOW()
                WHERE LOWER(email) = LOWER(:email)
                RETURNING reports_to, email
                """
            )
            
            result = conn.execute(
                update_sql,
                {
                    "manager_id": manager_id,
                    "email": email_lower
                }
            ).fetchone()
            
            if not result:
                raise ValueError(f"Employee not found for email: {email_lower}")
            
            updated_manager_id = result[0]
            employee_email = result[1]
            
            # Get manager email from manager_id for response
            manager_email_result = None
            if updated_manager_id:
                get_manager_sql = text(
                    f'SELECT email FROM "{schema}".employee WHERE id = :manager_id'
                )
                manager_result = conn.execute(
                    get_manager_sql,
                    {"manager_id": updated_manager_id}
                ).fetchone()
                
                if manager_result:
                    manager_email_result = manager_result[0]
            
            logger.info(
                f"Updated manager_id for {email_lower} to manager_id={updated_manager_id} ({manager_email_result})"
            )
            
            return {
                "managerEmail": manager_email_result or "",
                "managerId": updated_manager_id,
                "message": "Manager updated successfully",
            }
                
        except ValueError as e:
            raise
        except SQLAlchemyError as e:
            logger.exception(f"Database error updating manager for {email_lower}")
            raise
        except Exception as e:
            logger.exception(f"Error updating manager for {email_lower}")
            raise


def _cors_response(data, status=200):
    """Helper function to add CORS headers to any response (private - not an entry point)"""
    response = make_response(jsonify(data), status)
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return response


def update_manager_email_v2(request: Request):
    """
    Cloud Function entry point for updating manager relationship.
    Accepts POST with email and managerEmail.
    Converts managerEmail to manager_id (foreign key) and updates the employee record.
    Auto-creates manager if not found (for @jktech.com emails only).
    """
    # Handle CORS preflight
    if request.method == "OPTIONS":
        response = make_response("", 204)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        return response
    
    if request.method != "POST":
        return _cors_response({"error": "Method not allowed"}, 405)
    
    try:
        data = request.get_json()
        
        if not data:
            return _cors_response({"error": "Missing JSON body"}, 400)
        
        # Extract required fields
        email = data.get("email")
        manager_email = data.get("managerEmail")
        
        # Validate required fields
        if not email:
            return _cors_response({"error": "Missing required field: email"}, 400)
        
        if not manager_email:
            return _cors_response({"error": "Missing required field: managerEmail"}, 400)
        
        # Normalize emails to lowercase
        email = str(email).lower().strip()
        manager_email = str(manager_email).lower().strip()
        
        # Update manager email
        result = _update_manager_email(
            email=email,
            manager_email=manager_email,
        )
        
        return _cors_response(result, 200)
        
    except ValueError as e:
        logger.error(f"Validation error: {e}")
        return _cors_response({"error": str(e)}, 404)
    except SQLAlchemyError as e:
        logger.exception("Database error in update_manager_email")
        return _cors_response({"error": f"Database error: {str(e)}"}, 500)
    except Exception as e:
        logger.exception("Unexpected error in update_manager_email")
        return _cors_response({"error": str(e)}, 500)


"""
Deployment command (Production):

gcloud functions deploy update_manager_email \
  --runtime python310 \
  --trigger-http \
  --entry-point update_manager_email \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --allow-unauthenticated \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=production
"""

"""
Deployment command (Development):

gcloud functions deploy update_manager_email_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point update_manager_email_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --allow-unauthenticated \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=development
"""

"""
Local testing command:

functions-framework --target=update_manager_email_v2 --source main.py --debug --port=8091

Test URL: http://127.0.0.1:8091/
Test with POST:
curl -X POST http://127.0.0.1:8091/ \
  -H "Content-Type: application/json" \
  -d '{
    "email": "employee@example.com",
    "managerEmail": "manager@jktech.com"
  }'
"""

