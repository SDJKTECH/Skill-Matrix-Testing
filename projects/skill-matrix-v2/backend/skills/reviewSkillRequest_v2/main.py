"""
Google Cloud Function to review (approve/reject) employee skill requests.
Uses SQLAlchemy ORM and environment variables.
"""

import os
import logging
from urllib.parse import quote_plus
from flask import Request, jsonify, make_response
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


def review_skill_request_v2(request: Request):
    """
    Review (approve/reject) employee skill requests.
    
    Request body:
    {
        "reviewedByEmployeeId": <int>,  // Employee ID of the reviewer
        "action": "approve" | "reject",
        "reason": <string>,  // Required if action is "reject"
        "skills": [{"empSkillId": <int>}, ...]  // Array of skill IDs to review
    }
    """
    if request.method == "OPTIONS":
        response = make_response("", 204)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        return response

    if request.method == "POST":
        try:
            data = request.get_json(silent=True)
            if not data:
                return _cors_response({"error": "Missing JSON body"}, 400)

            # Get reviewed_by employee_id (not email)
            reviewed_by_employee_id = data.get("reviewedByEmployeeId")
            action = data.get("action")
            reason = data.get("reason", None)
            raw_skills = data.get("skills", [])

            skill_ids = [
                sk["empSkillId"] if isinstance(sk, dict) else sk
                for sk in raw_skills
                if sk
            ]

            # Validate required fields
            if not reviewed_by_employee_id or not action or not raw_skills:
                return _cors_response(
                    {
                        "error": "Missing required fields: reviewedByEmployeeId, action, or skills"
                    },
                    400,
                )

            # Validate reviewed_by_employee_id is an integer
            try:
                reviewed_by_employee_id = int(reviewed_by_employee_id)
            except (ValueError, TypeError):
                return _cors_response(
                    {"error": "Invalid reviewedByEmployeeId. Must be a valid integer."}, 400
                )

            if action not in ["approve", "reject"]:
                return _cors_response(
                    {"error": "Invalid action. Must be 'approve' or 'reject'."}, 400
                )

            if action == "reject" and not reason:
                return _cors_response(
                    {"error": "Rejection reason required for rejection"}, 400
                )

            if not skill_ids:
                return _cors_response({"error": "No valid skill IDs provided"}, 400)

            engine = get_db_engine()
            schema = os.getenv("DB_SCHEMA")

            with engine.begin() as conn:
                # Fetch all skill records to verify they exist
                fetch_sql = text(
                    f'SELECT id, approval_status '
                    f'FROM "{schema}".employee_skills WHERE id = ANY(:ids)'
                )
                existing = conn.execute(fetch_sql, {"ids": skill_ids}).mappings().all()

                if not existing:
                    return _cors_response({"error": "No matching skills found"}, 404)

                # Prepare updates (no authorization check - frontend handles this)
                updates = []
                for row in existing:
                    skill_id = row["id"]
                    new_status = "Approved" if action == "approve" else "Rejected"
                    new_level = "L3" if action == "approve" else "L2"

                    updates.append(
                        {
                            "skillId": skill_id,
                            "status": new_status,
                            "reason": reason if action == "reject" else None,
                            "level": new_level,
                            "reviewed_by": reviewed_by_employee_id,
                        }
                    )

                if not updates:
                    return _cors_response({"message": "No skills to update"}, 200)

                # Bulk update each skill individually (SQLAlchemy doesn't support bulk update with dicts directly)
                update_sql = text(
                    f"""
                    UPDATE "{schema}".employee_skills
                    SET 
                        approval_status = :status,
                        rejection_reason = :reason,
                        level_selected = :level,
                        reviewed_by = :reviewed_by,
                        reviewed_at = NOW()
                    WHERE id = :skillId
                    """
                )
                
                # Execute update for each skill
                for update in updates:
                    conn.execute(update_sql, update)

            logger.info(
                "Bulk skill review (%s) completed by employee_id %s for %d skills",
                action,
                reviewed_by_employee_id,
                len(updates)
            )
            return _cors_response(
                {"message": f"{len(updates)} skills {action}d successfully"},
                200,
            )

        except (SQLAlchemyError, ValueError) as e:
            logger.exception("❌ Error reviewing skills")
            return _cors_response({"error": str(e)}, 500)
        except Exception as e:
            logger.exception("❌ Unexpected error reviewing skills")
            return _cors_response({"error": str(e)}, 500)

    return _cors_response({"error": "Method not allowed"}, 405)


"""
Deployment command (Production):
gcloud functions deploy review_skill_request_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point review_skill_request_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --allow-unauthenticated \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=production
"""

"""
Deployment command (Development):
gcloud functions deploy dev_review_skill_request_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point review_skill_request_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --allow-unauthenticated \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=development
"""

"""
Local testing command:
functions-framework --target=review_skill_request_v2 --source main.py --debug --port=8084
"""
