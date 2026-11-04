"""
Google Cloud Function to manage employee training records (V2 Schema).
Handles CRUD operations on the employee_trainings table with suggestion
endpoints for frontend autocomplete/dropdown population.

Suggestion endpoints (GET /?suggest=<type>):
  - employees     : Search by emp_id, name, or email (requires &q=<search>)
  - competency    : Distinct existing competency values
  - training_hierarchy : All training hierarchies with area/subarea/module names
  - employee_type : Enum values
  - training_status : Enum values

CRUD endpoints:
  GET    /?id=<int>              → Single training record
  GET    /?employee_id=<int>     → All trainings for an employee
  GET    /                       → All training records
  POST   /  {body}               → Create new training record (single or batch via trainings:[])
  POST   /bulk-upload            → Bulk import training hierarchies from CSV/Excel
  PUT    /  {body}               → Update existing training record
  DELETE /?id=<int>&admin_id=    → Delete a training record
"""
import logging
import os
from urllib.parse import quote_plus
from pathlib import Path
from datetime import date, datetime, timedelta

from flask import jsonify, make_response, send_file
import io
import pandas as pd
from google.cloud import storage
from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool
from sqlalchemy.exc import SQLAlchemyError
from dotenv import load_dotenv
from service import (
    ConflictError,
    _safe_value,
    check_role_authorization,
    get_enum,
    normalize_date,
    normalize_training_mode,
    normalize_training_status,
    normalize_training_Batch_status,
    normalize_employee_type,
    validate_decision_reason,
    resolve_training_hierarchy,
    determine_batch_status,
    resolve_training_batch,
    get_training_batch,
    add_training_batch,
    update_training_batch,
    delete_training_batch,
    get_manager_info
)
from notifications import (
    send_training_email,
    build_nomination_submitted_email,
    build_training_approved_email,
    build_training_rejected_email,
    resolve_app_url,
)

from constants import (
    header_map,
    _CSV_COLUMNS,
    _CSV_BLOB_PATH,
    _BACKUP_PREFIX
)


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

import sys
# Add backend directory to path to import utils
sys.path.append(str(Path(__file__).parent.parent.parent))
try:
    from utils.event_publisher import publish_event
    from utils.event_types import SystemEventType
except ImportError:
    publish_event = None
    SystemEventType = None



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
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return response


def _training_name(area, sub_area, module):
    """"Area / Sub-area / Module" for email subjects/bodies, skipping any missing part."""
    return " / ".join(filter(None, [area, sub_area, module]))




# ============================================================================
# SUGGESTION ENDPOINTS
# ============================================================================

def suggest_employees(q, connection, schema):
    """
    Search employees by emp_id, name, or email (case-insensitive ILIKE).
    Returns matching employees with id, emp_id, name, email, department,
    manager_email.
    """
    if not q or len(q.strip()) < 1:
        return []

    search_term = f"%{q.strip()}%"
    # Join the manager here too, so a newly added enrollment shows the
    # manager's email at once, without a refetch.
    query = text(f'''
        SELECT e.id, e.emp_id, e.name, e.email, e.department, mgr.email AS manager_email
        FROM "{schema}".employee e
        LEFT JOIN "{schema}".employee mgr ON mgr.id = e.reports_to
        WHERE LOWER(e.emp_id) LIKE LOWER(:q)
           OR LOWER(e.name) LIKE LOWER(:q)
           OR LOWER(e.email) LIKE LOWER(:q)
        ORDER BY e.name
        LIMIT 20
    ''')
    rows = connection.execute(query, {"q": search_term}).fetchall()

    results = []
    for row in rows:
        results.append({
            "id": row[0],
            "emp_id": row[1],
            "name": row[2],
            "email": row[3],
            "department": row[4],
            "manager_email": row[5],
        })
    return results


def suggest_competencies(connection, schema):
    """Return distinct existing competency values from employee_trainings."""
    query = text(f'''
        SELECT DISTINCT competency
        FROM "{schema}".employee_trainings
        WHERE competency IS NOT NULL AND competency != ''
        ORDER BY competency
    ''')
    rows = connection.execute(query).fetchall()
    return [row[0] for row in rows]


def suggest_training_hierarchies(connection, schema):
    """Return all training hierarchies with joined area/subarea/module names."""
    query = text(f'''
        SELECT
            thl.training_hierarchy_id,
            thl.area_id,
            ma.area_name,
            ma.description AS area_description,
            thl.sub_area_id,
            ms.sub_area_name,
            ms.description AS sub_area_description,
            thl.module_id,
            mm.module_name,
            mm.course_level,
            mm.description AS module_description
        FROM "{schema}".training_hierarchy_links thl
        LEFT JOIN "{schema}".master_area ma ON ma.area_id = thl.area_id
        LEFT JOIN "{schema}".master_subarea ms ON ms.sub_area_id = thl.sub_area_id
        LEFT JOIN "{schema}".master_module mm ON mm.module_id = thl.module_id
        ORDER BY ma.area_name, ms.sub_area_name, mm.module_name
    ''')
    rows = connection.execute(query).fetchall()

    results = []
    for row in rows:
        results.append(dict(row._mapping))
    return results


def handle_suggestions(request):
    """
    Route suggestion requests based on the 'suggest' query parameter.

    GET /?suggest=employees&q=<search>  → Search employees by emp_id, name, or email
    GET /?suggest=competency            → Distinct competency values
    GET /?suggest=training_hierarchy    → All training hierarchies with names
    GET /?suggest=employee_type         → Enum values
    GET /?suggest=training_status       → Enum values
    GET /?suggest=batch_status          → Enum values
    GET /?suggest=training_mode         → Enum values
    """
    suggest_type = request.args.get("suggest", "").strip().lower()

    if not suggest_type:
        return None  # Not a suggestion request

    # Static enum suggestions (no DB needed)
    if suggest_type == "employee_type":
        return _cors_response({"results": list(get_enum("employee_type"))}, 200)

    if suggest_type == "training_status":
        return _cors_response({"results": list(get_enum("training_status"))}, 200)

    if suggest_type == "batch_status":
        return _cors_response({"results": list(get_enum("batch_status"))}, 200)

    if suggest_type == "training_mode":
        return _cors_response({"results": list(get_enum("training_mode"))}, 200)

    # DB-based suggestions
    engine = get_db_engine()
    schema = os.getenv("DB_SCHEMA")

    with engine.connect() as connection:
        if suggest_type == "employees":
            q = request.args.get("q", "")
            results = suggest_employees(q, connection, schema)
            return _cors_response({"results": results}, 200)

        elif suggest_type == "competency":
            results = suggest_competencies(connection, schema)
            return _cors_response({"results": results}, 200)

        elif suggest_type == "training_hierarchy":
            results = suggest_training_hierarchies(connection, schema)
            return _cors_response({"results": results}, 200)

        else:
            return _cors_response(
                {"error": f"Unknown suggestion type: '{suggest_type}'. "
                          f"Valid types: employees, competency, training_hierarchy, employee_type, training_status, batch_status, training_mode"},
                400
            )


def handle_report_download(request):
    """
    Proxy download for the bulk upload report.
    Fetches the file from GCS and streams it to the user's browser.
    Ensures the user has proper authorization before serving.
    """
    admin_id = request.args.get("admin_id")
    if not admin_id:
        return _cors_response({"error": "admin_id is required for report download"}, 401)

    try:
        engine = get_db_engine()
        schema = os.getenv("DB_SCHEMA")
        with engine.connect() as connection:
            check_role_authorization(int(admin_id), connection, schema)
    except Exception as e:
        logger.error(f"Authorization failed for report download: {e}")
        return _cors_response({"error": "Unauthorized to download report"}, 403)

    try:
        _, bucket = _get_gcs_bucket()
        blob = bucket.blob("bulk-upload-reports/bulk_upload_report_latest.xlsx")
        
        if not blob.exists():
            return _cors_response({"error": "Report not found or has not been generated yet"}, 404)

        # Download blob content as bytes
        file_bytes = blob.download_as_bytes()
        
        # Create the file response with a timestamped filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        download_name = f"training_bulk_upload_report_{timestamp}.xlsx"
        
        response = send_file(
            io.BytesIO(file_bytes),
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            as_attachment=True,
            download_name=download_name
        )
        # Add CORS headers
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response.headers["Access-Control-Expose-Headers"] = "Content-Disposition"
        return response
    except Exception as e:
        logger.error(f"Failed to fetch report from GCS: {e}")
        return _cors_response({"error": "Failed to retrieve report from storage"}, 500)

# ============================================================================
# CSV SYNC HELPERS (GCS Bucket)
# ============================================================================

def _get_gcs_bucket():
    """Return (client, bucket) or raise if BUCKET_NAME is not set."""
    bucket_name = os.getenv("BUCKET_NAME")
    if not bucket_name:
        raise EnvironmentError("BUCKET_NAME env var is not set — CSV sync skipped")
    project = os.getenv("GCP_PROJECT") or os.getenv("GOOGLE_CLOUD_PROJECT")
    client = storage.Client(project=project)
    return client, client.bucket(bucket_name)


def _write_csv_to_gcs(bucket, df):
    """Upload the DataFrame as CSV to GCS with a rolling backup."""
    existing_blob = bucket.blob(_CSV_BLOB_PATH)
    if existing_blob.exists():
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_name = f"{_BACKUP_PREFIX}{ts}_backup.csv"
        # Remove all old backups to keep only the latest one
        for old in bucket.list_blobs(prefix=_BACKUP_PREFIX):
            old.delete()
        bucket.copy_blob(existing_blob, bucket, backup_name)
        logger.info(f"Backed up existing CSV to {backup_name}")

    # Reorder / ensure correct columns
    for col in _CSV_COLUMNS:
        if col not in df.columns:
            df[col] = None
    df = df[_CSV_COLUMNS]

    csv_buffer = io.StringIO()
    df.to_csv(csv_buffer, index=False)
    bucket.blob(_CSV_BLOB_PATH).upload_from_string(csv_buffer.getvalue(), content_type="text/csv")
    logger.info(f"Uploaded {_CSV_BLOB_PATH} to GCS ({len(df)} rows)")


def export_trainings_csv_to_gcs(engine, schema):
    """Full re-export of ALL employee training records (with employee + hierarchy data) to GCS CSV."""
    bucket_name = os.getenv("BUCKET_NAME")
    if not bucket_name:
        logger.warning("BUCKET_NAME not set, skipping CSV sync")
        return False

    export_query = text(f'''
        SELECT
            e.emp_id           AS "emp_id",
            e.name             AS "employee_name",
            e.email            AS "email",
            e.department       AS "department",
            ma.area_name       AS "Area",
            ma.description     AS "Area Description",
            ms.sub_area_name   AS "Sub Area",
            ms.description     AS "Sub Area Description",
            mm.module_name     AS "Module",
            mm.course_level    AS "Module Course Level",
            mm.description     AS "Module Description",
            
            tb.batch_num          AS "Batch_num",
            tb.batch_desc         AS "Batch Description",
            tb.training_quarter   AS "Training Quarter",
            tb.batch_status       AS "Batch Status",
            tb.batch_status_remarks AS "Batch Status Remarks",
            tb.training_mode     AS "Training Mode",
            tb.trainer           AS "Trainer",
            tb.duration          AS "Duration",
            tb.batch_size        AS "Batch Size",
            tb.prerequisite      AS "Prerequisite",
            tb.training_content  AS "Training Content",
            tb.resources         AS "Resources",

            et.training_status AS "training_status",
            et.status_remarks  AS "Status Remarks",
            et.employee_type   AS "employee_type",
            et.nominated_by      AS "nominated_by",
            et.start_date      AS "start_date",
            et.end_date        AS "end_date",
            et.created_at      AS "created_at",
            et.updated_at      AS "updated_at"
        FROM "{schema}".employee_trainings et
        LEFT JOIN "{schema}".employee e ON e.id = et.employee_id
        LEFT JOIN "{schema}".training_batches tb ON tb.id = et.batch_id
        LEFT JOIN "{schema}".training_hierarchy_links thl ON thl.training_hierarchy_id = tb.training_hierarchy_id
        LEFT JOIN "{schema}".master_area ma ON ma.area_id = thl.area_id
        LEFT JOIN "{schema}".master_subarea ms ON ms.sub_area_id = thl.sub_area_id
        LEFT JOIN "{schema}".master_module mm ON mm.module_id = thl.module_id
        ORDER BY e.emp_id, ma.area_name, ms.sub_area_name, mm.module_name
    ''')

    with engine.connect() as connection:
        result = connection.execute(export_query)
        rows = result.fetchall()
        columns = list(result.keys())

    df = pd.DataFrame(rows, columns=columns)
    # Convert enum/datetime values to strings for CSV compatibility
    for col in df.columns:
        df[col] = df[col].apply(lambda v: v.isoformat() if hasattr(v, 'isoformat') else (str(v) if v is not None and not isinstance(v, (str, int, float, type(None))) else v))
    project = os.getenv("GCP_PROJECT") or os.getenv("GOOGLE_CLOUD_PROJECT")
    client = storage.Client(project=project)
    bucket = client.bucket(bucket_name)
    _write_csv_to_gcs(bucket, df)
    logger.info(f"Full re-export: {len(df)} employee training rows written to gs://{bucket_name}/{_CSV_BLOB_PATH}")
    return True


