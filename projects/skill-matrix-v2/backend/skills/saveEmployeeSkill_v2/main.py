"""
Google Cloud Function to save employee skills with approval workflow.
Uses SQLAlchemy ORM and environment variables.
Supports email notifications for pending L3 skill requests.
"""

import os
import logging
import requests
from typing import List, Dict, Optional
from urllib.parse import quote_plus, urlparse
from flask import Request, jsonify, make_response
from sqlalchemy import create_engine, text, bindparam
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

import sys
sys.path.append(str(Path(__file__).parent.parent.parent))
try:
    from utils.event_publisher import publish_event
    from utils.event_types import SystemEventType
except ImportError:
    publish_event = None
    SystemEventType = None
try:
    from utils.service_auth import get_service_id_token
except ImportError:
    get_service_id_token = None

# Email configuration (from .env file)
# Note: EMAIL_TEMPLATE should be wrapped in double quotes in .env file
BASE_URL = os.getenv("BASE_URL")
SEND_EMAIL_URL = os.getenv("SEND_EMAIL_URL")
EMAIL_TEMPLATE = os.getenv("EMAIL_TEMPLATE", "").strip('"').strip("'")  # Remove quotes if present
DEFAULT_APP_URL = os.getenv("APP_URL")


def resolve_app_url(request: Request) -> Optional[str]:
    """Skill-matrix link base URL: the request's Origin header, else DEFAULT_APP_URL."""
    origin = request.headers.get("Origin")
    if origin:
        parsed = urlparse(origin)
        if parsed.scheme in ("http", "https") and parsed.netloc:
            return f"{parsed.scheme}://{parsed.netloc}/"
        logger.warning(f"Ignoring malformed Origin header: {origin!r}")
    return DEFAULT_APP_URL


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


def _cors_response(data, status=200):
    """Helper function to add CORS headers to any response (private - not an entry point)"""
    response = make_response(jsonify(data), status)
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return response


def get_employee_info(email: str, conn) -> Optional[tuple]:
    """Get employee ID, name, and manager_id (via reports_to) from email."""
    schema = os.getenv("DB_SCHEMA")
    query = text(
        f'SELECT id, name, reports_to AS manager_id FROM "{schema}".employee WHERE LOWER(email) = LOWER(:email)'
    )
    result = conn.execute(query, {"email": email.lower()}).fetchone()
    return result if result else None


def get_manager_email(manager_id: int, conn) -> Optional[str]:
    """Get manager email from manager_id."""
    if not manager_id:
        return None
    
    schema = os.getenv("DB_SCHEMA")
    query = text(f'SELECT email FROM "{schema}".employee WHERE id = :manager_id')
    result = conn.execute(query, {"manager_id": manager_id}).fetchone()
    return result[0] if result else None


def get_manager_id(manager_email: str, conn) -> Optional[int]:
    """Get manager ID from manager email."""
    if not manager_email:
        return None
    
    schema = os.getenv("DB_SCHEMA")
    query = text(f'SELECT id FROM "{schema}".employee WHERE LOWER(email) = LOWER(:email)')
    result = conn.execute(query, {"email": manager_email.lower()}).fetchone()
    return result[0] if result else None


def get_skill_name(skill_hierarchy_id: int, conn) -> str:
    """Get skill name from skill_hierarchy_id for email display."""
    schema = os.getenv("DB_SCHEMA")
    query = text(f"""
        SELECT 
            COALESCE(md.domain_name, '') || ' | ' ||
            COALESCE(mdisc.discipline_name, '') || ' | ' ||
            COALESCE(msa.skill_area, '') || ' | ' ||
            COALESCE(mf.framework_name, '')
        AS skill_name
        FROM "{schema}".skill_hierarchy_links shl
        LEFT JOIN "{schema}".master_domain md ON md.id = shl.domain_id
        LEFT JOIN "{schema}".master_discipline mdisc ON mdisc.id = shl.discipline_id
        LEFT JOIN "{schema}".master_skill_area msa ON msa.id = shl.skill_area_id
        LEFT JOIN "{schema}".master_framework mf ON mf.id = shl.framework_id
        WHERE shl.id = :skill_hierarchy_id
    """)
    result = conn.execute(query, {"skill_hierarchy_id": skill_hierarchy_id}).fetchone()
    return result[0] if result else f"Skill ID {skill_hierarchy_id}"


