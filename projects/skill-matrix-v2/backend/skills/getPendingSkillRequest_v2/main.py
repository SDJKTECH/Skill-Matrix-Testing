import logging
import os
from urllib.parse import quote_plus
from pathlib import Path
from flask import jsonify, make_response, request
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool
from dotenv import load_dotenv

# Load from backend/.env for local development only (deployed functions use Cloud Functions env vars)
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
    
    # Use NullPool for serverless Cloud Functions (no connection pooling)
    engine = create_engine(db_url, poolclass=NullPool, future=True)
    return engine


def _cors_response(data, status=200):
    """Helper function to add CORS headers to any response (private - not an entry point)"""
    response = make_response(jsonify(data), status)
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


def get_pending_skill_request_v2(request):
    if request.method == "OPTIONS":
        response = make_response("", 204)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        return response

    if request.method == "GET":
        try:
            # Get manager_id (dbEmployeeId) and isManager from query params
            manager_id = request.args.get("managerId")
            is_manager = request.args.get("isManager", "").lower() == "true"
            
            if not manager_id:
                return _cors_response(
                    {"error": "Missing required query param: managerId"}, 400
                )
            
            # Validate that user is a manager
            if not is_manager:
                return _cors_response(
                    {"error": "User is not a manager. Only managers can view pending requests."}, 403
                )
            
            try:
                manager_id = int(manager_id)
            except (ValueError, TypeError):
                return _cors_response(
                    {"error": "Invalid managerId. Must be a valid integer."}, 400
                )
            
            engine = get_db_engine()
            schema = os.getenv("DB_SCHEMA")
            
            with engine.begin() as conn:
                # Step 1: Find all employees who have this manager's id as their reports_to
                # Step 2: Get those employees' L3 skills that are in 'Pending' state
                # This query:
                # - Joins employee_skills with employee table
                # - Filters by e.reports_to = manager_id (employees managed by this manager)
                # - Filters by es.approval_status = 'Pending' (only pending requests)
                # - Filters by es.level_selected = 'L3' (only expert-level skills)
                # - Groups by employee and aggregates their pending L3 skills
                query = text(
                    f"""
                    SELECT json_agg(
                        json_build_object(
                            'id', t.id,
                            'employee', t.name,
                            'skills', t.skills
                        )
                    ) AS result
                    FROM (
                        SELECT e.id,
                            e.name,
                            json_agg(
                                json_build_object(
                                    'Category', md.domain_name,
                                    'Sub-Category', mdisc.discipline_name,
                                    'Sub-Sub-Category', msa.skill_area,
                                    'Tools', mf.framework_name,
                                    'Level', es.level_selected,
                                    'skillhierarchy_id', shl.id,
                                    'status', es.approval_status,
                                    'skillId', es.id
                                )
                            ) AS skills
                        FROM "{schema}".employee_skills es
                        JOIN "{schema}".employee e ON e.id = es.employee_id
                        JOIN "{schema}".skill_hierarchy_links shl ON shl.id = es.skill_hierarchy_id
                        LEFT JOIN "{schema}".master_domain md ON md.id = shl.domain_id
                        LEFT JOIN "{schema}".master_discipline mdisc ON mdisc.id = shl.discipline_id
                        LEFT JOIN "{schema}".master_skill_area msa ON msa.id = shl.skill_area_id
                        LEFT JOIN "{schema}".master_framework mf ON mf.id = shl.framework_id
                        WHERE es.approval_status = 'Pending'
                        AND es.level_selected = 'L3'
                        AND e.reports_to = :manager_id
                        GROUP BY e.id, e.name
                        ORDER BY e.id
                    ) t;
                    """
                )
                result = conn.execute(query, {"manager_id": manager_id}).scalar()

            if not result:
                return _cors_response([], 200)

            return _cors_response(result, 200)

        except Exception as e:
            logger.exception("❌ Error fetching pending skill requests")
            return _cors_response({"error": str(e)}, 500)

    return _cors_response({"error": "Method not allowed"}, 405)


"""
Deployment command (Production):
gcloud functions deploy get_pending_skill_request_v2
  --runtime python310
  --trigger-http
  --entry-point get_pending_skill_request_v2
  --service-account training-project-419308@appspot.gserviceaccount.com
  --allow-unauthenticated
  --gen2
  --region asia-south1
  --set-env-vars ENV=production
"""
"""
Deployment command (Development):
gcloud functions deploy dev_get_pending_skill_request_v2
  --runtime python310
  --trigger-http
  --entry-point get_pending_skill_request_v2
  --service-account training-project-419308@appspot.gserviceaccount.com
  --allow-unauthenticated
  --gen2
  --region asia-south1
  --set-env-vars ENV=development
"""
"""
Local testing command:
functions-framework --target=get_pending_skill_request_v2 --debug --port=8083
"""