def sync_csv_full_reexport(engine, schema):
    try:
        return export_trainings_csv_to_gcs(engine, schema)
    except Exception as e:
        logger.warning(f"CSV full re-export failed (non-critical): {e}")
        return False


def sync_csv_after_write(engine, schema):
    """
    Sync the GCS CSV after any write operation (POST, PUT, DELETE).
    Since the CSV now contains full employee training details (employee info +
    hierarchy + training metadata), a full re-export is the safest approach to
    keep the CSV perfectly in sync with the DB.
    """
    return sync_csv_full_reexport(engine, schema)


def fetch_employee_trainings(connection, schema, training_id=None, employee_id=None, batch_id=None):
    """
    Fetch employee training records with joined hierarchy + master table data.
    Can filter by specific training_id, employee_id, or batch_id.
    """
    base_query = f'''
        SELECT
            et.employee_training_id,
            et.employee_id,
            e.emp_id,
            e.name AS employee_name,
            e.email,
            e.department,
            mgr.email AS manager_email,
            tb.id AS batch_id,
            tb.batch_num,
            et.competency,
            tb.training_hierarchy_id,
            thl.area_id,
            ma.area_name,
            ma.description AS area_description,
            thl.sub_area_id,
            ms.sub_area_name,
            ms.description AS sub_area_description,
            thl.module_id,
            mm.module_name,
            mm.course_level,
            mm.description AS module_description,
            et.training_status,
            et.status_remarks,
            et.employee_type,
            et.nominated_by,
            et.start_date,
            et.end_date,
            et.created_at,
            et.updated_at
        FROM "{schema}".employee_trainings et
        LEFT JOIN "{schema}".employee e ON e.id = et.employee_id
        LEFT JOIN "{schema}".employee mgr ON mgr.id = e.reports_to
        INNER JOIN "{schema}".training_batches tb ON tb.id = et.batch_id
        LEFT JOIN "{schema}".training_hierarchy_links thl ON thl.training_hierarchy_id = tb.training_hierarchy_id
        LEFT JOIN "{schema}".master_area ma ON ma.area_id = thl.area_id
        LEFT JOIN "{schema}".master_subarea ms ON ms.sub_area_id = thl.sub_area_id
        LEFT JOIN "{schema}".master_module mm ON mm.module_id = thl.module_id
    '''

    if training_id is not None:
        query = text(base_query + ' WHERE et.employee_training_id = :id')
        rows = connection.execute(query, {"id": training_id}).fetchall()
    elif employee_id is not None:
        query = text(base_query + ' WHERE et.employee_id = :employee_id ORDER BY et.created_at DESC')
        rows = connection.execute(query, {"employee_id": employee_id}).fetchall()
    elif batch_id is not None:
        query = text(base_query + ' WHERE et.batch_id = :batch_id ORDER BY et.created_at DESC')
        rows = connection.execute(query, {"batch_id": batch_id}).fetchall()
    else:
        query = text(base_query + ' ORDER BY et.created_at DESC')
        rows = connection.execute(query).fetchall()

    results = []
    for row in rows:
        entry = dict(row._mapping)
        # Convert datetime/date objects to ISO strings
        for key, value in entry.items():
            if hasattr(value, 'isoformat'):
                entry[key] = value.isoformat()
        # Convert enum values to strings
        if entry.get('training_status'):
            entry['training_status'] = str(entry['training_status'])
        if entry.get('employee_type'):
            entry['employee_type'] = str(entry['employee_type'])
        results.append(entry)

    return results


def determine_training_status(data):
    """
    Determine training_status for a new record:
    - If a valid 'training_status' is explicitly provided, use it as-is
      (validated against VALID_TRAINING_STATUSES; raises ValueError if not
      a recognized enum value).
    - Otherwise auto-derive from start_date:
      - start_date <= today → "In Progress"
      - start_date > today, or absent → "Not Started"
    """
    raw_status = data.get("training_status")
    if raw_status:
        status, msg = normalize_training_status(raw_status)
        if status is None:
            raise ValueError(msg)
        return status

    start_date_str = data.get("start_date")
    if start_date_str:
        try:
            start_dt = datetime.strptime(start_date_str, "%Y-%m-%d").date()
        except ValueError:
            raise ValueError(
                f"Invalid start_date format: '{start_date_str}'. Expected YYYY-MM-DD."
            )
        today = date.today()
        if start_dt <= today:
            logger.info(f"Auto-status: start_date ({start_dt}) <= today ({today}) → In Progress")
            return "In Progress"
        else:
            logger.info(f"Auto-status: start_date ({start_dt}) > today ({today}) → Not Started")
            return "Not Started"

    return "Not Started"


def handle_get(request):
    """
    Handle GET requests to fetch employee training records.

    GET /?id=<int>           → Returns a single training record
    GET /?employee_id=<int>  → Returns all trainings for an employee
    GET /?batch_id=<int>     → Returns all trainings enrolled in a batch
    GET /                    → Returns all training records

    Response includes joined data from employee, training_hierarchy_links, and all master tables.
    """
    engine = get_db_engine()
    schema = os.getenv("DB_SCHEMA")
    logger.info(f"Using schema: {schema}")

    training_id = request.args.get("id")
    employee_id = request.args.get("employee_id")
    batch_id = request.args.get("batch_id")

    if training_id is not None:
        try:
            training_id = int(training_id)
        except (ValueError, TypeError):
            return _cors_response({"error": "Invalid id parameter, must be an integer"}, 400)

    if employee_id is not None:
        try:
            employee_id = int(employee_id)
        except (ValueError, TypeError):
            return _cors_response({"error": "Invalid employee_id parameter, must be an integer"}, 400)

    if batch_id is not None:
        try:
            batch_id = int(batch_id)
        except (ValueError, TypeError):
            return _cors_response({"error": "Invalid batch_id parameter, must be an integer"}, 400)

    with engine.connect() as connection:
        results = fetch_employee_trainings(connection, schema, training_id, employee_id, batch_id)

    if training_id is not None:
        if not results:
            return _cors_response({"error": f"Employee training with id {training_id} not found"}, 404)
        logger.info(f"Returning single employee training (id={training_id})")
        return _cors_response(results[0], 200)

    logger.info(f"Returning {len(results)} employee training records")
    return _cors_response({"count": len(results), "results": results}, 200)


def _run_post_write_side_effects(engine, schema, new_id, employee_id,
                                  is_self_nomination, area, sub_area, module, batch_num, status_remarks,
                                  app_url):
    """
    Run this training row's side effects: CSV export to GCS,
    and (self-nomination only) the manager notification email.

    Both already fail safely on their own (try/except, logged only). Runs
    synchronously now -- backgrounding this let Cloud Run throttle CPU
    before the email call finished, causing intermittent SSLEOFError
    failures.
    """
    csv_synced = sync_csv_after_write(engine, schema)  # never raises, logs its own failures

    if is_self_nomination:
        try:
            with engine.connect() as conn:
                manager_email, manager_name = get_manager_info(employee_id, conn, schema)
                created = fetch_employee_trainings(conn, schema, training_id=new_id)
            employee_name = created[0]["employee_name"] if created else None
            training_name = _training_name(area, sub_area, module)
            subject, body = build_nomination_submitted_email(
                app_url, employee_name, training_name, batch_num, manager_name, note=status_remarks
            )
            if subject:
                send_training_email(
                    manager_email, subject, body,
                    context=f"event=nomination_submitted employee_training_id={new_id} employee_id={employee_id}",
                )
        except Exception:
            # .exception (not .warning) keeps the full traceback.
            logger.exception(
                f"[training-email] nomination_submitted failed for "
                f"employee_training_id={new_id} employee_id={employee_id}"
            )

    return csv_synced