def save_employee_skills_v2(email: str, skills: List[Dict], manager_email: str = "", app_url: Optional[str] = None) -> Dict:
    """
    Save employee skills to EmployeeSkill table.
    Skills should have: skillhierarchy_id and Level.
    
    Returns:
        Dictionary with message, pending_count, and saved_count
    """
    schema = os.getenv("DB_SCHEMA")
    engine = get_db_engine()
    
    with engine.begin() as conn:
        # Get employee info
        emp_info = get_employee_info(email, conn)
        if not emp_info:
            raise ValueError(f"Employee not found for email: {email}")
        
        emp_id, emp_name, current_manager_id = emp_info
        
        # Update manager_id if manager_email is provided
        manager_id = current_manager_id
        if manager_email:
            new_manager_id = get_manager_id(manager_email, conn)
            if new_manager_id:
                if current_manager_id != new_manager_id:
                    update_mgr_query = text(
                        f'UPDATE "{schema}".employee SET manager_id = :manager_id, updated_at = NOW() WHERE id = :emp_id'
                    )
                    conn.execute(update_mgr_query, {"manager_id": new_manager_id, "emp_id": emp_id})
                    manager_id = new_manager_id
                    logger.info(f"Updated manager_id to {manager_id} for employee {emp_id}")
            else:
                logger.warning(f"Manager not found for email: {manager_email}")
        
        # Get manager email for notifications
        manager_email_for_notification = None
        if manager_id:
            manager_email_for_notification = get_manager_email(manager_id, conn)
        
        # Fetch all existing skills for this employee
        existing_query = text(
            f"""
            SELECT skill_hierarchy_id, level_selected, approval_status, reviewed_by
            FROM "{schema}".employee_skills
            WHERE employee_id = :emp_id
            """
        )
        existing_skills = {}
        for row in conn.execute(existing_query, {"emp_id": emp_id}).mappings():
            existing_skills[row["skill_hierarchy_id"]] = {
                "level_selected": row["level_selected"],
                "approval_status": row["approval_status"],
                "reviewed_by": row["reviewed_by"],
            }
        
        # Process skills - separate into add/update/delete
        new_skill_ids = {sk.get("skillhierarchy_id") for sk in skills if sk.get("skillhierarchy_id")}
        existing_skill_ids = set(existing_skills.keys())
        
        # Skills to delete: in existing but not in new list
        skills_to_delete = existing_skill_ids - new_skill_ids
        
        # Skills to add/update: in new list
        skills_to_add = []
        skills_to_update = []
        pending_skills = []
        
        for sk in skills:
            skillhierarchy_id = sk.get("skillhierarchy_id")
            level = sk.get("Level")
            
            if not skillhierarchy_id or not level:
                logger.warning(f"Missing skillhierarchy_id or Level in skill: {sk}")
                continue
            
            existing = existing_skills.get(skillhierarchy_id)
            
            # Skip if skill exists with same level (no change needed)
            if existing and existing["level_selected"] == level:
                continue
            
            # Determine approval status
            approval_status = None
            reviewed_by = None
            
            if existing:
                # Skill exists but level changed
                prev_level = existing["level_selected"]
                prev_status = existing["approval_status"]
                
                if prev_status == "Approved" and prev_level == "L3" and level != "L3":
                    # Was approved L3, now downgraded - auto-approve at new level
                    approval_status = "Pre-Approved"
                else:
                    if level == "L3":
                        approval_status = "Pending"
                        reviewed_by = None  # NULL for pending requests
                        pending_skills.append({"skillhierarchy_id": skillhierarchy_id, "level": level})
                    else:
                        approval_status = "Pre-Approved"
            else:
                # New skill
                if level == "L3":
                    approval_status = "Pending"
                    reviewed_by = None  # NULL for pending requests
                    pending_skills.append({"skillhierarchy_id": skillhierarchy_id, "level": level})
                else:
                    approval_status = "Pre-Approved"
            
            skill_data = {
                "employee_id": emp_id,
                "skill_hierarchy_id": skillhierarchy_id,
                "level_selected": level,
                "approval_status": approval_status,
                "reviewed_by": reviewed_by,
            }
            
            if existing:
                skills_to_update.append(skill_data)
            else:
                skills_to_add.append(skill_data)
        
        # Delete skills that are not in the new list
        if skills_to_delete:
            delete_sql = text(
                f'DELETE FROM "{schema}".employee_skills WHERE employee_id = :emp_id AND skill_hierarchy_id IN :skill_ids'
            ).bindparams(bindparam("skill_ids", expanding=True))
            conn.execute(delete_sql, {"emp_id": emp_id, "skill_ids": list(skills_to_delete)})
            logger.info(f"🗑️ Deleted {len(skills_to_delete)} skills not in new list")
        
        # Insert new skills
        if skills_to_add:
            insert_sql = text(
                f"""
                INSERT INTO "{schema}".employee_skills
                (employee_id, skill_hierarchy_id, level_selected, approval_status, reviewed_by, requested_at)
                VALUES (:employee_id, :skill_hierarchy_id, :level_selected, :approval_status, :reviewed_by, NOW())
                """
            )
            # Execute insert for each skill (SQLAlchemy 2.0 pattern)
            for skill_data in skills_to_add:
                conn.execute(insert_sql, skill_data)
            logger.info(f"➕ Added {len(skills_to_add)} new skills")
        
        # Update existing skills (only if level changed)
        if skills_to_update:
            for skill_data in skills_to_update:
                update_sql = text(
                    f"""
                    UPDATE "{schema}".employee_skills
                    SET 
                        level_selected = :level_selected,
                        approval_status = :approval_status,
                        reviewed_by = :reviewed_by,
                        requested_at = NOW(),
                        reviewed_at = CASE 
                            WHEN :approval_status = 'Pending' THEN NULL 
                            ELSE reviewed_at 
                        END,
                        rejection_reason = CASE 
                            WHEN :approval_status = 'Pending' THEN NULL 
                            ELSE rejection_reason 
                        END,
                        updated_at = NOW()
                    WHERE employee_id = :employee_id AND skill_hierarchy_id = :skill_hierarchy_id
                    """
                )
                conn.execute(update_sql, skill_data)
            logger.info(f"🔄 Updated {len(skills_to_update)} skills with changed levels")
    
    # Send email notification for pending L3 skills
    resolved_app_url = app_url or DEFAULT_APP_URL
    if pending_skills and manager_email_for_notification:
        try:
            # Get skill names for email
            engine = get_db_engine()
            with engine.connect() as conn:
                skills_list = [
                    get_skill_name(sk["skillhierarchy_id"], conn)
                    for sk in pending_skills
                ]
            
            # Check if email configuration is available
            if not SEND_EMAIL_URL:
                logger.warning("⚠️ SEND_EMAIL_URL not configured in .env, skipping email notification")
            elif not EMAIL_TEMPLATE:
                logger.warning("⚠️ EMAIL_TEMPLATE not configured in .env, skipping email notification")
            elif not resolved_app_url:
                logger.warning("APP_URL not configured and no Origin on request, skipping email notification")
            else:
                # Limit visible skills in email
                if len(skills_list) > 5:
                    visible = skills_list[:5]
                    hidden = len(skills_list) - 5
                    formatted_skills = "".join(f"<li>{s}</li>" for s in visible)
                    formatted_skills += f"<li><em>+{hidden} more</em></li>"
                else:
                    formatted_skills = "".join(f"<li>{s}</li>" for s in skills_list)
                
                html_body = (
                    EMAIL_TEMPLATE.replace("{{requestee_name}}", emp_name or email)
                    .replace("{{requested_skills}}", formatted_skills)
                    .replace("{{skill_matrix_url}}", resolved_app_url)
                )
                
                subject = f"Skill Review Request from {emp_name or email}"
                email_payload = {
                    "to": manager_email_for_notification,
                    "subject": subject,
                    "body": html_body
                }
                
                logger.info(f"📧 Sending review request email to {manager_email_for_notification}")
                email_headers = {}
                if get_service_id_token:
                    token = get_service_id_token(SEND_EMAIL_URL)
                    if token:
                        email_headers["X-Serverless-Authorization"] = f"Bearer {token}"
                try:
                    response = requests.post(
                        SEND_EMAIL_URL, json=email_payload, headers=email_headers, timeout=10
                    )
                    if response.status_code != 200:
                        logger.warning(
                            f"⚠️ Email service returned {response.status_code}: {response.text}"
                        )
                    else:
                        logger.info("✅ Email sent successfully.")
                except requests.RequestException as e:
                    logger.warning(f"⚠️ Failed to send email: {e}")
        except Exception as e:
            logger.exception(f"❌ Failed to send email notification: {e}")
            
    # Fire Webhook Event Dispatcher
    if publish_event and SystemEventType:
        try:
            publish_event(conn, SystemEventType.EMPLOYEE_SKILLS_UPDATED.value, {
                "action": "UPSERT",
                "employee_email": email,
                "data": {
                    "added_count": len(skills_to_add),
                    "updated_count": len(skills_to_update),
                    "deleted_count": len(skills_to_delete)
                }
            })
        except Exception as e:
            logger.error(f"Webhook dispatch failed: {e}")
    
    return {
        "message": f"Skills saved for {email}",
        "pending_skills_sent_to": manager_email_for_notification if pending_skills else None,
        "pending_count": len(pending_skills),
        "saved_count": len(skills_to_add) + len(skills_to_update),
    }


