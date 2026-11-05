"""
Google Cloud Function to manage employee comments (V2 Schema).
Handles GET (fetch trainings with comments) and POST (add new comment).
Supports comments for trainings, skills, certificates, and training batches.
Uses normalized comment table with entity-specific foreign keys.
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

# Load backend/.env only when running locally.
# Deployed functions use their own env vars.
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


def fetch_training_comments(email, connection, schema):
    """Fetch all training records for an employee with latest comments from separate comment table"""
    
    # Verify employee exists in employee table
    emp_query = text(f'SELECT id FROM "{schema}".employee WHERE LOWER(email) = LOWER(:email)')
    emp_result = connection.execute(emp_query, {"email": email.strip()}).mappings().fetchone()
    
    if not emp_result:
        logger.warning(f"Employee not found: {email}")
        raise ValueError(f"Employee with email {email} not found")
    
    emp_id = emp_result['id']
    
    # Fetch training records with latest comments from comment table (using LATERAL joins)
    training_query = text(f"""
        SELECT
            et.employee_training_id,
            et.employee_id,
            tb.batch_num,
            et.competency,
            et.training_status::text AS training_status,
            et.employee_type::text AS employee_type,
            et.nominated_by,
            et.start_date,
            et.end_date,
            ma.area_name,
            msa.sub_area_name,
            mm.module_name,
            mm.course_level,

            employee_comment_data.comment_text AS employee_comment,
            manager_comment_data.comment_text AS manager_comment,
            department_comment_data.comment_text AS department_comment

        FROM "{schema}".employee_trainings et

        LEFT JOIN "{schema}".training_batches tb
            ON tb.id = et.batch_id

        INNER JOIN "{schema}".training_hierarchy_links thl
            ON tb.training_hierarchy_id = thl.training_hierarchy_id

        LEFT JOIN "{schema}".master_area ma
            ON thl.area_id = ma.area_id

        LEFT JOIN "{schema}".master_subarea msa
            ON thl.sub_area_id = msa.sub_area_id

        LEFT JOIN "{schema}".master_module mm
            ON thl.module_id = mm.module_id

        LEFT JOIN LATERAL (
            SELECT comment_text
            FROM "{schema}".comment c
            WHERE c.employee_training_id = et.employee_training_id
              AND c.comment_type = 'Employee'
            ORDER BY c.commented_at DESC
            LIMIT 1
        ) employee_comment_data ON TRUE

        LEFT JOIN LATERAL (
            SELECT comment_text
            FROM "{schema}".comment c
            WHERE c.employee_training_id = et.employee_training_id
              AND c.comment_type = 'Manager'
            ORDER BY c.commented_at DESC
            LIMIT 1
        ) manager_comment_data ON TRUE

        LEFT JOIN LATERAL (
            SELECT comment_text
            FROM "{schema}".comment c
            WHERE c.employee_training_id = et.employee_training_id
              AND c.comment_type = 'Department'
            ORDER BY c.commented_at DESC
            LIMIT 1
        ) department_comment_data ON TRUE

        WHERE et.employee_id = :emp_id

        ORDER BY et.start_date DESC NULLS LAST
    """)
    
    result = connection.execute(training_query, {"emp_id": emp_id}).mappings().fetchall()
    
    training_records = []
    for row in result:
        training_records.append({
            "trainingId": row["employee_training_id"],
            "employeeId": row["employee_id"],
            "batch": row["batch_num"],
            "competency": row["competency"],
            "module": row["module_name"],
            "area": row["area_name"],
            "subArea": row["sub_area_name"],
            "courseLevel": row["course_level"],
            "status": row["training_status"],
            "type": row["employee_type"],
            "nominatedBy": row["nominated_by"],
            "startDate": row["start_date"].isoformat() if row["start_date"] else None,
            "endDate": row["end_date"].isoformat() if row["end_date"] else None,
            "employeeComment": row["employee_comment"],
            "departmentComment": row["department_comment"],
            "managerComment": row["manager_comment"],
        })
    
    logger.info(f"Found {len(training_records)} training records for employee {emp_id}")
    return training_records


def fetch_batch_comments(batch_id, connection, schema):
    """
    Fetch all comments for a training batch (comment.batch_id), joined with
    the employee table on commented_by_id to include who left each comment.

    Returns every comment, latest first.
    """

    batch_query = text(f'''
        SELECT id, batch_num
        FROM "{schema}".training_batches
        WHERE id = :batch_id
    ''')
    batch_result = connection.execute(batch_query, {"batch_id": batch_id}).mappings().fetchone()

    if not batch_result:
        logger.warning(f"Batch not found: {batch_id}")
        raise ValueError(f"Batch with id {batch_id} not found")

    comment_query = text(f'''
        SELECT
            c.comment_id, c.comment_type, c.comment_text, c.commented_by_id, c.commented_at,
            e.emp_id AS commenter_emp_id,
            e.name AS commenter_name,
            e.email AS commenter_email,
            e.department AS commenter_department,
            e.role::text AS commenter_role
        FROM "{schema}".comment c
        LEFT JOIN "{schema}".employee e ON e.id = c.commented_by_id
        WHERE c.batch_id = :batch_id
        ORDER BY c.commented_at DESC
    ''')
    comment_rows = connection.execute(comment_query, {"batch_id": batch_id}).mappings().fetchall()

    logger.info(f"Found {len(comment_rows)} comment(s) for batch {batch_id}")
    return [{
        "batchId": batch_result["id"],
        "batch": batch_result["batch_num"],
        "commentId": row["comment_id"],
        "commentType": row["comment_type"],
        "commentText": row["comment_text"],
        "commentedById": row["commented_by_id"],
        "commentedByEmpId": row["commenter_emp_id"],
        "commentedByName": row["commenter_name"],
        "commentedByEmail": row["commenter_email"],
        "commentedByDepartment": row["commenter_department"],
        "commentedByRole": row["commenter_role"],
        "commentedAt": row["commented_at"].isoformat() if row["commented_at"] else None,
    } for row in comment_rows]


def save_comment(employee_id, comment_by, entity_id, entity_type, comment_text, connection, schema):
    """
    Insert a new comment into the comment table with role-based authorization.
    Supports training, skill, certificate, and batch comments.

    Args:
        employee_id: ID of the employee who owns the record. Not applicable (and not
            required) for entity_type "batch", since a training batch isn't owned by
            a single employee.
        comment_by: ID of the person adding the comment
        entity_id: ID of the training/skill/certificate/batch
        entity_type: Type of entity - "training", "skill", "certificate", or "batch"
        comment_text: The comment text
        connection: Database connection
        schema: Database schema name
    
    Authorization:
        comment_type is determined solely by the commenter's role column:
        - role in ['employee', 'emp'] → comment_type = 'Employee'
        - role in ['manager', 'mgr'] → comment_type = 'Manager'
        - role in ['dept', 'department', 'admin', 'hr'] → comment_type = 'Department'
    
    Returns:
        Dictionary with comment details
    """
    
    # Validate entity_type
    entity_type_lower = entity_type.lower()
    if entity_type_lower not in ['training', 'skill', 'certificate', 'batch']:
        raise ValueError(f"Invalid entityType: {entity_type}. Must be 'training', 'skill', 'certificate', or 'batch'")

    emp_id = None
    if entity_type_lower != 'batch':
        # Fetch employee details including reports_to (manager) — batches aren't
        # owned by an employee, so this lookup/ownership check doesn't apply to them.
        emp_query = text(f'SELECT id, email, name, reports_to FROM "{schema}".employee WHERE id = :employee_id')
        emp_result = connection.execute(emp_query, {"employee_id": employee_id}).mappings().fetchone()

        if not emp_result:
            logger.warning(f"Employee not found: {employee_id}")
            raise ValueError(f"Employee with ID {employee_id} not found")

        emp_id = emp_result['id']
        emp_email = emp_result['email']
        emp_name = emp_result['name']
        manager_id = emp_result['reports_to']

        logger.info(f"Employee: {emp_id} ({emp_name}), Email: {emp_email}, Manager ID: {manager_id}, Comment by: {comment_by}, Entity: {entity_type}")
    else:
        logger.info(f"Comment by: {comment_by}, Entity: batch {entity_id}")
    
    # Determine comment_type based ONLY on the commenter's role column
    logger.info(f"Fetching commenter's role from employee table...")
    
    commenter_query = text(f'SELECT id, role FROM "{schema}".employee WHERE id = :comment_by')
    commenter_result = connection.execute(commenter_query, {"comment_by": comment_by}).mappings().fetchone()
    
    if not commenter_result:
        logger.warning(f"Commenter not found: {comment_by}")
        raise ValueError(f"Commenter with ID {comment_by} not found")
    
    commenter_role = commenter_result['role']
    logger.info(f"Commenter ID {comment_by}: role='{commenter_role}'")
    
    # Map role to comment_type based ONLY on role column value
    if not commenter_role:
        logger.warning(f"Commenter {comment_by} has no role assigned")
        raise ValueError(f"User {comment_by} has no role assigned and cannot comment")
    
    role_lower = commenter_role.lower()
    
    # Determine comment_type from role
    if role_lower in ['employee', 'emp','user']:
        comment_type = "Employee"
        logger.info(f"Comment type 'Employee' assigned based on role: '{commenter_role}'")
    elif role_lower in ['manager', 'mgr']:
        comment_type = "Manager"
        logger.info(f"Comment type 'Manager' assigned based on role: '{commenter_role}'")
    elif role_lower in ['dept', 'department', 'admin', 'hr']:
        comment_type = "Department"
        logger.info(f"Comment type 'Department' assigned based on role: '{commenter_role}'")
    else:
        logger.warning(f"Invalid role for commenting: {comment_by} (role: {commenter_role})")
        raise ValueError(
            f"User {comment_by} has invalid role '{commenter_role}' for commenting. "
            f"Valid roles: employee/emp, manager/mgr, dept/department/admin/hr"
        )
    
    logger.info(f"Comment type determined: {comment_type}")
    
    # Verify entity record exists (and, for employee-owned entities, belongs to this employee)
    # Define table and column names based on entity type
    if entity_type_lower == 'training':
        table_name = "employee_trainings"
        pk_column = "employee_training_id"
        fk_column = "employee_training_id"
    elif entity_type_lower == 'skill':
        table_name = "employee_skills"
        pk_column = "id"
        fk_column = "employee_skill_id"
    elif entity_type_lower == 'certificate':
        table_name = "employee_certificates"
        pk_column = "id"
        fk_column = "employee_certificate_id"
    else:  # batch — training_batches has no employee_id column, it isn't owned by one employee
        table_name = "training_batches"
        pk_column = "id"
        fk_column = "batch_id"

    if entity_type_lower == 'batch':
        check_query = text(f'''
            SELECT {pk_column}
            FROM "{schema}".{table_name}
            WHERE {pk_column} = :entity_id
        ''')
        check_result = connection.execute(check_query, {"entity_id": entity_id}).mappings().fetchone()
    else:
        check_query = text(f'''
            SELECT {pk_column}
            FROM "{schema}".{table_name}
            WHERE {pk_column} = :entity_id AND employee_id = :employee_id
        ''')
        check_result = connection.execute(check_query, {
            "entity_id": entity_id,
            "employee_id": emp_id
        }).mappings().fetchone()

    if not check_result:
        if entity_type_lower == 'batch':
            logger.warning(f"Batch record {entity_id} not found")
            raise ValueError(f"Batch record {entity_id} not found")
        logger.warning(f"{entity_type.capitalize()} record {entity_id} not found for employee {emp_id}")
        raise ValueError(f"{entity_type.capitalize()} record {entity_id} not found for employee {emp_id}")

    # Build INSERT query with appropriate FK column
    # Only set the FK column for the entity type, others remain NULL
    insert_columns = [fk_column, "comment_type", "comment_text", "commented_by_id", "commented_at"]
    insert_values = [":entity_id", ":comment_type", ":comment_text", ":commented_by", "CURRENT_TIMESTAMP"]
    
    insert_query = text(f'''
        INSERT INTO "{schema}"."comment" 
        ({", ".join(insert_columns)})
        VALUES 
        ({", ".join(insert_values)})
        RETURNING comment_id, commented_at
    ''')
    
    result = connection.execute(insert_query, {
        "entity_id": entity_id,
        "comment_type": comment_type,
        "comment_text": comment_text,
        "commented_by": comment_by
    }).mappings().fetchone()
    
    if not result:
        logger.error(f"Failed to insert comment for {entity_type} {entity_id}")
        raise ValueError(f"Failed to insert {entity_type} comment")
    
    comment_id = result['comment_id']
    commented_at = result['commented_at']
    
    logger.info(f"Successfully inserted comment {comment_id} for {entity_type} {entity_id} by user {comment_by}")
    
    return {
        "message": f"{entity_type.capitalize()} comment added successfully",
        "commentId": comment_id,
        "employeeId": emp_id,
        "entityId": entity_id,
        "entityType": entity_type,
        "commentBy": comment_by,
        "commentType": comment_type,
        "commentedAt": commented_at.isoformat() if hasattr(commented_at, "isoformat") else str(commented_at)
    }



def manage_comments_v2(request):
    """
    Main function to manage employee comments (V2 Schema) for trainings, skills, and certificates.
    
    GET /comments?email=<email>
        Returns all training records with latest comments for an employee

    GET /comments?batch_id=<int>
        Returns the latest Employee/Manager/Department comments for that training
        batch directly (comment.batch_id), independent of any employee. Takes
        precedence over `email` if both are supplied.

    POST /comments
        Adds a new comment to a training/skill/certificate/batch record
        Body: {
            "employeeId": <int>,          # Employee who owns the record. Omit for entityType "batch"
                                           # (a training batch isn't owned by one employee)
            "commentBy": <int>,            # Person adding comment
            "entityId": <int>,             # ID of training/skill/certificate/batch
            "entityType": <string>,        # "training", "skill", "certificate", or "batch"
            "comment": <string>            # Comment text
        }
        
    Comment authorization (comment_type determined by commenter's role):
    - If commenter role in ['employee', 'emp']: comment_type = "Employee"
    - If commenter role in ['manager', 'mgr']: comment_type = "Manager"
    - If commenter role in ['dept', 'department', 'admin', 'hr']: comment_type = "Department"
    - Otherwise: Invalid role error (400)
    """
    logger.info(f"========== NEW REQUEST ==========")
    logger.info(f"Received {request.method} request")
    logger.info(f"Request path: {request.path}")
    logger.info(f"Request args: {request.args}")
    logger.info(f"Content-Type: {request.headers.get('Content-Type', 'Not set')}")
    
    if request.method == "OPTIONS":
        response = make_response("", 204)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        return response
    
    if request.method not in ["GET", "POST"]:
        logger.warning(f"Unsupported HTTP method: {request.method}")
        return _cors_response({"error": f"Method {request.method} not allowed"}, 405)
    
    try:
        logger.info("Creating database engine...")
        engine = get_db_engine()
        schema = os.getenv("DB_SCHEMA")
        logger.info(f"Using schema: {schema}")
        
        if request.method == "GET":
            email = request.args.get("email")
            batch_id_param = request.args.get("batch_id")

            batch_id = None
            if batch_id_param:
                try:
                    batch_id = int(batch_id_param)
                except (ValueError, TypeError):
                    return _cors_response({"error": "Invalid batch_id"}, 400)
            elif not email:
                logger.warning("Missing required parameter: email or batch_id")
                return _cors_response({"error": "Missing required parameter: email or batch_id"}, 400)

            if email:
                email = str(email).strip().lower()

            if batch_id is not None:
                logger.info(f"Fetching comments for batch_id: {batch_id}")
            else:
                logger.info(f"Fetching training records for email: {email}")

            
            if batch_id is not None:
                with engine.connect() as connection:
                    training_records = fetch_batch_comments(batch_id, connection, schema)

                response_data = {
                    "batchId": batch_id,
                    "count": len(training_records),
                    "results": training_records
                }
            else:
                with engine.connect() as connection:
                    training_records = fetch_training_comments(email, connection, schema)

                response_data = {
                    "email": email,
                    "count": len(training_records),
                    "results": training_records
                }

            logger.info(f"Successfully fetched {len(training_records)} record(s)")
            return _cors_response(response_data, 200)
        
        elif request.method == "POST":
            if not request.is_json:
                logger.warning("Request must be JSON")
                return _cors_response({"error": "Request must be JSON"}, 400)
            
            data = request.get_json(silent=True)
            
            if not data:
                logger.warning("Invalid JSON data")
                return _cors_response({"error": "Invalid JSON data"}, 400)
            
            # Extract required fields
            employee_id = data.get("employeeId")
            comment_by = data.get("commentBy")
            entity_id = data.get("entityId")
            entity_type = data.get("entityType")  # "training", "skill", "certificate", or "batch"
            comment_text = data.get("comment")

            # Validation
            # employeeId not applicable when commenting on a training batch.
            if entity_type != "batch" and not employee_id:
                return _cors_response({"error": "Missing required field: employeeId"}, 400)

            if not comment_by:
                return _cors_response({"error": "Missing required field: commentBy"}, 400)

            if not entity_id:
                return _cors_response({"error": "Missing required field: entityId"}, 400)

            if not entity_type:
                return _cors_response({"error": "Missing required field: entityType"}, 400)

            if not comment_text:
                return _cors_response({"error": "Missing required field: comment"}, 400)

            # Convert to integers
            try:
                employee_id = int(employee_id) if employee_id else None
                comment_by = int(comment_by)
                entity_id = int(entity_id)
            except (ValueError, TypeError) as e:
                return _cors_response({"error": f"Invalid field type: {str(e)}"}, 400)
            
            logger.info(f"Adding comment: employee={employee_id}, by={comment_by}, entity={entity_type}:{entity_id}")
            
            with engine.begin() as connection:
                result = save_comment(
                    employee_id=employee_id,
                    comment_by=comment_by,
                    entity_id=entity_id,
                    entity_type=entity_type,
                    comment_text=comment_text,
                    connection=connection,
                    schema=schema
                )
            
            logger.info(f"Successfully added {entity_type} comment")
            return _cors_response(result, 201)
    
    except ValueError as e:
        logger.error(f"Validation error: {str(e)}")
        return _cors_response({"error": str(e)}, 400)
    
    except SQLAlchemyError as db_err:
        logger.exception("Database error in manage_employee_comments_v2")
        return _cors_response({"error": "Database error", "details": str(db_err)}, 500)
    
    except Exception as e:
        logger.exception("Unexpected error in manage_employee_comments_v2")
        return _cors_response({"error": str(e)}, 500)



"""
===========================================
LOCAL TESTING
===========================================

functions-framework --target=manage_comments_v2 --debug


===========================================
DEPLOYMENT COMMANDS
===========================================

Development Deployment:
-----------------------
gcloud functions deploy dev_manageEmployeeComments_v2 \
  --runtime python311 \
  --trigger-http \
  --entry-point manage_comments_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --allow-unauthenticated \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=development


Production Deployment:
----------------------
gcloud functions deploy manageEmployeeComments_v2 \
  --runtime python311 \
  --trigger-http \
  --entry-point manage_comments_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --allow-unauthenticated \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=production

"""