def handle_post(request):
    """
    Handle POST requests to create a new employee training record.
    Resolves training_hierarchy_id automatically from area + subarea + module names.
    Auto-sets training_status based on start_date.

    admin_id    -> the person making the request (must have dept/admin/hr role) -- NOT stored
    employee_id -> the target employee whose training is being created -- stored in employee_trainings

    nomination_request: true -> self-service nomination (employee submitting for
    themselves). admin_id is not required in this case -- there is no authorizing
    admin yet -- and the record is forced to training_status "Pending Approval"
    (ignoring start_date/training_status) with nominated_by="Self nomination", for
    a manager to review via the existing PUT approve/reject flow.

    Single training:
    Body: {
        "admin_id": <int>,                 # Required unless nomination_request is true
        "nomination_request": <bool>,      # Optional -- self-service nomination path (see above)
        "employee_id": <int>,              # Required -- target employee to assign training to
        "area": <string>,                  # Required -- resolved/created in master_area
        "subarea": <string>,               # Required -- resolved/created in master_subarea
        "module": <string>,                # Required -- resolved/created in master_module
        "area_description": <string>,      # Optional
        "subarea_description": <string>,   # Optional
        "module_course_level": <string>,   # Optional
        "module_description": <string>,    # Optional
        "batch_num": <string>,             # Optional (varchar 255)
        "competency": <string>,            # Optional
        "training_status": <string>,       # Optional (enum) -- overrides the auto-computed default when provided
        "status_remarks": <string>,        # Optional -- free-text note explaining the training_status
        "employee_type": <string>,         # Optional (enum)
        "start_date": <string>,            # Optional (YYYY-MM-DD)
        "end_date": <string>               # Optional (YYYY-MM-DD, must be >= start_date)
    }

    Multiple trainings (batch):
    Body: {
        "admin_id": <int>,                 # Required -- authorizer (dept/admin/hr role)
        "trainings": [                     # Required -- array of training objects
            { "employee_id": ..., "area": ..., "subarea": ..., "module": ..., ... },
            { ... }
        ]
    }
    """
    if not request.is_json:
        logger.warning("Request must be JSON")
        return _cors_response({"error": "Request must be JSON"}, 400)

    data = request.get_json(silent=True)

    if not data:
        logger.warning("Invalid JSON data")
        return _cors_response({"error": "Invalid JSON data"}, 400)

    # ── Batch mode — if "trainings" array is present, process each item ──
    if isinstance(data, dict) and "trainings" in data:
        admin_id_raw = data.get("admin_id")
        if not admin_id_raw:
            return _cors_response({"error": "Missing required field: admin_id"}, 400)
        try:
            admin_id = int(admin_id_raw)
        except (ValueError, TypeError):
            return _cors_response({"error": "admin_id must be an integer"}, 400)

        trainings_list = data.get("trainings", [])
        if not trainings_list:
            return _cors_response({"error": "trainings array is empty"}, 400)

        engine = get_db_engine()
        schema = os.getenv("DB_SCHEMA")
        created_count, skipped_count, error_count = 0, 0, 0
        results = []

        with engine.begin() as connection:
            # Authorize once for the admin making the batch request
            check_role_authorization(admin_id, connection, schema)

            for idx, item in enumerate(trainings_list, start=1):
                employee_id_raw = item.get("employee_id")
                area     = item.get("area", "").strip() if item.get("area") else ""
                sub_area = item.get("subarea", "").strip() if item.get("subarea") else ""
                module   = item.get("module", "").strip() if item.get("module") else ""
                batch_num = item.get("batch_num", "").strip() if item.get("batch_num") else ""

                missing = [f for f, v in [
                    ("employee_id", employee_id_raw), ("area", area),
                    ("subarea", sub_area), ("module", module), ("batch_num", batch_num)
                ] if not v]

                if missing:
                    results.append({"index": idx, "status": "error",
                                    "error": f"Missing: {', '.join(missing)}"})
                    error_count += 1
                    continue

                try:
                    employee_id = int(employee_id_raw)
                except (ValueError, TypeError):
                    results.append({"index": idx, "status": "error",
                                    "error": "employee_id must be an integer"})
                    error_count += 1
                    continue

                # Validate employee_type enum if provided
                raw_employee_type = item.get("employee_type")
                employee_type, type_msg = normalize_employee_type(raw_employee_type)
                if raw_employee_type and employee_type is None:
                    results.append({"index": idx, "status": "error", "error": type_msg})
                    error_count += 1
                    continue

                try:
                    training_status = determine_training_status(item)
                    batch_status = determine_batch_status(training_status)
                    
                except ValueError as e:
                    results.append({"index": idx, "status": "error", "error": str(e)})
                    error_count += 1
                    continue

                try:
                    # Verify target employee exists
                    employee_check = text(f'SELECT id FROM "{schema}".employee WHERE id = :id')
                    if not connection.execute(employee_check, {"id": employee_id}).fetchone():
                        results.append({"index": idx, "status": "error",
                                        "error": f"Target employee with id {employee_id} not found"})
                        error_count += 1
                        continue

                    # Resolve training hierarchy from area/subarea/module names
                    training_hierarchy_id = resolve_training_hierarchy(
                        area, sub_area, module, connection, schema,
                        area_description=item.get("area_description"),
                        sub_area_description=item.get("subarea_description"),
                        module_course_level=item.get("module_course_level"),
                        module_description=item.get("module_description"),
                    )
                    
                    # get the Batch record
                    batch_id = resolve_training_batch(
                                    connection=connection,
                                    schema=schema,
                                    training_hierarchy_id=training_hierarchy_id,
                                    batch_num=batch_num,
                                    batch_description=item.get("Batch Description"),
                                    start_date=item.get("start_date"),
                                    end_date=item.get("end_date"),
                                    batch_status=batch_status,
                                    training_mode=item.get("Training Mode"),
                                    training_quarter=item.get("Training Quarter"),
                                    batch_status_remarks=item.get("Batch Status Remarks"),
                                    duration=item.get("Duration"),
                                    trainer=item.get("Trainer"),
                                    batch_size=item.get("Batch Size"),
                                    prerequisite=item.get("Prerequisite"),
                                    training_content=item.get("Training Content"),
                                    resources=item.get("Resources"),
                                    bulk_insert=False )

                    # Duplicate check — same employee + same batch
                    duplicate_check = text(f'''
                        SELECT employee_training_id
                        FROM "{schema}".employee_trainings
                        WHERE employee_id = :employee_id
                          AND batch_id = :batch_id
                    ''')
                    existing_duplicate = connection.execute(duplicate_check, {
                        "employee_id": employee_id,
                        "batch_id": batch_id
                    }).fetchone()

                    if existing_duplicate:
                        skipped_count += 1
                        results.append({"index": idx, "status": "already_exists",
                                        "employee_id": employee_id,
                                        "batch_id": batch_id,
                                        "existing_employee_training_id": existing_duplicate[0]})
                        continue

                    # Insert training record
                    insert_result = connection.execute(text(f'''
                        INSERT INTO "{schema}".employee_trainings (
                            employee_id, batch_id, competency,
                            training_status, status_remarks, employee_type, nominated_by, start_date, end_date
                        ) VALUES (
                            :employee_id, :batch_id, :competency,
                            :training_status, :status_remarks, :employee_type, :nominated_by, :start_date, :end_date
                        )
                        RETURNING employee_training_id
                    '''), {
                        "employee_id": employee_id,
                        "batch_id": batch_id,
                        "competency": item.get("competency"),
                        "training_status": training_status,
                        "status_remarks": item.get("status_remarks"),
                        "employee_type": employee_type,
                        "nominated_by": item.get("nominated_by"),
                        "start_date": item.get("start_date"),
                        "end_date": item.get("end_date"),
                    }).fetchone()[0]

                    created_count += 1

                    results.append({
                        "index": idx, "status": "created",
                        "employee_training_id": insert_result,
                        "employee_id": employee_id,
                        "batch_id": batch_id,
                        "training_status": training_status,
                    })

                except Exception as e:
                    error_count += 1
                    results.append({"index": idx, "status": "error", "error": str(e)})
                    logger.warning(f"Error processing training index {idx}: {e}")

        # CSV sync after all batch inserts
        csv_synced = sync_csv_after_write(engine, schema) if created_count > 0 else False

        if created_count > 0 and publish_event and SystemEventType:
            try:
                with engine.connect() as conn:
                    publish_event(conn, SystemEventType.EMPLOYEE_TRAINING_UPDATED.value, {
                        "action": "BATCH_CREATE",
                        "data": {"created_count": created_count}
                    })
                    publish_event(conn, SystemEventType.TRAINING_MAPPING_CREATED.value, {
                        "action": "BATCH_CREATE", "data": {"created_count": created_count}
                    })
            except Exception as e:
                logger.error(f"Webhook dispatch failed: {e}")

        status_code = 201 if created_count > 0 else 200
        logger.info(f"Batch result: {created_count} created, {skipped_count} skipped, {error_count} errors")
        return _cors_response({
            "message": "Batch training processing completed",
            "summary": {
                "total": len(trainings_list),
                "created": created_count,
                "already_exists": skipped_count,
                "errors": error_count,
                "csv_synced": csv_synced
            },
            "results": results,
        }, status_code)

    # ── Single mode ──────────────────────────────────────────────────────────
    # Self-nomination: the employee asks for the training themselves.
    # No admin is involved yet, so the role check is skipped.
    is_self_nomination = bool(data.get("nomination_request"))

    admin_id    = data.get("admin_id")
    employee_id = data.get("employee_id")
    area        = data.get("area", "").strip() if data.get("area") else ""
    sub_area    = data.get("subarea", "").strip() if data.get("subarea") else ""
    module      = data.get("module", "").strip() if data.get("module") else ""
    batch_num   = data.get("batch_num", "").strip() if data.get("batch_num") else ""

    missing_fields = []
    if not is_self_nomination and not admin_id:
        missing_fields.append("admin_id")
    if not employee_id:
        missing_fields.append("employee_id")
    if not area:
        missing_fields.append("area")
    if not sub_area:
        missing_fields.append("subarea")
    if not module:
        missing_fields.append("module")
    if not batch_num:
        missing_fields.append("batch_num")

    if missing_fields:
        return _cors_response(
            {"error": f"Missing required fields: {', '.join(missing_fields)}"}, 400
        )

    if admin_id:
        try:
            admin_id = int(admin_id)
        except (ValueError, TypeError):
            return _cors_response({"error": "admin_id must be an integer"}, 400)
    else:
        admin_id = None

    try:
        employee_id = int(employee_id)
    except (ValueError, TypeError):
        return _cors_response({"error": "employee_id must be an integer"}, 400)

    # Validate employee_type enum if provided
    raw_employee_type = data.get("employee_type")
    employee_type, type_msg = normalize_employee_type(raw_employee_type)
    if raw_employee_type and employee_type is None:
        return _cors_response({"error": type_msg}, 400)

    # A self-nomination always starts as "Pending Approval".
    # A manager approves or rejects it later.
    if is_self_nomination:
        training_status = "Pending Approval"
        batch_status = determine_batch_status(training_status)
    else:
        try:
            training_status = determine_training_status(data)
            batch_status = determine_batch_status(training_status)

        except ValueError as e:
            return _cors_response({"error": str(e)}, 400)

    logger.info(
        f"Adding training: admin_id={admin_id} → employee_id={employee_id}, "
        f"area='{area}', subarea='{sub_area}', module='{module}', status={training_status}"
    )

    engine = get_db_engine()
    schema = os.getenv("DB_SCHEMA")
    logger.info(f"Using schema: {schema}")

    with engine.begin() as connection:
        # Step 0: only dept/admin/hr users can add trainings (we check admin_id).
        # This is skipped for self-nominations.
        if not is_self_nomination:
            check_role_authorization(admin_id, connection, schema)

        # Step 1: Verify target employee_id exists
        employee_check = text(f'SELECT id FROM "{schema}".employee WHERE id = :id')
        if not connection.execute(employee_check, {"id": employee_id}).fetchone():
            return _cors_response({
                "error": f"Target employee with id {employee_id} not found"
            }, 404)

        # Step 2: Resolve training_hierarchy_id from area/subarea/module names
        training_hierarchy_id = resolve_training_hierarchy(
            area, sub_area, module, connection, schema,
            area_description=data.get("area_description"),
            sub_area_description=data.get("subarea_description"),
            module_course_level=data.get("module_course_level"),
            module_description=data.get("module_description"),
        )

        # get the Batch record
        batch_id = resolve_training_batch(
                                    connection=connection,
                                    schema=schema,
                                    training_hierarchy_id=training_hierarchy_id,
                                    batch_num=batch_num,
                                    batch_description=data.get("Batch Description"),
                                    start_date=data.get("start_date"),
                                    end_date=data.get("end_date"),
                                    batch_status=batch_status,
                                    training_mode=data.get("Training Mode"),
                                    training_quarter=data.get("Training Quarter"),
                                    batch_status_remarks=data.get("Batch Status Remarks"),
                                    duration=data.get("Duration"),
                                    trainer=data.get("Trainer"),
                                    batch_size=data.get("Batch Size"),
                                    prerequisite=data.get("Prerequisite"),
                                    training_content=data.get("Training Content"),
                                    resources=data.get("Resources"),
                                    bulk_insert=False )

        # Step 3: check for a duplicate. Only one row is allowed per employee and
        # batch, so "Request Again" on a rejected row reopens that row (Step 4a).
        duplicate_check = text(f'''
            SELECT employee_training_id, training_status
            FROM "{schema}".employee_trainings
            WHERE employee_id = :employee_id
              AND batch_id = :batch_id
        ''')
        existing_duplicate = connection.execute(duplicate_check, {
            "employee_id": employee_id,
            "batch_id": batch_id
        }).fetchone()

        # Only a rejected ("Not Completed") row can be reopened. Old rows with no
        # status (NULL) can be reopened too. Any other status is a duplicate.
        if existing_duplicate and existing_duplicate[1] not in ("Not Completed", None):
            return _cors_response({
                "error": "Duplicate record. This employee already has a training entry for the same area/subarea/module.",
                "existing_employee_training_id": existing_duplicate[0]
            }, 409)

        record_values = {
            "employee_id": employee_id,
            "batch_id": batch_id,
            "competency": data.get("competency"),
            "training_status": training_status,
            "status_remarks": data.get("status_remarks"),
            "employee_type": employee_type,
            "nominated_by": "Self nomination" if is_self_nomination else data.get("nominated_by"),
            "start_date": data.get("start_date"),
            "end_date": data.get("end_date"),
        }

        if existing_duplicate:
            # Step 4a: reopen the existing rejected record ("Request Again").
            record_values["employee_training_id"] = existing_duplicate[0]
            update_query = text(f'''
                UPDATE "{schema}".employee_trainings
                SET competency = :competency,
                    training_status = :training_status,
                    status_remarks = :status_remarks,
                    employee_type = :employee_type,
                    nominated_by = :nominated_by,
                    start_date = :start_date,
                    end_date = :end_date
                WHERE employee_training_id = :employee_training_id
            ''')
            connection.execute(update_query, record_values)
            new_id = existing_duplicate[0]
        else:
            # Step 4b: Insert the training record (employee_id stored, admin_id is NOT stored)
            insert_query = text(f'''
                INSERT INTO "{schema}".employee_trainings (
                    employee_id, batch_id, competency,
                    training_status, status_remarks, employee_type, nominated_by, start_date, end_date
                ) VALUES (
                    :employee_id, :batch_id, :competency,
                    :training_status, :status_remarks, :employee_type, :nominated_by, :start_date, :end_date
                )
                RETURNING employee_training_id
            ''')
            result = connection.execute(insert_query, record_values).fetchone()
            new_id = result[0]

    action = "Reopened" if existing_duplicate else "Created"
    logger.info(f"{action} employee training (id={new_id}) by admin_id={admin_id}")

    # Runs synchronously -- see _run_post_write_side_effects docstring for why.
    # app_url must be resolved here (see resolve_app_url).
    app_url = resolve_app_url(request)
    csv_synced = _run_post_write_side_effects(engine, schema, new_id, employee_id,
                                               is_self_nomination, area, sub_area, module, batch_num,
                                               data.get("status_remarks"), app_url)

    return _cors_response({
        "message": "Employee training added successfully",
        "employee_training_id": new_id,
        "employee_id": employee_id,
        "training_hierarchy_id": training_hierarchy_id,
        "training_status": training_status,
        "created_by": admin_id if admin_id else "self",
        "created": True,
        "csv_synced": csv_synced
    }, 201)