def save_employee_skill_v2(request: Request):
    """
    Cloud Function entry point.
    Accepts POST with email and skills array.
    """
    # Handle CORS preflight
    if request.method == "OPTIONS":
        headers = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Max-Age": "3600",
        }
        return ("", 204, headers)
    
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Content-Type": "application/json",
    }
    
    try:
        if request.method != "POST":
            return _cors_response({"error": "Method not allowed"}, 405)
        
        data = request.get_json(silent=True) or {}
        email = data.get("email")
        skills = data.get("skills", [])
        manager_email = data.get("managerEmail", "")
        
        if not email:
            return _cors_response({"error": "Missing required field: email"}, 400)
        
        if skills is None:
            return _cors_response({"error": "Missing required field: skills"}, 400)
        
        email = str(email).strip().lower()

        app_url = resolve_app_url(request)
        result = save_employee_skills_v2(email, skills, manager_email, app_url)
        
        return _cors_response(result, 200)
        
    except ValueError as e:
        logger.exception("❌ Validation error in save_employee_skill_v2")
        return _cors_response({"error": str(e)}, 404)
    except (SQLAlchemyError, Exception) as e:
        logger.exception("❌ Error in save_employee_skill_v2")
        return _cors_response({"error": str(e)}, 500)


"""
Deployment command (Production):
gcloud functions deploy save_employee_skill_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point save_employee_skill_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --allow-unauthenticated \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=production
"""

"""
Deployment command (Development):
gcloud functions deploy dev_save_employee_skill_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point save_employee_skill_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --allow-unauthenticated \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=development
"""

"""
Local testing command:
functions-framework --target=save_employee_skill_v2 --source main.py --debug --port=8080
"""