def handle_put(request):
    """
    Handle PUT requests to update an existing employee training record.
    Only provided fields are updated. Auto-sets training_status if not explicitly
    provided but start_date is changed.

    admin_id → the person making the request (must have dept/admin/hr role) — NOT stored

    Body: {
        "employee_training_id": <int>,         # Required
        "admin_id": <int>,                     # Required — authorizer (dept/admin/hr role)
        "training_hierarchy_id": <int>,        # Optional
        "batch_num": <string>,                 # Required
        "competency": <string>,                # Optional
        "training_status": <string>,           # Optional (explicit override)
        "status_remarks": <string>,             # Optional -- free-text note explaining the training_status.
                                                 # Required (>=10 chars) when training_status is explicitly
                                                 # set to "Not Completed" (reject) — the decision reason.
        "employee_type": <string>,             # Optional
        "start_date": <string>,                # Optional (YYYY-MM-DD)
        "end_date": <string>                   # Optional (YYYY-MM-DD)
    }

    Mandatory-reason validation (status_remarks required on reject, see
    service.validate_decision_reason) is enforced server-side, mirroring the
    frontend ReasonModal's client-side rule. Every explicit status decision
    (training_status sent in the request body) also writes an audit entry
    to the existing "comment" table (same table/columns manageComments_v2
    writes to) — actor (admin_id), timestamp, and the reason/note text,
    same transaction as the status update. No new columns/tables were
    needed for either of these.

    A dedicated reviewed_by/reviewed_at column pair on employee_trainings
    itself was considered and deliberately not added — no schema change was
    needed once the comment-table audit log above covers the same need,
    and it also preserves full history across re-decisions, which a single
    reviewed_by/reviewed_at pair would not.
    """
    if not request.is_json:
        logger.warning("Request must be JSON")
        return _cors_response({"error": "Request must be JSON"}, 400)

    data = request.get_json(silent=True)

    if not data:
        logger.warning("Invalid JSON data")
        return _cors_response({"error": "Invalid JSON data"}, 400)

    employee_training_id = data.get("employee_training_id")
    admin_id             = data.get("admin_id")

    if not employee_training_id:
        return _cors_response({"error": "Missing required field: employee_training_id"}, 400)
    if not admin_id:
        return _cors_response({"error": "Missing required field: admin_id"}, 400)

    try:
        employee_training_id = int(employee_training_id)
    except (ValueError, TypeError):
        return _cors_response({"error": "employee_training_id must be an integer"}, 400)

    try:
        admin_id = int(admin_id)
    except (ValueError, TypeError):
        return _cors_response({"error": "admin_id must be an integer"}, 400)

    # Validate employee_type enum if provided
    raw_employee_type = data.get("employee_type")
    employee_type, type_msg = normalize_employee_type(raw_employee_type)
    if raw_employee_type and employee_type is None:
        return _cors_response({"error": type_msg}, 400)

    # Validate training_status enum if provided
    raw_training_status = data.get("training_status")
    training_status, status_msg = normalize_training_status(raw_training_status)
    if raw_training_status and training_status is None:
        return _cors_response({"error": status_msg}, 400)

    # If the request sends training_status, it is a reviewer decision.
    # (Without it, the status may still change on its own from start_date.)
    is_explicit_status_change = "training_status" in data

    # Rejecting ("Not Completed") needs a reason of at least 10 characters.
    # This also applies when an admin edits a row in the enrollment table.
    if is_explicit_status_change:
        reason_error = validate_decision_reason(training_status, data.get("status_remarks"))
        if reason_error:
            return _cors_response({"error": reason_error, "field": "status_remarks"}, 400)

    engine = get_db_engine()
    schema = os.getenv("DB_SCHEMA")
    logger.info(f"Using schema: {schema}")

    with engine.begin() as connection:
        # Step 0: Authorize — only dept/admin/hr roles allowed (checks admin_id)
        check_role_authorization(admin_id, connection, schema)

        # Step 1: Fetch the existing training record
        existing_query = text(f'''
            SELECT et.employee_training_id, et.training_status, et.start_date,
                   et.batch_id AS current_batch_id, tb.training_hierarchy_id AS current_hierarchy_id,
                   tb.batch_num AS current_batch
            FROM "{schema}".employee_trainings et
            LEFT JOIN "{schema}".training_batches tb ON tb.id = et.batch_id
            WHERE et.employee_training_id = :id
        ''')
        existing = connection.execute(existing_query, {"id": employee_training_id}).fetchone()
        if not existing:
            return _cors_response(
                {"error": f"Employee training with id {employee_training_id} not found"}, 404
            )
        
        existing_map = existing._mapping
        current_hierarchy_id = existing_map["current_hierarchy_id"]
        current_batch = existing_map["current_batch"]

        # A nomination decision: "Pending Approval" becomes "Not Started" (approved)
        # or "Not Completed" (rejected). Other edits send no email.
        is_nomination_decision = (
            is_explicit_status_change
            and str(existing_map["training_status"]) == "Pending Approval"
            and training_status in ("Not Started", "Not Completed")
        )

        batch_num = data.get("batch_num") if "batch_num" in data else current_batch

        if not batch_num:
            return _cors_response({"error": "Missing required field: batch_num"}, 400)

        # Step 2: If training_hierarchy_id is being changed, verify it exists
        new_hierarchy_id = data.get("training_hierarchy_id")
        if new_hierarchy_id:
            try:
                new_hierarchy_id = int(new_hierarchy_id)
            except (ValueError, TypeError):
                return _cors_response({"error": "training_hierarchy_id must be an integer"}, 400)

            hierarchy_check = text(f'''
                SELECT training_hierarchy_id FROM "{schema}".training_hierarchy_links
                WHERE training_hierarchy_id = :id
            ''')
            if not connection.execute(hierarchy_check, {"id": new_hierarchy_id}).fetchone():
                return _cors_response({
                    "error": f"Training hierarchy with id {new_hierarchy_id} not found"
                }, 404)
        else:
            new_hierarchy_id = current_hierarchy_id

        batch_status = determine_batch_status(training_status)

        # Only touch the batch record if the request is actually changing a batch-related
        # field — otherwise leave employee_trainings.batch_id untouched.
        batch_fields_changed = ("batch_num" in data or "training_hierarchy_id" in data)
        batch_id = None
        if batch_fields_changed:
            # get the Batch record
             batch_id = resolve_training_batch(
                                    connection=connection,
                                    schema=schema,
                                    training_hierarchy_id=new_hierarchy_id,
                                    batch_num=batch_num,
                                    batch_description=data.get("Batch Description"),
                                    start_date=data.get("start_date"),
                                    end_date=data.get("end_date"),
                                    batch_status=batch_status,
                                    training_mode=data.get("Training Mode"),
                                    training_quarter=data.get("Training Quarter"),
                                    batch_status_remarks=data.get("Batch Status Remarks"),
                                    duration=data.get("Duration"),
                                    trainer=data.get("Trainer"),
                                    batch_size=data.get("Batch Size"),
                                    prerequisite=data.get("Prerequisite"),
                                    training_content=data.get("Training Content"),
                                    resources=data.get("Resources"),
                                    bulk_insert=False )

        # Step 3: Build dynamic UPDATE — only update provided fields
        updatable_fields = {
            "competency": data.get("competency"),
            "status_remarks": data.get("status_remarks"),
            "employee_type": employee_type,
            "nominated_by": data.get("nominated_by"),
            "start_date": normalize_date(data.get("start_date")),
            "end_date": normalize_date(data.get("end_date")),
        }

        # After approve/reject, save the reviewer's name in nominated_by (there is
        # no "Reviewed By" column). Skip this if the request sent nominated_by.
        if is_nomination_decision and "nominated_by" not in data:
            reviewer_row = connection.execute(
                text(f'SELECT name FROM "{schema}".employee WHERE id = :admin_id'),
                {"admin_id": admin_id},
            ).fetchone()
            if reviewer_row is not None:
                # If the reviewer has no name, save "Employee #<id>" instead.
                updatable_fields["nominated_by"] = reviewer_row[0] or f"Employee #{admin_id}"

        # Use the status that was sent; if none, work it out from a new start_date.
        if training_status:
            updatable_fields["training_status"] = training_status
        elif "start_date" in data:
            # start_date is being changed — derive status from new value
            new_start = data.get("start_date")
            if new_start:
                try:
                    sd = datetime.strptime(new_start, "%Y-%m-%d").date()
                    updatable_fields["training_status"] = "In Progress" if sd <= date.today() else "Not Started"
                except ValueError:
                    # Invalid date format — let DB constraint catch it; don't override status
                    pass
            else:
                # start_date explicitly set to null/empty
                updatable_fields["training_status"] = "Not Started"

        # Filter out None values — only update fields that were actually provided in the request
        updates = []
        params = {"id": employee_training_id}

        # Callers never send batch_id directly, so update it only when a batch
        # field changed (batch_fields_changed).
        if batch_fields_changed:
            updates.append("batch_id = :batch_id")
            params["batch_id"] = batch_id

        for field, value in updatable_fields.items():
            if field in data or (
                field == "training_status"
                and value is not None
                and "training_status" not in data
                and "start_date" in data
            ) or (
                field == "nominated_by"
                and value is not None
                and "nominated_by" not in data
                and is_nomination_decision
            ):
                updates.append(f"{field} = :{field}")
                params[field] = value

        if not updates:
            return _cors_response({"error": "No Employee Training fields supplied to update"}, 400)

        set_clause = ", ".join(updates)
        update_sql = f'UPDATE "{schema}".employee_trainings SET {set_clause} WHERE employee_training_id = :id'
        connection.execute(text(update_sql), params)

        # Audit trail: save every status decision in the comment table (type
        # "Department"), even with no note. Same transaction as the update.
        if is_explicit_status_change:
            decision_note = (data.get("status_remarks") or "").strip() or f"Status set to {training_status}"
            connection.execute(
                text(f'''
                    INSERT INTO "{schema}"."comment"
                        (employee_training_id, comment_type, comment_text, commented_by_id, commented_at)
                    VALUES
                        (:training_id, 'Department', :comment_text, :admin_id, CURRENT_TIMESTAMP)
                '''),
                {"training_id": employee_training_id, "comment_text": decision_note, "admin_id": admin_id},
            )

    logger.info(f"Updated employee training (id={employee_training_id}) by admin_id={admin_id}")

    # Fetch the updated record for response
    with engine.connect() as connection:
        updated_results = fetch_employee_trainings(connection, schema, training_id=employee_training_id)

    # Email the employee about the decision. If the email fails, the response
    # is still a success.
    if is_nomination_decision and updated_results:
        try:
            record = updated_results[0]
            employee_name = record.get("employee_name")
            nominated_by = record.get("nominated_by")
            training_name = _training_name(
                record.get("area_name"), record.get("sub_area_name"), record.get("module_name")
            )
            app_url = resolve_app_url(request)
            if training_status == "Not Started":
                decision_event = "approved"
                subject, body = build_training_approved_email(
                    app_url, employee_name, training_name, batch_num, nominated_by, note=decision_note
                )
            else:
                decision_event = "rejected"
                subject, body = build_training_rejected_email(
                    app_url, employee_name, training_name, batch_num, decision_note, nominated_by
                )
            if subject:
                send_training_email(
                    record.get("email"), subject, body,
                    context=f"event={decision_event} employee_training_id={employee_training_id}",
                )
        except Exception:
            logger.exception(
                f"[training-email] decision failed for employee_training_id={employee_training_id}"
            )

    # Sync CSV after update
    csv_synced = sync_csv_after_write(engine, schema)

    if publish_event and SystemEventType:
        try:
            with engine.connect() as conn:
                publish_event(conn, SystemEventType.EMPLOYEE_TRAINING_UPDATED.value, {
                    "action": "UPDATE",
                    "data": {"employee_training_id": employee_training_id}
                })
                publish_event(conn, SystemEventType.TRAINING_MAPPING_UPDATED.value, {
                    "action": "UPDATE", "data": {"employee_training_id": employee_training_id}
                })
        except Exception as e:
            logger.error(f"Webhook dispatch failed: {e}")

    response_data = {
        "message": "Employee training updated successfully",
        "employee_training_id": employee_training_id,
        "csv_synced": csv_synced,
    }
    if updated_results:
        response_data["record"] = updated_results[0]

    return _cors_response(response_data, 200)


def handle_delete(request):
    """
    Handle DELETE requests to remove an employee training record.

    admin_id → the person making the request (must have dept/admin/hr role)

    DELETE /?id=<int>&admin_id=<int>  → Deletes the training record with the given id
    """
    training_id = request.args.get("id")
    admin_id    = request.args.get("admin_id")

    if not training_id:
        return _cors_response({"error": "Missing required query parameter: id"}, 400)
    if not admin_id:
        return _cors_response({"error": "Missing required query parameter: admin_id"}, 400)

    try:
        training_id = int(training_id)
    except (ValueError, TypeError):
        return _cors_response({"error": "Invalid id parameter, must be an integer"}, 400)

    try:
        admin_id = int(admin_id)
    except (ValueError, TypeError):
        return _cors_response({"error": "Invalid admin_id parameter, must be an integer"}, 400)

    engine = get_db_engine()
    schema = os.getenv("DB_SCHEMA")
    logger.info(f"Using schema: {schema}")

    with engine.begin() as connection:
        # Step 0: Authorize — only dept/admin/hr roles allowed (checks admin_id)
        check_role_authorization(admin_id, connection, schema)

        # Step 1: Check if the training record exists
        select_query = text(f'''
            SELECT employee_training_id
            FROM "{schema}".employee_trainings
            WHERE employee_training_id = :id
        ''')
        existing = connection.execute(select_query, {"id": training_id}).fetchone()

        if not existing:
            return _cors_response(
                {"error": f"Employee training with id {training_id} not found"}, 404
            )

        # Step 2: Count associated comments (ON DELETE CASCADE handles actual deletion)
        comment_count_query = text(f'''
            SELECT COUNT(*) FROM "{schema}".comment
            WHERE employee_training_id = :id
        ''')
        comment_count = connection.execute(comment_count_query, {"id": training_id}).fetchone()[0]

        # Step 3: Delete the training record
        delete_query = text(f'''
            DELETE FROM "{schema}".employee_trainings WHERE employee_training_id = :id
        ''')
        connection.execute(delete_query, {"id": training_id})
        logger.info(f"Deleted employee training (id={training_id}) by admin_id={admin_id}")

    # Sync CSV after delete — the CSV now tracks per-employee rows, so deleted rows must be removed
    csv_synced = sync_csv_after_write(engine, schema)

    if publish_event and SystemEventType:
        try:
            with engine.connect() as conn:
                publish_event(conn, SystemEventType.EMPLOYEE_TRAINING_UPDATED.value, {
                    "action": "DELETE",
                    "data": {"employee_training_id": training_id}
                })
                publish_event(conn, SystemEventType.TRAINING_MAPPING_DELETED.value, {
                    "action": "DELETE", "data": {"employee_training_id": training_id}
                })
        except Exception as e:
            logger.error(f"Webhook dispatch failed: {e}")

    response = {
        "message": "Employee training deleted successfully",
        "employee_training_id": training_id,
        "csv_synced": csv_synced,
    }
    if comment_count > 0:
        response["comments_deleted"] = comment_count

    return _cors_response(response, 200)


def clean_error_message(error):
    msg = str(error)

    if "DatetimeFieldOverflow" in msg:
        return "Invalid date format. Expected YYYY-MM-DD."

    if "violates foreign key constraint" in msg:
        return "Invalid reference data."

    if "duplicate key value" in msg:
        return "Duplicate record detected."

    if "current transaction is aborted" in msg:
        return "Database transaction failed due to a previous row error."

    return "Unexpected error while processing this row."


def validate_date(date_str):
    if not date_str:
        return True
    try:
        datetime.strptime(date_str, "%Y-%m-%d")
        return True
    except:
        return False


# ============================================================================
# TRAINING BATCH HANDLERS
# ============================================================================

def handle_get_training_batch(request):
    """
    GET /training_batch      → Returns all training batch records
    GET /?batch_id=<int>     → Returns a single training batch record
    GET /?batch_num=<str>    → Returns a single training batch record
  
    Omit batch_id (or send no body / {}) to fetch ALL batches.
    """

    try:
        data = request.get_json(silent=True) if request.is_json else {}
        data = data or {}

        batch_id_raw = request.args.get("batch_id")
        batch_id = None
        if batch_id_raw is not None:
            try:
                batch_id = int(batch_id_raw)
            except (ValueError, TypeError):
                return _cors_response({"error": "batch_id must be an integer"}, 400)
            
        batch_num = request.args.get("batch_num")
        if batch_num is not None:
            batch_num = batch_num.strip()

        batches = get_training_batch(batch_id,batch_num)

        if batch_id:
            response = _cors_response({"batch": batches}, 200)
        else:
            response = _cors_response({"batches": batches, "count": len(batches)}, 200)

        return response
    except Exception as e:
            logger.exception("Unexpected error in add_training_v2 " + str(e))
            return _cors_response({"error": str(e)}, 500)


def handle_post_training_batch(request):
    """
    POST /training_batch
    
    Body:
    {
        "admin_id": 365,
        "area": "Python",
        "subarea": "Backend",
        "module": "FastAPI",
        "batch_num": "2026-07",
        "batch_status": "Planned",
        "start_date": "2026-07-01",
        "end_date": "2026-07-15"
    }
    """

    if not request.is_json:
        logger.warning("Request must be JSON")
        return _cors_response({"error": "Request must be JSON"}, 400)

    data = request.get_json(silent=True)

    if not data:
        logger.warning("Invalid JSON data")
        return _cors_response({"error": "Invalid JSON data"}, 400)

    try:   
        response_data = add_training_batch(data)

        return _cors_response(response_data, 201)

    except ValueError as e:
        logger.warning("Validation error: %s", str(e))
        status = 403 if "Access denied" in str(e) else 400
        return _cors_response({"error": str(e)}, status)
    
    except ConflictError as e:
        logger.warning("Error: %s", str(e))
        return _cors_response({"error": str(e)}, 409)
    
    except Exception as e:
            logger.exception("Unexpected error in add_training_v2 " + str(e))
            return _cors_response({"error": str(e)}, 500)
    

def handle_put_training_batch(request):
    """
    PUT /training_batch
    
    Body:
    {
        "admin_id": 365,
        "area": "Python",
        "subarea": "Backend",
        "module": "FastAPI",
        "batch_num": "2026-07",
        "batch_status": "Planned",
        "start_date": "2026-07-01",
        "end_date": "2026-07-15"
    }
    """

    if not request.is_json:
        logger.warning("Request must be JSON")
        return _cors_response({"error": "Request must be JSON"}, 400)

    data = request.get_json(silent=True)

    if not data:
        logger.warning("Invalid JSON data")
        return _cors_response({"error": "Invalid JSON data"}, 400)

    try:   
        response_data = update_training_batch(data)

        return _cors_response(response_data, 200)

    except ValueError as e:
        logger.warning("Validation error: %s", str(e))
        status = 403 if "Access denied" in str(e) else 400
        return _cors_response({"error": str(e)}, status)

    except ConflictError as e:
        logger.warning("Error: %s", str(e))
        return _cors_response({"error": str(e)}, 409)
    
    except Exception as e:
            logger.exception("Unexpected error in add_training_v2 " + str(e))
            return _cors_response({"error": str(e)}, 500)


def handle_delete_training_batch(request):
    """
    DELETE /training_batch?batch_id=<int>&admin_id=<int>

    Deletes a training batch. Refuses (409) if any employee_trainings records
    still reference it -- those must be reassigned or deleted first.
    """

    data = {
        "batch_id": request.args.get("batch_id"),
        "admin_id": request.args.get("admin_id"),
    }

    try:
        response_data = delete_training_batch(data)

        return _cors_response(response_data, 200)

    except ValueError as e:
        logger.warning("Validation error: %s", str(e))
        status = 403 if "Access denied" in str(e) else 400
        return _cors_response({"error": str(e)}, status)

    except ConflictError as e:
        logger.warning("Error: %s", str(e))
        payload = {"error": str(e)}
        # Frontend branches on this count to show a friendly "N enrollment(s)
        # still reference this batch" message instead of the raw error.
        count = getattr(e, "employee_training_count", None)
        if count is not None:
            payload["employee_training_count"] = count
        return _cors_response(payload, 409)

    except Exception as e:
            logger.exception("Unexpected error in add_training_v2 " + str(e))
            return _cors_response({"error": str(e)}, 500)



# ============================================================================
# BULK UPLOAD HELPERS
# ============================================================================

# DB Performance hint:
# CREATE INDEX IF NOT EXISTS idx_employee_emp_id ON "schema".employee(emp_id);

def normalize_emp_id_raw(val):
    """
    Strip the '.0' suffix that Excel adds when reading numeric IDs as floats.
    e.g. "5742.0" → "5742", "005742" → "005742" (unchanged)
    """
    s = str(val).strip()
    if s.endswith(".0"):
        s = s[:-2]
    return s


def find_employee_by_emp_id(connection, schema, emp_id_raw):
    """
    Look up employee by emp_id using three OR conditions to handle format variations:
      - Raw value as-is          (e.g. "5742")
      - Zero-padded to 6 digits  (e.g. "005742")
      - Integer-stripped / no leading zeros (e.g. "5742" from "005742")
    Returns (employee.id, matched_emp_id) or (None, None).
    """
    raw = normalize_emp_id_raw(emp_id_raw)

    # Build padded and numeric variants
    try:
        numeric_val = str(int(raw))          # strips leading zeros: "005742" → "5742"
        padded_val = numeric_val.zfill(6)    # zero-pads:            "5742"   → "005742"
    except ValueError:
        # Non-numeric emp_id — just search raw
        numeric_val = raw
        padded_val = raw

    query = text(f'''
        SELECT id, emp_id FROM "{schema}".employee
        WHERE emp_id = :raw OR emp_id = :padded OR emp_id = :numeric
        LIMIT 1
    ''')
    result = connection.execute(query, {
        "raw": raw,
        "padded": padded_val,
        "numeric": numeric_val,
    }).fetchone()

    if result:
        return result[0], result[1]   # (employee.id, matched_emp_id)
    return None, None




# --------------------------------------------------------------------------
# Excel Upload Report builder (openpyxl)
# --------------------------------------------------------------------------

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter


def build_upload_report(success_records, failed_records):
    """
    Build an Excel workbook with two sheets:
      ✅ Successfully Processed — green header
      ❌ Failed Records          — red header, error-highlighted

    Returns the workbook as bytes in a BytesIO buffer.
    """
    wb = Workbook()

    # ── Colour palette ───────────────────────────────────────────────────────
    GREEN_HEADER  = PatternFill(start_color="4CAF50", end_color="4CAF50", fill_type="solid")
    RED_HEADER    = PatternFill(start_color="F44336", end_color="F44336", fill_type="solid")
    LIGHT_RED     = PatternFill(start_color="FFCDD2", end_color="FFCDD2", fill_type="solid")
    LIGHT_GREEN   = PatternFill(start_color="C8E6C9", end_color="C8E6C9", fill_type="solid")
    LIGHT_YELLOW  = PatternFill(start_color="FFF9C4", end_color="FFF9C4", fill_type="solid")
    ALT_ROW       = PatternFill(start_color="F5F5F5", end_color="F5F5F5", fill_type="solid")
    HEADER_FONT   = Font(bold=True, color="FFFFFF", size=11)
    TITLE_FONT    = Font(bold=True, size=13)
    thin_border   = Border(
        left=Side(style="thin", color="DDDDDD"),
        right=Side(style="thin", color="DDDDDD"),
        top=Side(style="thin", color="DDDDDD"),
        bottom=Side(style="thin", color="DDDDDD"),
    )
    DATA_ALIGNMENT = Alignment(wrap_text=True, vertical="top")

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    total = len(success_records) + len(failed_records)

    # =====================================================================
    # Sheet 1: ✅ Successfully Processed
    # =====================================================================
    ws1 = wb.active
    ws1.title = "✅ Successfully Processed"

    success_cols = [
        "Row #", "Employee ID", "Employee Name",
        "Area", "Sub Area", "Module", "Module Course Level", "Batch Number",
        "Employee Type", "Training Status", "Start Date", "End Date",
        "Competency", "employee_training_id", "training_hierarchy_id",
        "Status", "Warnings",
    ]

    # Title row
    ws1.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(success_cols))
    title_cell = ws1.cell(row=1, column=1,
                          value=f"Bulk Upload Report — {total} total records | Generated: {now_str}")
    title_cell.font = TITLE_FONT
    title_cell.alignment = Alignment(horizontal="left")

    # Header row (row 2)
    for ci, col_name in enumerate(success_cols, start=1):
        cell = ws1.cell(row=2, column=ci, value=col_name)
        cell.fill = GREEN_HEADER
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        cell.border = thin_border

    warnings_col_idx_s = success_cols.index("Warnings") + 1

    # Data rows
    for ri, rec in enumerate(success_records, start=3):
        is_even = (ri % 2 == 0)
        for ci, col_name in enumerate(success_cols, start=1):
            cell = ws1.cell(row=ri, column=ci, value=rec.get(col_name, ""))
            cell.border = thin_border
            cell.alignment = DATA_ALIGNMENT
            if is_even:
                cell.fill = ALT_ROW
        # Highlight Warnings column
        warn_cell = ws1.cell(row=ri, column=warnings_col_idx_s)
        if warn_cell.value:
            warn_cell.fill = LIGHT_YELLOW

    ws1.freeze_panes = "A3"
    ws1.auto_filter.ref = f"A2:{get_column_letter(len(success_cols))}{max(3, 2 + len(success_records))}"

    # Auto-width
    for ci in range(1, len(success_cols) + 1):
        ws1.column_dimensions[get_column_letter(ci)].width = max(14, len(success_cols[ci - 1]) + 4)

    # =====================================================================
    # Sheet 2: ❌ Failed Records
    # =====================================================================
    ws2 = wb.create_sheet(title="❌ Failed Records")

    failed_cols = [
        "Row #", "Employee ID", "Employee Name", "Email",
        "Area", "Sub Area", "Module", "Batch Number", "Employee Type",
        "Training Status (Original)", "Training Status (Normalized)",
        "Start Date (Original)", "Start Date (Normalized)",
        "End Date (Original)", "End Date (Normalized)",
        "Error(s)", "Warnings",
    ]

    # Title row
    ws2.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(failed_cols))
    title_cell2 = ws2.cell(row=1, column=1,
                           value=f"Failed Records — {len(failed_records)} rows | Generated: {now_str}")
    title_cell2.font = TITLE_FONT
    title_cell2.alignment = Alignment(horizontal="left")

    # Header row (row 2)
    for ci, col_name in enumerate(failed_cols, start=1):
        cell = ws2.cell(row=2, column=ci, value=col_name)
        cell.fill = RED_HEADER
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        cell.border = thin_border

    error_col_idx   = failed_cols.index("Error(s)") + 1
    warnings_col_idx_f = failed_cols.index("Warnings") + 1
    norm_status_idx = failed_cols.index("Training Status (Normalized)") + 1
    norm_start_idx  = failed_cols.index("Start Date (Normalized)") + 1
    norm_end_idx    = failed_cols.index("End Date (Normalized)") + 1

    for ri, rec in enumerate(failed_records, start=3):
        is_even = (ri % 2 == 0)
        for ci, col_name in enumerate(failed_cols, start=1):
            cell = ws2.cell(row=ri, column=ci, value=rec.get(col_name, ""))
            cell.border = thin_border
            cell.alignment = DATA_ALIGNMENT
            if is_even:
                cell.fill = ALT_ROW
        # Highlight Error(s) in light red
        err_cell = ws2.cell(row=ri, column=error_col_idx)
        if err_cell.value:
            err_cell.fill = LIGHT_RED
        # Highlight normalized columns in light green
        for nc in (norm_status_idx, norm_start_idx, norm_end_idx):
            nc_cell = ws2.cell(row=ri, column=nc)
            if nc_cell.value:
                nc_cell.fill = LIGHT_GREEN
        # Highlight Warnings in light yellow
        warn_cell = ws2.cell(row=ri, column=warnings_col_idx_f)
        if warn_cell.value:
            warn_cell.fill = LIGHT_YELLOW

    ws2.freeze_panes = "A3"
    ws2.auto_filter.ref = f"A2:{get_column_letter(len(failed_cols))}{max(3, 2 + len(failed_records))}"

    # Auto-width
    for ci in range(1, len(failed_cols) + 1):
        ws2.column_dimensions[get_column_letter(ci)].width = max(14, len(failed_cols[ci - 1]) + 4)

    # ── Save to BytesIO ──────────────────────────────────────────────────────
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def handle_bulk_upload(request):
    """
    Handle POST /bulk-upload to import employee training records from a CSV/Excel file.
    Uses the same logic as handle_post for each row — resolves hierarchy, validates
    employee, checks duplicates, auto-sets training_status, and inserts into employee_trainings.

    Accepts multipart/form-data with:
        - file     : CSV or Excel file (required)
                     Required columns : Employee ID, Area, Sub Area, Module
                     Optional columns : Area Description, Sub Area Description,
                                        Module Course Level, Module Description,
                                        Batch, Competency, Grade, Employee Type,
                                        Project Name, Segment, Customer, Delivery Head,
                                        Start Date, End Date
        - admin_id : int (required) — must have dept/admin/hr role

    Per-row processing (mirrors handle_post):
        1. Verify Employee ID exists in the employee table
        2. Resolve training hierarchy via resolve_training_hierarchy (get-or-create)
        3. Duplicate check — skip if employee + hierarchy combo already exists
        4. Validate employee_type enum if provided
        5. Auto-set training_status based on start_date (via determine_training_status)
        6. INSERT into employee_trainings with all columns

    After all DB inserts, does a full re-export to the GCS CSV.
    """
    # ── Validate admin_id ────────────────────────────────────────────────────
    admin_id = request.form.get("admin_id")
    if admin_id is None or str(admin_id).strip() == "":
        return _cors_response({"error": "Missing required field: admin_id"}, 400)

    try:
        admin_id = int(admin_id)
    except (ValueError, TypeError):
        return _cors_response({"error": "admin_id must be an integer"}, 400)

    # ── Validate uploaded file ───────────────────────────────────────────────
    if "file" not in request.files:
        return _cors_response({"error": "No file uploaded. Send a CSV/Excel file with key 'file'"}, 400)

    uploaded_file = request.files["file"]
    if not uploaded_file.filename:
        return _cors_response({"error": "Empty filename"}, 400)

    if not uploaded_file.filename.lower().endswith((".csv", ".xlsx", ".xls")):
        return _cors_response({"error": "Invalid file type. Only CSV and Excel (.csv, .xlsx, .xls) files are supported."}, 400)

    # ── Read file into DataFrame ─────────────────────────────────────────────
    try:
        if uploaded_file.filename.lower().endswith(".csv"):
            try:
                df = pd.read_csv(uploaded_file)
            except UnicodeDecodeError:
                # Excel's "Save as CSV" on Windows writes cp1252, not UTF-8
                # (e.g. 0xA0 for a non-breaking space) — retry with that encoding.
                uploaded_file.seek(0)
                df = pd.read_csv(uploaded_file, encoding="cp1252")
        else:
            df = pd.read_excel(uploaded_file)
    except Exception as e:
        error_str = str(e)
        if "No columns to parse" in error_str or "buffer refers to an empty file" in error_str:
             return _cors_response({"error": "Uploaded file is empty. Please upload a file containing training data."}, 400)
        return _cors_response({"error": f"Failed to read file: {error_str}"}, 400)

    if df.empty:
        return _cors_response({"error": "Uploaded file is empty. Please upload a file containing training data."}, 400)

    # ── Normalize header names (strip " (Optional)") ─────────────────────────
    df.columns = [str(c).replace(" (Optional)", "").replace("(Optional)", "").strip() for c in df.columns]

    # Normalize flexible header variants to internal expected names
    
    df.rename(columns=header_map, inplace=True)

    # ── Validate required columns ────────────────────────────────────────────
    required_columns = ["batch_num","Employee ID", "Area", "Sub Area", "Module"]
    missing_columns = [col for col in required_columns if col not in df.columns]
    if missing_columns:
        return _cors_response({
            "error": f"Missing required columns: {', '.join(missing_columns)}"
        }, 400)

    # ── Extra Columns Warning ──────────────────────────────────────────────
    expected_columns_raw = [
        "batch_num","Batch Description",
        "Employee ID", "Area", "Sub Area", "Module",
        "Area Description", "Sub Area Description",
        "Module Course Level", "Module Description",
        "Employee Type", "Start Date", "End Date","Competency",
        "Training Status","Status Remarks","Nominated By","Training Mode",
        "Training Quarter","Batch Status","Batch Status Remarks","Duration",
        "Trainer","Batch Size","Prerequisite",
        "Training Content","Resources"
    ]
    ignored_columns = [col for col in df.columns if col not in expected_columns_raw and col not in required_columns]

    # ── Clean required columns ───────────────────────────────────────────────
    for col in required_columns:
        df[col] = df[col].fillna("").astype(str).str.strip()

    # ── Optional columns — keep as-is (None if missing) ─────────────────────
    optional_columns = [
        "Batch Description","Area Description", "Sub Area Description",
        "Module Course Level", "Module Description","Competency", "Employee Type",
        "Start Date", "End Date", "Training Status","Status Remarks","Nominated By","Training Mode",
        "Training Quarter","Batch Status","Batch Status Remarks","Duration","Trainer","Batch Size","Prerequisite",
        "Training Content","Resources"
    ]
    for col in optional_columns:
        if col not in df.columns:
            df[col] = None
        else:
            df[col] = df[col].where(df[col].notna(), None)

    # ── Identify faulty rows (missing required fields or duplicate employee+hierarchy) ──
    missing_mask = (df[required_columns] == "").any(axis=1)

    # CASE-INSENSITIVE and TRIMMED duplicate check
    df_norm = df.copy()
    for col in required_columns:
        df_norm[col] = df_norm[col].astype(str).str.strip().str.lower()
    
    duplicate_mask = df_norm.duplicated(subset=required_columns, keep="first")
    faulty_mask    = missing_mask | duplicate_mask

    faulty_rows = df[faulty_mask]
    valid_rows  = df[~faulty_mask]

    if valid_rows.empty:
        return _cors_response({
            "error": "No valid rows found in the file",
            "faulty_rows_count": len(faulty_rows),
            "faulty_rows": faulty_rows.head(20).to_dict(orient="records"),
        }, 400)

    engine = get_db_engine()
    schema = os.getenv("DB_SCHEMA")
    logger.info(f"Bulk upload: {len(valid_rows)} valid rows, {len(faulty_rows)} faulty rows")

    created_count = 0
    updated_count = 0
    skipped_count = 0
    error_count   = 0
    row_results   = []

    # Report data collectors (Fix 4)
    success_records_list = []
    failed_records_list  = []

    # Log faulty rows (missing required fields / in-file duplicates) into the report
    for orig_idx, frow in faulty_rows.iterrows():
        csv_row_num = orig_idx + 2  # +2 for 1-based indexing + header row
        errors = []
        if missing_mask.loc[orig_idx]:
            missing_fields = [col for col in required_columns if str(frow.get(col, "")).strip() == ""]
            errors.append(f"Missing required field(s): {', '.join(missing_fields)}")
        if duplicate_mask.loc[orig_idx]:
            errors.append("Duplicate row within file")
        error_msg = "; ".join(errors)
        error_count += 1
        row_results.append({"row": csv_row_num, "status": "error", "error": error_msg})
        failed_records_list.append({
            "Row #": csv_row_num,
            "Employee ID": str(frow.get("Employee ID", "")).strip(),
            "Employee Name": str(frow.get("Emp Name", "")).strip(),
            "Email": str(frow.get("Email", "")).strip(),
            "Area": str(frow.get("Area", "")).strip(),
            "Sub Area": str(frow.get("Sub Area", "")).strip(),
            "Module": str(frow.get("Module", "")).strip(),
            "batch_num": str(frow.get("batch_num", "")),
            "Employee Type": str(frow.get("Employee Type", "")),
            "Training Status (Original)": str(frow.get("Training Status", "")),
            "Training Status (Normalized)": "",
            "Start Date (Original)": str(frow.get("Start Date", "")),
            "Start Date (Normalized)": "",
            "End Date (Original)": str(frow.get("End Date", "")),
            "End Date (Normalized)": "",
            "Error(s)": error_msg,
            "Warnings": "",
        })

    with engine.begin() as connection:
        # Authorize once
        check_role_authorization(admin_id, connection, schema)

        # Pre-load caches to avoid per-row DB queries
        emp_cache = {}
        for e in connection.execute(text(f'SELECT id, emp_id FROM "{schema}".employee')).fetchall():
            emp_cache[str(e[1]).strip()] = (e[0], e[1])
            try:
                numeric = str(int(e[1]))
                emp_cache[numeric] = (e[0], e[1])
                emp_cache[numeric.zfill(6)] = (e[0], e[1])
            except (ValueError, TypeError):
                pass

        existing_trainings = {}
        for t in connection.execute(text(f'SELECT employee_training_id, employee_id, batch_id, training_status FROM "{schema}".employee_trainings')).fetchall():
            existing_trainings[(t[1], t[2])] = (t[0], str(t[3]))

        hierarchy_cache = {}
        for _, h_row in valid_rows[['Area', 'Sub Area', 'Module']].drop_duplicates().iterrows():
            a, s, m = str(h_row['Area']).strip(), str(h_row['Sub Area']).strip(), str(h_row['Module']).strip()
            h_key = (a.lower(), s.lower(), m.lower())
            if h_key not in hierarchy_cache:
                hierarchy_cache[h_key] = resolve_training_hierarchy(a, s, m, connection, schema)


        batch_cache = {}
        failed_batches = {}      # batch_num -> error message

        # Group rows by Batch Number
        batch_groups = valid_rows.groupby("batch_num", dropna=False)

        # Resolve and Cache the batches
        for batch_num, batch_df in batch_groups:

            connection.execute(text("SAVEPOINT batch_sp"))

            try:

                # First row represents the batch metadata
                first_row = batch_df.iloc[0]

                area = str(_safe_value(first_row["Area"])).strip()
                sub_area = str(_safe_value(first_row["Sub Area"])).strip()
                module = str(_safe_value(first_row["Module"])).strip()

                hierarchy_key = (area.lower(), sub_area.lower(), module.lower())
                
                # Resolve training hierarchy (pre-resolved, cached) ──
                hierarchy_id = hierarchy_cache[hierarchy_key]

                
                batch_status, _ = normalize_training_Batch_status(_safe_value(first_row.get("Batch Status")))
                start_date = normalize_date(_safe_value(first_row.get("Start Date")))
                end_date = normalize_date(_safe_value(first_row.get("End Date")))

                if not start_date :
                    row_errors_msg = "Training Start date is not given"
                    failed_batches[batch_num] = str(row_errors_msg)
                    continue

                if start_date and not validate_date(start_date):
                    # normalize_date() keeps unknown formats as they are, so this is the
                    # original value from the file.
                    row_errors_msg = f"Invalid date format '{start_date}'. Please use YYYY-MM-DD."
                    failed_batches[batch_num] = str(row_errors_msg)
                    continue

                if end_date and not validate_date(end_date):
                    row_errors_msg = f"Invalid date format '{end_date}'. Please use YYYY-MM-DD."
                    failed_batches[batch_num] = str(row_errors_msg)
                    continue
                   
                if start_date and end_date:
                    try:
                        sd = datetime.strptime(start_date, "%Y-%m-%d")
                        ed = datetime.strptime(end_date, "%Y-%m-%d")
                        if ed < sd:
                            row_errors_msg = f"End Date ({end_date}) cannot be before Start Date ({start_date})."
                            failed_batches[batch_num] = str(row_errors_msg)
                            continue

                    except ValueError:
                        connection.execute(text("ROLLBACK TO SAVEPOINT batch_sp"))
                        logger.exception("Failed creating batch %s", batch_num)
                        failed_batches[batch_num] = str(e)
                
                
                # Validate Training mode enum if provided
                raw_training_mode = first_row.get("Training Mode")
                training_mode, type_msg = normalize_training_mode(raw_training_mode)
                if raw_training_mode and training_mode is None:
                    row_errors_msg = type_msg
                    failed_batches[batch_num] = str(row_errors_msg)
                    continue
                    
                
                # Validate Batch Size if provided
                raw_batch_size = first_row.get("Batch Size")
                if raw_batch_size is not None:
                    try:
                        batch_size = int(raw_batch_size)
                    except (ValueError, TypeError):
                        row_errors_msg = f"Invalid batch_size '{raw_batch_size}', must be an integer."
                        failed_batches[batch_num] = str(row_errors_msg)
                        continue
            

                # get the Batch record
                batch_id = resolve_training_batch(
                    connection=connection,
                    schema=schema,
                    training_hierarchy_id=hierarchy_id,
                    batch_num=batch_num,
                    batch_description=_safe_value(first_row.get("Batch Description")),  
                    start_date=start_date,
                    end_date=end_date,
                    batch_status=batch_status,
                    training_mode=_safe_value(training_mode),
                    training_quarter=_safe_value(first_row.get("Training Quarter")),
                    batch_status_remarks=_safe_value(first_row.get("Batch Status Remarks")),
                    duration=_safe_value(first_row.get("Duration")),
                    trainer=_safe_value(first_row.get("Trainer")),
                    batch_size=_safe_value(batch_size),
                    prerequisite=_safe_value(first_row.get("Prerequisite")),
                    training_content=_safe_value(first_row.get("Training Content")),
                    resources=_safe_value(first_row.get("Resources")),
                    bulk_insert=True )

                if batch_num not in batch_cache:
                    batch_cache[batch_num] = batch_id

                connection.execute(text("RELEASE SAVEPOINT batch_sp"))

            except Exception as e:
                connection.execute(text("ROLLBACK TO SAVEPOINT batch_sp"))

                logger.exception("Failed creating batch %s", batch_num)

                failed_batches[batch_num] = str(e)

                # Continue with next batch
                continue


        # Process data from input csv
        for orig_idx, row in valid_rows.iterrows():
            row_num = orig_idx + 2  # CSV row number (1-based + header)
            row_warnings = []

            try:
                connection.execute(text("SAVEPOINT row_sp"))

                def _safe(field):
                    """Return None for NaN/empty/None values, otherwise the actual value."""
                    v = row.get(field)
                    if v is None or (isinstance(v, float) and pd.isna(v)) or str(v).strip() in ("nan", "None", ""):
                        return None

                    # pandas reads 1234 as 1234.0, so turn it back into "1234".
                    if isinstance(v, float) and v.is_integer():
                        return str(int(v))

                    # If it's already a date/datetime/Timestamp object from pandas, format it
                    if isinstance(v, (date, datetime, pd.Timestamp)):
                        return v.strftime("%Y-%m-%d")

                    s = str(v).strip()
                    if s.endswith(".0") and s[:-2].isdigit():
                        return s[:-2]
                    return s

                emp_name = _safe("Emp Name") or ""
                emp_email = _safe("Email") or ""

                batch_num = _safe("batch_num")

                # Skip rows belonging to failed batches.
                if batch_num in failed_batches:

                    error = failed_batches[batch_num]

                    row_results.append({
                        "row": row_num,
                        "status": "error",
                        "error": error
                    })

                    failed_records_list.append({
                        "Row #": row_num,
                        "Employee ID": _safe("Employee ID"),
                        "Employee Name": _safe("Emp Name"),
                        "Email": _safe("Email"),
                        "Area": _safe("Area"),
                        "Sub Area": _safe("Sub Area"),
                        "Module": _safe("Module"),
                        "Batch_num": batch_num,
                        "Employee Type": _safe("Employee Type"),
                        "Training Status (Original)": _safe("Training Status"),
                        "Training Status (Normalized)": "",
                        "Start Date (Original)": _safe("Start Date"),
                        "Start Date (Normalized)": "",
                        "End Date (Original)": _safe("End Date"),
                        "End Date (Normalized)": "",
                        "Error(s)": error,
                        "Warnings": ""
                    })

                    error_count += 1
                    continue

                # ── Resolve Batch id (pre-resolved, cached) ──
                batch_id = batch_cache.get(batch_num)

                if batch_id is None:
                    row_results.append({"row": row_num, "status": "error", "error": "Missing required field: Batch"})
                    error_count += 1
                    failed_records_list.append({
                        "Row #": row_num, "Employee ID": _safe("Employee ID"),
                        "Employee Name": emp_name, "Email": emp_email,
                        "Area": _safe("Area"), "Sub Area": _safe("Sub Area"),
                        "Module": _safe("Module"), "Batch Number": batch_num, "Employee Type": _safe("Employee Type"),
                        "Training Status (Original)": _safe("Training Status"), "Training Status (Normalized)": "",
                        "Start Date (Original)": _safe("Start Date"), "Start Date (Normalized)": "",
                        "End Date (Original)": _safe("End Date"), "End Date (Normalized)": "",
                        "Error(s)": "Missing required field: Batch", "Warnings": "",
                    })
                    continue

                # ── 1. Validate Employee ID (cached lookup) ────────────────
                employee_id_raw = _safe("Employee ID") or ""
                raw = normalize_emp_id_raw(employee_id_raw)
                emp_match = emp_cache.get(raw)
                if not emp_match:
                    try:
                        numeric = str(int(raw))
                        emp_match = emp_cache.get(numeric) or emp_cache.get(numeric.zfill(6))
                    except ValueError:
                        pass
                employee_id, _ = emp_match if emp_match else (None, None)

                if employee_id is None:
                    normalized_raw = normalize_emp_id_raw(employee_id_raw)
                    row_errors_msg = f"Employee with emp_id '{normalized_raw}' not found."
                    row_results.append({"row": row_num, "status": "error", "error": row_errors_msg})
                    error_count += 1
                    failed_records_list.append({
                        "Row #": row_num, "Employee ID": employee_id_raw,
                        "Employee Name": emp_name, "Email": emp_email,
                        "Area": _safe("Area"), "Sub Area": _safe("Sub Area"),
                        "Module": _safe("Module"), "Batch Number": batch_num, "Employee Type": _safe("Employee Type"),
                        "Training Status (Original)": _safe("Training Status"), "Training Status (Normalized)": "",
                        "Start Date (Original)": _safe("Start Date"), "Start Date (Normalized)": "",
                        "End Date (Original)": _safe("End Date"), "End Date (Normalized)": "",
                        "Error(s)": row_errors_msg, "Warnings": "",
                    })
                    continue

                # ── 2. Validate employee_type enum if provided ───────────
                raw_employee_type = _safe("Employee Type")
                employee_type, type_msg = normalize_employee_type(raw_employee_type)
                if raw_employee_type and employee_type is None:
                    row_errors_msg = type_msg
                    row_results.append({"row": row_num, "status": "error", "error": row_errors_msg})
                    error_count += 1
                    failed_records_list.append({
                        "Row #": row_num, "Employee ID": employee_id_raw,
                        "Employee Name": emp_name, "Email": emp_email,
                        "Area": _safe("Area"), "Sub Area": _safe("Sub Area"),
                        "Module": _safe("Module"), "Batch Number": batch_num, "Employee Type": employee_type,
                        "Training Status (Original)": _safe("Training Status"), "Training Status (Normalized)": "",
                        "Start Date (Original)": _safe("Start Date"), "Start Date (Normalized)": "",
                        "End Date (Original)": _safe("End Date"), "End Date (Normalized)": "",
                        "Error(s)": row_errors_msg, "Warnings": "",
                    })
                    continue

                # ── 3. Normalize dates (Fix 2) ───────────────────────────
                raw_start_date = _safe("Start Date")
                raw_end_date   = _safe("End Date")
                start_date = normalize_date(raw_start_date)
                end_date   = normalize_date(raw_end_date)

                # ── 4. Normalize training status (Fix 3) ─────────────────
                raw_manual_status = _safe("Training Status")
                if raw_manual_status:
                    norm_status, status_msg = normalize_training_status(raw_manual_status)
                    if norm_status is None:
                        # Unknown status — fail this row
                        row_results.append({"row": row_num, "status": "error", "error": status_msg})
                        error_count += 1
                        failed_records_list.append({
                            "Row #": row_num, "Employee ID": employee_id_raw,
                            "Employee Name": emp_name, "Email": emp_email,
                            "Area": _safe("Area"), "Sub Area": _safe("Sub Area"),
                            "Module": _safe("Module"), "Batch Number": batch_num, "Employee Type": employee_type,
                            "Training Status (Original)": raw_manual_status, "Training Status (Normalized)": "",
                            "Start Date (Original)": raw_start_date, "Start Date (Normalized)": start_date or "",
                            "End Date (Original)": raw_end_date, "End Date (Normalized)": end_date or "",
                            "Error(s)": status_msg, "Warnings": "",
                        })
                        continue
                    if status_msg:
                        row_warnings.append(status_msg)
                    training_status = norm_status
                else:
                    try:
                        training_status = determine_training_status({"start_date": start_date})
                    except ValueError as e:
                        row_errors_msg = str(e)
                        row_results.append({"row": row_num, "status": "error", "error": row_errors_msg})
                        error_count += 1
                        failed_records_list.append({
                            "Row #": row_num, "Employee ID": employee_id_raw,
                            "Employee Name": emp_name, "Email": emp_email,
                            "Area": _safe("Area"), "Sub Area": _safe("Sub Area"),
                            "Module": _safe("Module"), "Batch Number": batch_num, "Employee Type": employee_type,
                            "Training Status (Original)": raw_manual_status or "", "Training Status (Normalized)": "",
                            "Start Date (Original)": raw_start_date, "Start Date (Normalized)": start_date or "",
                            "End Date (Original)": raw_end_date, "End Date (Normalized)": end_date or "",
                            "Error(s)": row_errors_msg, "Warnings": "",
                        })
                        continue

                # ── 5. Resolve training hierarchy (pre-resolved, cached) ──
                h_key = (str(row["Area"]).strip().lower(), str(row["Sub Area"]).strip().lower(), str(row["Module"]).strip().lower())
                hierarchy_id = hierarchy_cache[h_key]

                

                # ── 6. Duplicate check — same employee + same batch (cached) ──
                existing_dup = existing_trainings.get((employee_id, batch_id))

                if existing_dup:
                    existing_status = str(existing_dup[1]) if existing_dup[1] else None

                    # If training_status changed → update
                    if existing_status != training_status:
                        connection.execute(text(f'''
                            UPDATE "{schema}".employee_trainings
                            SET training_status = :training_status,
                                updated_at = NOW()
                            WHERE employee_training_id = :id
                        '''), {
                            "training_status": training_status,
                            "id": existing_dup[0]
                        })

                        existing_trainings[(employee_id, batch_id)] = (existing_dup[0], training_status)
                        updated_count += 1
                        row_results.append({
                            "row": row_num,
                            "status": "updated",
                            "employee_id": employee_id,
                            "batch_id":batch_id,
                            "training_hierarchy_id": hierarchy_id,
                            "employee_training_id": existing_dup[0],
                            "old_status": existing_status,
                            "new_status": training_status
                        })
                        success_records_list.append({
                            "Row #": row_num, "Employee ID": employee_id_raw,
                            "Employee Name": emp_name, "Area": str(row["Area"]).strip(),
                            "Sub Area": str(row["Sub Area"]).strip(), "Module": str(row["Module"]).strip(),
                            "Module Course Level": _safe("Module Course Level"),
                            "batch_num": batch_num, "Employee Type": employee_type,
                            "Training Status": training_status, "Start Date": start_date,
                            "End Date": end_date, "Competency": _safe("Competency"),
                            "employee_training_id": existing_dup[0], "training_hierarchy_id": hierarchy_id,
                            "Status": "updated",
                            "Warnings": "; ".join(row_warnings) if row_warnings else "",
                        })

                    else:
                        skipped_count += 1
                        row_results.append({
                            "row": row_num,
                            "status": "already_exists",
                            "employee_id": employee_id,
                            "batch_id":batch_id,
                            "training_hierarchy_id": hierarchy_id,
                            "existing_employee_training_id": existing_dup[0],
                        })
                        success_records_list.append({
                            "Row #": row_num, "Employee ID": employee_id_raw,
                            "Employee Name": emp_name, "Area": str(row["Area"]).strip(),
                            "Sub Area": str(row["Sub Area"]).strip(), "Module": str(row["Module"]).strip(),
                            "Module Course Level": _safe("Module Course Level"),
                            "batch_num": batch_num, "Employee Type": employee_type,
                            "Training Status": training_status, "Start Date": start_date,
                            "End Date": end_date, "Competency": _safe("Competency"),
                            "employee_training_id": existing_dup[0], "training_hierarchy_id": hierarchy_id,
                            "Status": "already_exists",
                            "Warnings": "; ".join(row_warnings) if row_warnings else "",
                        })

                    continue

                # ── 7. INSERT into employee_trainings ────────────────────
                new_id = connection.execute(text(f'''
                    INSERT INTO "{schema}".employee_trainings (
                        employee_id, batch_id, competency,
                        training_status, status_remarks, employee_type, start_date, end_date, nominated_by
                    ) VALUES (
                        :employee_id, :batch_id, :competency,
                        :training_status, :status_remarks, :employee_type, :start_date, :end_date, :nominated_by
                    )
                    RETURNING employee_training_id
                '''), {
                    "employee_id": employee_id,
                    "batch_id": batch_id,
                    "competency": _safe("Competency"),
                    "training_status": training_status,
                    "status_remarks": _safe("Status Remarks"),
                    "employee_type": employee_type,
                    "start_date": start_date,
                    "end_date": end_date,
                    "nominated_by": _safe("Nominated By"),
                }).fetchone()[0]

                existing_trainings[(employee_id, batch_id)] = (new_id, training_status)
                created_count += 1
                row_results.append({
                    "row": row_num, "status": "created",
                    "employee_training_id": new_id,
                    "employee_id": employee_id,
                    "batch_id":batch_id,
                    "training_hierarchy_id": hierarchy_id,
                    "training_status": training_status,
                })
                success_records_list.append({
                    "Row #": row_num, "Employee ID": employee_id_raw,
                    "Employee Name": emp_name, "Area": str(row["Area"]).strip(),
                    "Sub Area": str(row["Sub Area"]).strip(), "Module": str(row["Module"]).strip(),
                    "Module Course Level": _safe("Module Course Level"),
                    "Batch Number": batch_num, "Employee Type": employee_type,
                    "Training Status": training_status, "Start Date": start_date,
                    "End Date": end_date, "Competency": _safe("Competency"),
                    "employee_training_id": new_id, "training_hierarchy_id": hierarchy_id,
                    "Status": "created",
                    "Warnings": "; ".join(row_warnings) if row_warnings else "",
                })
                connection.execute(text("RELEASE SAVEPOINT row_sp"))

            except Exception as e:
                connection.execute(text("ROLLBACK TO SAVEPOINT row_sp"))
                error_count += 1
                logger.error(f"Error processing row {row_num}: {e}")
                row_results.append({"row": row_num, "status": "error", "error": clean_error_message(e)})
                failed_records_list.append({
                    "Row #": row_num, "Employee ID": normalize_emp_id_raw(str(row.get("Employee ID", ""))),
                    "Employee Name": str(row.get("Emp Name", "")), "Email": str(row.get("Email", "")),
                    "Area": str(row.get("Area", "")), "Sub Area": str(row.get("Sub Area", "")),
                    "Module": str(row.get("Module", "")), "Batch Number": batch_num, "Employee Type": str(row.get("Employee Type", "")),
                    "Training Status (Original)": str(row.get("Training Status", "")),
                    "Training Status (Normalized)": "",
                    "Start Date (Original)": str(row.get("Start Date", "")),
                    "Start Date (Normalized)": "",
                    "End Date (Original)": str(row.get("End Date", "")),
                    "End Date (Normalized)": "",
                    "Error(s)": clean_error_message(e),
                    "Warnings": "",
                })

    # ── Build & upload Excel report (Fix 4) ──────────────────────────────────
    report_url = None
    try:
        report_buf = build_upload_report(success_records_list, failed_records_list)
        
        latest_blob_path = "bulk-upload-reports/bulk_upload_report_latest.xlsx"
        previous_blob_path = "bulk-upload-reports/bulk_upload_report_previous.xlsx"
        
        _, bucket = _get_gcs_bucket()
        latest_blob = bucket.blob(latest_blob_path)
        
        # Copy 'latest' to 'previous' to keep the last version
        if latest_blob.exists():
            bucket.copy_blob(latest_blob, bucket, previous_blob_path)
            
        # Upload new report to 'latest'
        latest_blob.upload_from_file(report_buf, content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        try:
            # Generate a signed URL valid for 7 days so it can be downloaded directly
            # Include a timestamped filename in the response disposition
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            download_name = f"training_bulk_upload_report_{timestamp}.xlsx"
            expiration = timedelta(days=7)
            report_url = latest_blob.generate_signed_url(
                version="v4", 
                expiration=expiration, 
                method="GET",
                response_disposition=f"attachment; filename={download_name}"
            )
        except Exception as sign_err:
            logger.warning(f"Failed to generate signed URL (expected in local dev with ADC): {sign_err}")
            # Fallback to backend-proxied URL for local development/non-signed environments
            # Using relative path so it works across various port mappings (Vite proxy)
            report_url = f"/add_training_v2?download_report=latest&admin_id={admin_id}"
        
        logger.info(f"Upload report saved to {report_url}")
    except Exception as report_err:
        logger.warning(f"Failed to upload Excel report (non-critical): {report_err}")

    # Full re-export to GCS CSV after all DB writes
    sync_csv_full_reexport(engine, schema)

    if (created_count > 0 or updated_count > 0) and publish_event and SystemEventType:
        try:
            with engine.connect() as conn:
                publish_event(conn, SystemEventType.EMPLOYEE_TRAINING_UPDATED.value, {
                    "action": "BULK_UPLOAD",
                    "data": {"created_count": created_count, "updated_count": updated_count}
                })
                if created_count > 0:
                    publish_event(conn, SystemEventType.TRAINING_MAPPING_CREATED.value, {
                        "action": "BULK_CREATE", "data": {"created_count": created_count}
                    })
                if updated_count > 0:
                     publish_event(conn, SystemEventType.TRAINING_MAPPING_UPDATED.value, {
                        "action": "BULK_UPDATE", "data": {"updated_count": updated_count}
                    })
        except Exception as e:
            logger.error(f"Webhook dispatch failed: {e}")

    status_code = 201 if created_count > 0 else 200
    logger.info(f"Bulk upload: {created_count} created, {skipped_count} already_exists, {error_count} errors")

    response_data = {
        "message": "Bulk upload completed",
        "summary": {
            "total_rows": len(df),
            "created": created_count,
            "updated": updated_count,
            "already_exists": skipped_count,
            "errors": error_count
        },
        "results": row_results,
    }

    if report_url:
        response_data["report_url"] = report_url

    if ignored_columns:
        response_data["warnings"] = [f"Ignored unknown columns: {', '.join(ignored_columns)}"]

    return _cors_response(response_data, status_code)


# ============================================================================
# MAIN ENTRY POINT
# ============================================================================

def add_training_v2(request):
    """
    Main Cloud Function entry point to manage employee training records.

    Suggestion endpoints (GET only):
      GET /?suggest=employees&q=<search>  → Search employees (by id, name, email)
      GET /?suggest=competency            → Distinct competency values
      GET /?suggest=training_hierarchy    → Training hierarchies with names
      GET /?suggest=employee_type         → Enum values
      GET /?suggest=training_status       → Enum values

    CRUD endpoints:
      GET    /?id=<int>              → Single training record with joined data
      GET    /?employee_id=<int>     → All trainings for an employee
      GET    /                       → All training records
      POST   /  {body}               → Create new training (single or batch via trainings:[])
      POST   /bulk-upload            → Bulk import training hierarchies from CSV/Excel
      PUT    /  {body}               → Update existing training (admin_id)
      DELETE /?id=<int>&admin_id=    → Delete a training record (admin_id)

    Training Batch endpoints:
      GET    /training_batch?id=<int>  → Single training batch record
      GET    /training_batch/          → All training batches
      POST   /training_batch  {batch_data}
      PUT    /training_batch  {batch_data}
      DELETE /training_batch?batch_id=<int>&admin_id=<int>

    Returns:
        200: Success (GET, PUT, DELETE)
        201: Created (POST)
        400: Missing required fields or invalid data
        403: Access denied (admin_id role is not dept/admin/hr)
        404: Record or reference not found
        405: Method not allowed
        500: Server error
    """
    logger.info("========== NEW REQUEST ==========")
    logger.info(f"Received {request.method} request")
    logger.info(f"Request path: {request.path}")
    logger.info(f"Content-Type: {request.headers.get('Content-Type', 'Not set')}")

    # Handle CORS preflight
    if request.method == "OPTIONS":
        response = make_response("", 204)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response.headers["Access-Control-Max-Age"] = "3600"
        return response

    if request.method not in ["GET", "POST", "PUT", "DELETE"]:
        logger.warning(f"Unsupported HTTP method: {request.method}")
        return _cors_response({"error": f"Method {request.method} not allowed"}, 405)

    try:
        # Check for Training batch Urls 
        
        path = request.path.rstrip("/").lower()
        # Route to appropriate handler
        if "/training_batch" in path:
            # NEW: training_batch routes
            if request.method == "GET":
                return handle_get_training_batch(request)
            elif request.method == "POST":
                return handle_post_training_batch(request)
            elif request.method == "PUT":
                return handle_put_training_batch(request)
            elif request.method == "DELETE":
                return handle_delete_training_batch(request)
            else:
                return _cors_response({"error": f"Method {request.method} not allowed for training_batch"}, 405)
        
        # EXISTING: training routes
        else:        
            # Check for suggestion requests first (GET only)
            if request.method == "GET":
                suggestion_response = handle_suggestions(request)
                if suggestion_response is not None:
                    return suggestion_response

            # FIX: use endswith to handle Gen2 base path and trailing slash variants
            if request.method == "POST" and request.path.rstrip("/").endswith("/bulk-upload"):
                return handle_bulk_upload(request)
            elif request.method == "GET" and "download_report" in request.args:
                return handle_report_download(request)
            elif request.method == "GET":
                return handle_get(request)
            elif request.method == "POST":
                return handle_post(request)
            elif request.method == "PUT":
                return handle_put(request)
            elif request.method == "DELETE":
                return handle_delete(request)

    except ValueError as e:
        error_msg = str(e)
        logger.error(f"Validation error: {error_msg}")
        # Return 403 for access denied errors, 400 for other validation errors
        if "Access denied" in error_msg:
            return _cors_response({"error": error_msg}, 403)
        return _cors_response({"error": error_msg}, 400)

    except SQLAlchemyError as db_err:
        logger.exception("Database error in add_training_v2")
        error_msg = str(db_err)
        if "violates foreign key constraint" in error_msg or "IntegrityError" in error_msg:
            return _cors_response({
                "error": "Operation failed due to a foreign key constraint violation",
                "details": error_msg,
            }, 409)
        if "violates check constraint" in error_msg:
            return _cors_response({
                "error": "Validation failed: end_date must be >= start_date",
                "details": error_msg,
            }, 400)
        return _cors_response({"error": "Database error", "details": error_msg}, 500)

    except ConflictError as e:
        logger.warning(f"Conflict error in add_training_v2: {e}")
        payload = {"error": str(e)}
        count = getattr(e, "employee_training_count", None)
        if count is not None:
            payload["employee_training_count"] = count
        return _cors_response(payload, 409)

    except Exception as e:
        logger.exception("Unexpected error in add_training_v2")
        return _cors_response({"error": str(e)}, 500)



"""
===========================================
LOCAL TESTING
===========================================

functions-framework --target=add_training_v2 --debug


===========================================
DEPLOYMENT COMMANDS
===========================================

Development Deployment:
-----------------------
gcloud functions deploy dev_addTraining_v2 \
  --runtime python311 \
  --trigger-http \
  --entry-point add_training_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --allow-unauthenticated \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=development


Production Deployment:
----------------------
gcloud functions deploy addTraining_v2 \
  --runtime python311 \
  --trigger-http \
  --entry-point add_training_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --allow-unauthenticated \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=production

"""
