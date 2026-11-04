"""
Google Cloud Function to manage skill hierarchy entries (V2 Schema).
Handles GET, POST, PUT, DELETE and bulk-upload operations.
Uses a get-or-create pattern for each master table component.

CSV Sync Strategy (GCS bucket INFOLDER/Master_Skills.csv):
- POST  → appends the new skill row to the existing CSV
- PUT   → finds the row by skill_hierarchy_id column and updates it in-place
- DELETE → finds and removes the row by skill_hierarchy_id from the CSV
- Bulk upload → performs a full DB re-export to rebuild the CSV from scratch
- Columns: skill_hierarchy_id, Category, Sub-Category, Sub-Sub-Category, Tools, L1, L2, L3
- The CSV is the downloadable master reference; always kept in sync after every write operation.
"""
import logging
import os
import io
from datetime import datetime
from pathlib import Path
from urllib.parse import quote_plus

import pandas as pd
from flask import jsonify, make_response
from google.cloud import storage
from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool
from sqlalchemy.exc import SQLAlchemyError
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


def get_or_create_domain(name, description, connection, schema, update_existing=True, is_mandatory=None):
    """
    Get existing domain by name or create a new one.
    If it exists and update_existing is True, update mutable fields.
    Returns the domain id.
    """
    # Try to find existing (case-insensitive)
    select_query = text(
        f'SELECT id FROM "{schema}".master_domain WHERE LOWER(domain_name) = LOWER(:name)'
    )
    result = connection.execute(select_query, {"name": name.strip()}).fetchone()

    if result:
        existing_id = result[0]
        if update_existing:
            updates = []
            params = {"id": existing_id}
            if description is not None:
                updates.append("description = :description")
                params["description"] = description
            if is_mandatory is not None:
                updates.append("is_mandatory = :is_mandatory")
                params["is_mandatory"] = is_mandatory
            if updates:
                set_clause = ", ".join(updates)
                update_sql = f'UPDATE "{schema}".master_domain SET {set_clause} WHERE id = :id'
                connection.execute(text(update_sql), params)
                logger.info(f"Updated existing domain: {name} (id={existing_id})")
            else:
                logger.info(f"Found existing domain: {name} (id={existing_id})")
        else:
            logger.info(f"Found existing domain: {name} (id={existing_id})")
        return existing_id, False

    # Insert new
    insert_query = text(f'''
        INSERT INTO "{schema}".master_domain (domain_name, description, is_mandatory)
        VALUES (:name, :description, :is_mandatory)
        RETURNING id
    ''')
    result = connection.execute(
        insert_query, {"name": name.strip(), "description": description, "is_mandatory": is_mandatory if is_mandatory is not None else False}
    ).fetchone()

    logger.info(f"Created new domain: {name} (id={result[0]})")
    return result[0], True


def get_or_create_discipline(name, description, connection, schema, update_existing=True, is_mandatory=None):
    """
    Get existing discipline by name or create a new one.
    If it exists and update_existing is True, update mutable fields.
    Returns the discipline id.
    """
    select_query = text(
        f'SELECT id FROM "{schema}".master_discipline WHERE LOWER(discipline_name) = LOWER(:name)'
    )
    result = connection.execute(select_query, {"name": name.strip()}).fetchone()

    if result:
        existing_id = result[0]
        if update_existing:
            updates = []
            params = {"id": existing_id}
            if description is not None:
                updates.append("description = :description")
                params["description"] = description
            if is_mandatory is not None:
                updates.append("is_mandatory = :is_mandatory")
                params["is_mandatory"] = is_mandatory
            if updates:
                set_clause = ", ".join(updates)
                update_sql = f'UPDATE "{schema}".master_discipline SET {set_clause} WHERE id = :id'
                connection.execute(text(update_sql), params)
                logger.info(f"Updated existing discipline: {name} (id={existing_id})")
            else:
                logger.info(f"Found existing discipline: {name} (id={existing_id})")
        else:
            logger.info(f"Found existing discipline: {name} (id={existing_id})")
        return existing_id, False

    insert_query = text(f'''
        INSERT INTO "{schema}".master_discipline (discipline_name, description, is_mandatory)
        VALUES (:name, :description, :is_mandatory)
        RETURNING id
    ''')
    result = connection.execute(
        insert_query, {"name": name.strip(), "description": description, "is_mandatory": is_mandatory if is_mandatory is not None else False}
    ).fetchone()

    logger.info(f"Created new discipline: {name} (id={result[0]})")
    return result[0], True


def get_or_create_skill_area(name, description, connection, schema, update_existing=True, is_mandatory=None):
    """
    Get existing skill area by name or create a new one.
    If it exists and update_existing is True, update mutable fields.
    Returns the skill_area id.
    """
    select_query = text(
        f'SELECT id FROM "{schema}".master_skill_area WHERE LOWER(skill_area) = LOWER(:name)'
    )
    result = connection.execute(select_query, {"name": name.strip()}).fetchone()

    if result:
        existing_id = result[0]
        if update_existing:
            updates = []
            params = {"id": existing_id}
            if description is not None:
                updates.append("description = :description")
                params["description"] = description
            if is_mandatory is not None:
                updates.append("is_mandatory = :is_mandatory")
                params["is_mandatory"] = is_mandatory
            if updates:
                set_clause = ", ".join(updates)
                update_sql = f'UPDATE "{schema}".master_skill_area SET {set_clause} WHERE id = :id'
                connection.execute(text(update_sql), params)
                logger.info(f"Updated existing skill area: {name} (id={existing_id})")
            else:
                logger.info(f"Found existing skill area: {name} (id={existing_id})")
        else:
            logger.info(f"Found existing skill area: {name} (id={existing_id})")
        return existing_id, False

    insert_query = text(f'''
        INSERT INTO "{schema}".master_skill_area (skill_area, description, is_mandatory)
        VALUES (:name, :description, :is_mandatory)
        RETURNING id
    ''')
    result = connection.execute(
        insert_query, {"name": name.strip(), "description": description, "is_mandatory": is_mandatory if is_mandatory is not None else False}
    ).fetchone()

    logger.info(f"Created new skill area: {name} (id={result[0]})")
    return result[0], True


def get_or_create_framework(name, description, basic, intermediate, expert, connection, schema, update_existing=True, is_mandatory=None):
    """
    Get existing framework by name or create a new one.
    If it exists and update_existing is True, update mutable fields.
    Returns the framework id.
    """
    select_query = text(
        f'SELECT id FROM "{schema}".master_framework WHERE LOWER(framework_name) = LOWER(:name)'
    )
    result = connection.execute(select_query, {"name": name.strip()}).fetchone()

    if result:
        existing_id = result[0]
        # Build dynamic UPDATE for provided fields only
        updates = []
        params = {"id": existing_id}
        if description is not None:
            updates.append("description = :description")
            params["description"] = description
        if basic is not None:
            updates.append("basic = :basic")
            params["basic"] = basic
        if intermediate is not None:
            updates.append("intermediate = :intermediate")
            params["intermediate"] = intermediate
        if expert is not None:
            updates.append("expert = :expert")
            params["expert"] = expert
        if is_mandatory is not None:
            updates.append("is_mandatory = :is_mandatory")
            params["is_mandatory"] = is_mandatory

        if update_existing and updates:
            set_clause = ", ".join(updates)
            update_sql = f'UPDATE "{schema}".master_framework SET {set_clause} WHERE id = :id'
            connection.execute(text(update_sql), params)
            logger.info(f"Updated existing framework: {name} (id={existing_id}, fields: {list(params.keys())}")
        else:
            logger.info(f"Found existing framework: {name} (id={existing_id})")
        return existing_id, False

    insert_query = text(f'''
        INSERT INTO "{schema}".master_framework (framework_name, description, basic, intermediate, expert, is_mandatory)
        VALUES (:name, :description, :basic, :intermediate, :expert, :is_mandatory)
        RETURNING id
    ''')
    result = connection.execute(
        insert_query, {
            "name": name.strip(),
            "description": description,
            "basic": basic,
            "intermediate": intermediate,
            "expert": expert,
            "is_mandatory": is_mandatory if is_mandatory is not None else False,
        }
    ).fetchone()

    logger.info(f"Created new framework: {name} (id={result[0]})")
    return result[0], True


def fetch_skill_hierarchies(connection, schema, skill_hierarchy_id=None):
    """
    Fetch skill hierarchy links with joined master table data.
    If skill_hierarchy_id is provided, returns a single entry; otherwise returns all.
    """
    base_query = f'''
        SELECT
            shl.id AS skillhierarchy_id,
            shl.domain_id,
            md.domain_name,
            md.description AS domain_description,
            shl.discipline_id,
            mdisc.discipline_name,
            mdisc.description AS discipline_description,
            shl.skill_area_id,
            msa.skill_area,
            msa.description AS skill_area_description,
            shl.framework_id,
            mf.framework_name,
            mf.description AS framework_description,
            mf.basic AS L1,
            mf.intermediate AS L2,
            mf.expert AS L3,
            shl.created_at,
            shl.updated_at
        FROM "{schema}".skill_hierarchy_links shl
        LEFT JOIN "{schema}".master_domain md ON md.id = shl.domain_id
        LEFT JOIN "{schema}".master_discipline mdisc ON mdisc.id = shl.discipline_id
        LEFT JOIN "{schema}".master_skill_area msa ON msa.id = shl.skill_area_id
        LEFT JOIN "{schema}".master_framework mf ON mf.id = shl.framework_id
    '''

    if skill_hierarchy_id is not None:
        query = text(base_query + ' WHERE shl.id = :id')
        rows = connection.execute(query, {"id": skill_hierarchy_id}).fetchall()
    else:
        query = text(
            base_query + ' ORDER BY md.domain_name, mdisc.discipline_name, msa.skill_area, mf.framework_name'
        )
        rows = connection.execute(query).fetchall()

    results = []
    for row in rows:
        entry = dict(row._mapping)
        # Convert datetime objects to ISO strings
        for key, value in entry.items():
            if hasattr(value, 'isoformat'):
                entry[key] = value.isoformat()
        results.append(entry)

    return results


# ---------------------------------------------------------------------------
# CSV columns order used in the bucket file
# ---------------------------------------------------------------------------
_CSV_COLUMNS = ["skill_hierarchy_id", "Discipline", "Domain", "Skill Area", "Framework", "L1", "L2", "L3"]
_CSV_BLOB_PATH = "master-skill-mapping/Master_Skills.csv"
_BACKUP_PREFIX = "master-skill-mapping/Master_Skills_"


def _get_gcs_bucket():
    """Return (client, bucket) or raise if BUCKET_NAME is not set."""
    bucket_name = os.getenv("BUCKET_NAME")
    if not bucket_name:
        raise EnvironmentError("BUCKET_NAME env var is not set — CSV sync skipped")
    project = os.getenv("GCP_PROJECT") or os.getenv("GOOGLE_CLOUD_PROJECT")
    client = storage.Client(project=project)
    return client, client.bucket(bucket_name)


def _read_csv_from_gcs(bucket):
    """
    Download INFOLDER/Master_Skills.csv from GCS and return a DataFrame.
    If the file does not exist yet, return an empty DataFrame with the correct columns.
    """
    blob = bucket.blob(_CSV_BLOB_PATH)
    if not blob.exists():
        logger.info("Master_Skills.csv not found in bucket — starting fresh")
        return pd.DataFrame(columns=_CSV_COLUMNS)
    csv_bytes = blob.download_as_text()
    df = pd.read_csv(io.StringIO(csv_bytes))
    # Ensure skill_hierarchy_id column exists (backward-compat with old CSVs lacking it)
    if "skill_hierarchy_id" not in df.columns:
        df.insert(0, "skill_hierarchy_id", None)
    return df


def _write_csv_to_gcs(bucket, df):
    """Upload the DataFrame as CSV to INFOLDER/Master_Skills.csv with a rolling backup."""
    # Backup current file first
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
    logger.info(f"Uploaded Master_Skills.csv to GCS ({len(df)} rows)")


def sync_csv_append_row(row_data: dict, engine=None, schema=None):
    """
    Append a single new skill row to the CSV in GCS (called after POST).

    - If the CSV does NOT exist yet in the bucket, triggers a full DB re-export
      so the CSV contains all existing skills + the new one.
    - If the CSV already exists, appends only the new row (incremental).

    Duplicate guard: if a row with the same skill_hierarchy_id already exists
    it is skipped (no duplicate is written).
    Returns True on success, False on failure.
    """
    try:
        skill_hierarchy_id = row_data.get("skill_hierarchy_id")

        _, bucket = _get_gcs_bucket()

        # If CSV doesn't exist yet, do a full re-export from DB instead of just appending
        blob = bucket.blob(_CSV_BLOB_PATH)
        if not blob.exists():
            if engine and schema:
                logger.info(
                    "Master_Skills.csv not found in bucket — triggering full DB re-export "
                    "so CSV contains all existing skills."
                )
                return sync_csv_full_reexport(engine, schema)
            else:
                logger.warning(
                    "Master_Skills.csv not found and no engine/schema passed — "
                    "creating CSV with only the new row."
                )

        df = _read_csv_from_gcs(bucket)

        # Duplicate guard — skip append if this id is already present in the CSV
        if skill_hierarchy_id is not None and not df.empty:
            already_exists = (df["skill_hierarchy_id"].astype(str) == str(skill_hierarchy_id)).any()
            if already_exists:
                logger.warning(
                    f"CSV: skill_hierarchy_id={skill_hierarchy_id} already exists in CSV — skipping append to prevent duplicate"
                )
                return True  # Not an error; CSV is already in sync

        new_row = {col: row_data.get(col) for col in _CSV_COLUMNS}
        df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)
        _write_csv_to_gcs(bucket, df)
        logger.info(f"CSV: appended row for skill_hierarchy_id={skill_hierarchy_id}")
        return True
    except EnvironmentError as env_err:
        logger.warning(str(env_err))
        return False
    except Exception as e:
        logger.warning(f"CSV append failed (non-critical): {e}")
        return False


def sync_csv_update_row(skill_hierarchy_id: int, row_data: dict):
    """
    Update the row matching skill_hierarchy_id in the CSV in GCS (called after PUT).
    Returns True on success, False on failure.
    """
    try:
        _, bucket = _get_gcs_bucket()
        df = _read_csv_from_gcs(bucket)

        mask = df["skill_hierarchy_id"].astype(str) == str(skill_hierarchy_id)
        if mask.any():
            for col, val in row_data.items():
                if col in df.columns:
                    df.loc[mask, col] = val
            logger.info(f"CSV: updated row for skill_hierarchy_id={skill_hierarchy_id}")
        else:
            # Row not found — append it so the CSV stays complete
            new_row = {"skill_hierarchy_id": skill_hierarchy_id}
            new_row.update({col: row_data.get(col) for col in _CSV_COLUMNS if col != "skill_hierarchy_id"})
            df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)
            logger.info(f"CSV: row not found, appended for skill_hierarchy_id={skill_hierarchy_id}")

        _write_csv_to_gcs(bucket, df)
        return True
    except EnvironmentError as env_err:
        logger.warning(str(env_err))
        return False
    except Exception as e:
        logger.warning(f"CSV update failed (non-critical): {e}")
        return False


def sync_csv_delete_row(skill_hierarchy_id: int):
    """
    Remove the row matching skill_hierarchy_id from the CSV in GCS (called after DELETE).
    Returns True on success, False on failure.
    """
    try:
        _, bucket = _get_gcs_bucket()
        df = _read_csv_from_gcs(bucket)

        before = len(df)
        df = df[df["skill_hierarchy_id"].astype(str) != str(skill_hierarchy_id)]
        after = len(df)
        logger.info(f"CSV: removed {before - after} row(s) for skill_hierarchy_id={skill_hierarchy_id}")

        _write_csv_to_gcs(bucket, df)
        return True
    except EnvironmentError as env_err:
        logger.warning(str(env_err))
        return False
    except Exception as e:
        logger.warning(f"CSV delete failed (non-critical): {e}")
        return False


def export_skills_csv_to_gcs(engine, schema):
    """
    Full re-export of ALL skill_hierarchy_links from the DB to GCS CSV.
    Used by bulk-upload and as a recovery fallback.
    """
    bucket_name = os.getenv("BUCKET_NAME")
    if not bucket_name:
        logger.warning("BUCKET_NAME not set, skipping CSV sync")
        return

    export_query = text(f'''
        SELECT
            shl.id AS "skill_hierarchy_id",
            mdisc.discipline_name AS "Discipline",
            md.domain_name AS "Domain",
            msa.skill_area AS "Skill Area",
            mf.framework_name AS "Framework",
            mf.basic AS "L1",
            mf.intermediate AS "L2",
            mf.expert AS "L3"
        FROM "{schema}".skill_hierarchy_links shl
        LEFT JOIN "{schema}".master_domain md ON md.id = shl.domain_id
        LEFT JOIN "{schema}".master_discipline mdisc ON mdisc.id = shl.discipline_id
        LEFT JOIN "{schema}".master_skill_area msa ON msa.id = shl.skill_area_id
        LEFT JOIN "{schema}".master_framework mf ON mf.id = shl.framework_id
        ORDER BY mdisc.discipline_name, md.domain_name, msa.skill_area, mf.framework_name
    ''')

    with engine.connect() as connection:
        result = connection.execute(export_query)
        rows = result.fetchall()
        columns = list(result.keys())

    df = pd.DataFrame(rows, columns=columns)

    project = os.getenv("GCP_PROJECT") or os.getenv("GOOGLE_CLOUD_PROJECT")
    client = storage.Client(project=project)
    bucket = client.bucket(bucket_name)
    _write_csv_to_gcs(bucket, df)
    logger.info(f"Full re-export: {len(df)} rows written to gs://{bucket_name}/{_CSV_BLOB_PATH}")


def sync_csv_full_reexport(engine, schema):
    """
    Safely trigger a full DB re-export to GCS CSV.
    Returns True on success, False on failure.
    """
    try:
        export_skills_csv_to_gcs(engine, schema)
        return True
    except Exception as e:
        logger.warning(f"CSV full re-export failed (non-critical): {e}")
        return False


def handle_bulk_upload(request):
    """
    Handle POST /bulk-upload to import skill hierarchies from a CSV file.
    Accepts multipart/form-data with:
        - file: CSV file (required) with columns [Discipline, Domain, Skill Area, Framework, L1, L2, L3]
        - employee_id: int (required) - must have dept/admin role

    Uses the same get-or-create pattern as handle_post for each row.
    After processing, syncs the DB state to GCS bucket CSV.
    """
    # Get employee_id from form data
    employee_id = request.form.get("employee_id")
    if employee_id is None or str(employee_id).strip() == "":
        return _cors_response({"error": "Missing required field: employee_id"}, 400)

    try:
        employee_id = int(employee_id)
    except (ValueError, TypeError):
        return _cors_response({"error": "employee_id must be an integer"}, 400)

    # Get uploaded file
    if "file" not in request.files:
        return _cors_response({"error": "No file uploaded. Send a CSV file with key 'file'"}, 400)

    uploaded_file = request.files["file"]
    if not uploaded_file.filename:
        return _cors_response({"error": "Empty filename"}, 400)

    if not uploaded_file.filename.lower().endswith((".csv", ".xlsx", ".xls")):
        return _cors_response({"error": "Only CSV and Excel files are supported"}, 400)

    # Read file into DataFrame
    try:
        if uploaded_file.filename.lower().endswith(".csv"):
            df = pd.read_csv(uploaded_file)
        else:
            df = pd.read_excel(uploaded_file)
    except Exception as e:
        return _cors_response({"error": f"Failed to read file: {str(e)}"}, 400)

    if df.empty:
        return _cors_response({"error": "Uploaded file is empty"}, 400)
    # Rename new standard headers to internal field names
    header_map = {
        "Discipline": "discipline_name",
        "Domain": "domain_name",
        "Skill Area": "skill_area",
        "Framework": "framework_name",
    }
    df.rename(columns=header_map, inplace=True)

    # Validate required columns
    required_columns = ["discipline_name", "domain_name", "skill_area", "framework_name"]
    missing_columns = [col for col in required_columns if col not in df.columns]
    if missing_columns:
        return _cors_response({
            "error": f"Missing required columns: {', '.join(missing_columns)}",
            "expected_columns": ["Discipline", "Domain", "Skill Area", "Framework", "L1", "L2", "L3"],
        }, 400)

    # Clean and validate rows
    for col in required_columns:
        df[col] = df[col].fillna("").astype(str).str.strip()

    # Optional columns
    for col in ["L1", "L2", "L3"]:
        if col not in df.columns:
            df[col] = None
        else:
            df[col] = df[col].where(df[col].notna(), None)

    # Identify faulty rows (missing required fields)
    missing_mask = (df[required_columns] == "").any(axis=1)
    duplicate_mask = df.duplicated(subset=required_columns, keep="first")
    faulty_mask = missing_mask | duplicate_mask

    faulty_rows = df[faulty_mask]
    valid_rows = df[~faulty_mask]

    if valid_rows.empty:
        faulty_list = faulty_rows.to_dict(orient="records")
        return _cors_response({
            "error": "No valid rows found in the CSV",
            "faulty_rows_count": len(faulty_list),
            "faulty_rows": faulty_list[:20],  # Limit to 20 for response size
        }, 400)

    engine = get_db_engine()
    schema = os.getenv("DB_SCHEMA")
    logger.info(f"Bulk upload: {len(valid_rows)} valid rows, {len(faulty_rows)} faulty rows")

    created_count = 0
    skipped_count = 0
    row_results = []

    with engine.begin() as connection:
        # Authorize
        check_role_authorization(employee_id, connection, schema)

        for row_num, (idx, row) in enumerate(valid_rows.iterrows(), start=1):
            try:
                # Get or create each master table entry (update_existing=False to avoid overwrites)
                domain_id, _ = get_or_create_domain(
                    row["domain_name"], None, connection, schema, update_existing=False
                )
                discipline_id, _ = get_or_create_discipline(
                    row["discipline_name"], None, connection, schema, update_existing=False
                )
                skill_area_id, _ = get_or_create_skill_area(
                    row["skill_area"], None, connection, schema, update_existing=False
                )

                # Handle L1/L2/L3 — convert NaN to None
                basic = row.get("L1") if pd.notna(row.get("L1")) else None
                intermediate = row.get("L2") if pd.notna(row.get("L2")) else None
                expert = row.get("L3") if pd.notna(row.get("L3")) else None

                framework_id, _ = get_or_create_framework(
                    row["framework_name"], None, basic, intermediate, expert,
                    connection, schema, update_existing=False
                )

                link_id, was_created = create_skill_hierarchy_link(
                    domain_id, discipline_id, skill_area_id, framework_id,
                    connection, schema
                )

                if was_created:
                    created_count += 1
                    row_results.append({"row": row_num, "status": "created", "skill_hierarchy_id": link_id})
                else:
                    skipped_count += 1
                    row_results.append({"row": row_num, "status": "already_exists", "skill_hierarchy_id": link_id})

            except Exception as e:
                row_results.append({"row": row_num, "status": "error", "error": str(e)})
                logger.warning(f"Error processing row {row_num}: {e}")

    # Full re-export to GCS CSV after bulk DB changes (rebuild from scratch)
    csv_synced = sync_csv_full_reexport(engine, schema)

    if created_count > 0 and publish_event and SystemEventType:
        try:
            with engine.connect() as conn:
                publish_event(conn, SystemEventType.SKILL_MAPPING_CREATED.value, {
                    "action": "BULK_CREATE",
                    "data": {"created_count": created_count}
                })
        except Exception as e:
            logger.error(f"Webhook dispatch failed: {e}")

    response_data = {
        "message": "Bulk upload completed",
        "total_rows": len(df),
        "valid_rows": len(valid_rows),
        "created": created_count,
        "skipped_existing": skipped_count,
        "faulty_rows_count": len(faulty_rows),
        "csv_synced": csv_synced,
    }

    # Include faulty row details if any
    if not faulty_rows.empty:
        response_data["faulty_rows"] = faulty_rows.head(20).to_dict(orient="records")

    # Include per-row results if not too many
    if len(row_results) <= 50:
        response_data["row_details"] = row_results

    logger.info(f"Bulk upload result: {created_count} created, {skipped_count} skipped")
    return _cors_response(response_data, 201 if created_count > 0 else 200)


def create_skill_hierarchy_link(domain_id, discipline_id, skill_area_id, framework_id, connection, schema):
    """
    Create a skill hierarchy link or return the existing one if the combination already exists.
    Returns (link_id, was_created).
    """
    # Check if exact combination already exists
    select_query = text(f'''
        SELECT id FROM "{schema}".skill_hierarchy_links
        WHERE domain_id = :domain_id
          AND discipline_id = :discipline_id
          AND skill_area_id = :skill_area_id
          AND framework_id = :framework_id
    ''')
    result = connection.execute(select_query, {
        "domain_id": domain_id,
        "discipline_id": discipline_id,
        "skill_area_id": skill_area_id,
        "framework_id": framework_id,
    }).fetchone()

    if result:
        logger.info(f"Skill hierarchy link already exists (id={result[0]})")
        return result[0], False

    # Insert new link
    insert_query = text(f'''
        INSERT INTO "{schema}".skill_hierarchy_links (domain_id, discipline_id, skill_area_id, framework_id)
        VALUES (:domain_id, :discipline_id, :skill_area_id, :framework_id)
        RETURNING id
    ''')
    result = connection.execute(insert_query, {
        "domain_id": domain_id,
        "discipline_id": discipline_id,
        "skill_area_id": skill_area_id,
        "framework_id": framework_id,
    }).fetchone()

    logger.info(f"Created new skill hierarchy link (id={result[0]})")
    return result[0], True


def check_role_authorization(employee_id, connection, schema):
    """
    Check if the employee has an authorized role (dept/admin) to manage skill hierarchies.
    Returns the employee role if authorized.
    Raises ValueError if not found or not authorized.
    """
    query = text(f'SELECT id, role FROM "{schema}".employee WHERE id = :employee_id')
    result = connection.execute(query, {"employee_id": employee_id}).fetchone()

    if not result:
        raise ValueError(f"Employee with id {employee_id} not found")

    role = result[1]  # role column
    if not role:
        raise ValueError(f"Employee {employee_id} has no role assigned")

    allowed_roles = ['dept', 'department', 'admin', 'hr']
    if role.lower() not in allowed_roles:
        raise ValueError(
            f"Access denied. Employee {employee_id} has role '{role}'. "
            f"Only dept/admin roles are allowed to manage skill hierarchies."
        )

    logger.info(f"Authorization passed: employee {employee_id} has role '{role}'")
    return role


def handle_get(request):
    """
    Handle GET requests to fetch skill hierarchy entries.

    GET /?id=<int>   → Returns a single skill hierarchy entry
    GET /            → Returns all skill hierarchy entries

    Response includes joined data from all master tables.
    """
    engine = get_db_engine()
    schema = os.getenv("DB_SCHEMA")
    logger.info(f"Using schema: {schema}")

    skill_hierarchy_id = request.args.get("id")

    if skill_hierarchy_id is not None:
        try:
            skill_hierarchy_id = int(skill_hierarchy_id)
        except (ValueError, TypeError):
            return _cors_response({"error": "Invalid id parameter, must be an integer"}, 400)

    with engine.connect() as connection:
        results = fetch_skill_hierarchies(connection, schema, skill_hierarchy_id)

    if skill_hierarchy_id is not None:
        if not results:
            return _cors_response({"error": f"Skill hierarchy with id {skill_hierarchy_id} not found"}, 404)
        logger.info(f"Returning single skill hierarchy (id={skill_hierarchy_id})")
        return _cors_response(results[0], 200)

    logger.info(f"Returning {len(results)} skill hierarchy entries")
    return _cors_response({"count": len(results), "results": results}, 200)


def handle_post(request):
    """
    Handle POST requests to add one or more skill hierarchy entries.
    Uses get-or-create pattern for each master table component.
    Requires employee_id with role 'dept' or 'admin' for authorization.

    Single skill (original — unchanged):
    Body: {
        "employee_id": <int>,                  # Required
        "domain_name": <string>,               # Required
        "discipline_name": <string>,           # Required
        "skill_area": <string>,                # Required
        "framework_name": <string>,            # Required
        "domain_description": <string>,        # Optional
        "discipline_description": <string>,    # Optional
        "skill_area_description": <string>,    # Optional
        "framework_description": <string>,     # Optional
        "basic": <string>,                     # Optional - L1
        "intermediate": <string>,              # Optional - L2
        "expert": <string>                     # Optional - L3
    }

    Multiple skills (new):
    Body: {
        "employee_id": <int>,                  # Required
        "skills": [                            # Required - array of skill objects
            { "domain_name": ..., "discipline_name": ..., "skill_area": ..., "framework_name": ..., ... },
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

    # ── NEW: Batch mode — if "skills" array is present, process each item ──
    if isinstance(data, dict) and "skills" in data:
        employee_id_raw = data.get("employee_id")
        if not employee_id_raw:
            return _cors_response({"error": "Missing required field: employee_id"}, 400)
        try:
            employee_id = int(employee_id_raw)
        except (ValueError, TypeError):
            return _cors_response({"error": "employee_id must be an integer"}, 400)

        skills_list = data.get("skills", [])
        if not skills_list:
            return _cors_response({"error": "skills array is empty"}, 400)

        engine = get_db_engine()
        schema = os.getenv("DB_SCHEMA")
        created_count, skipped_count, error_count = 0, 0, 0
        results = []

        with engine.begin() as connection:
            check_role_authorization(employee_id, connection, schema)  # authorize once

            for idx, skill in enumerate(skills_list, start=1):
                domain_name     = skill.get("domain_name")
                discipline_name = skill.get("discipline_name")
                skill_area      = skill.get("skill_area")
                framework_name  = skill.get("framework_name")

                missing = [f for f, v in [
                    ("domain_name", domain_name), ("discipline_name", discipline_name),
                    ("skill_area", skill_area), ("framework_name", framework_name)
                ] if not v]

                if missing:
                    results.append({"index": idx, "status": "error", "error": f"Missing: {', '.join(missing)}"})
                    error_count += 1
                    continue

                try:
                    domain_id, _ = get_or_create_domain(
                        domain_name, skill.get("domain_description"), connection, schema, update_existing=False)
                    discipline_id, _ = get_or_create_discipline(
                        discipline_name, skill.get("discipline_description"), connection, schema, update_existing=False)
                    skill_area_id, _ = get_or_create_skill_area(
                        skill_area, skill.get("skill_area_description"), connection, schema, update_existing=False)
                    framework_id, _ = get_or_create_framework(
                        framework_name, skill.get("framework_description"),
                        skill.get("basic"), skill.get("intermediate"), skill.get("expert"),
                        connection, schema, update_existing=False)
                    skill_hierarchy_id, link_created = create_skill_hierarchy_link(
                        domain_id, discipline_id, skill_area_id, framework_id, connection, schema)

                    if link_created:
                        created_count += 1
                        results.append({"index": idx, "status": "created", "skill_hierarchy_id": skill_hierarchy_id,
                                        "domain_id": domain_id, "discipline_id": discipline_id,
                                        "skill_area_id": skill_area_id, "framework_id": framework_id})
                    else:
                        skipped_count += 1
                        results.append({"index": idx, "status": "already_exists", "skill_hierarchy_id": skill_hierarchy_id})

                except Exception as e:
                    error_count += 1
                    results.append({"index": idx, "status": "error", "error": str(e)})
                    logger.warning(f"Error processing skill index {idx}: {e}")

        # Single CSV full re-export after all DB writes (same strategy as bulk-upload)
        csv_synced = sync_csv_full_reexport(engine, schema) if created_count > 0 else True

        if created_count > 0 and publish_event and SystemEventType:
            try:
                with engine.connect() as conn:
                    publish_event(conn, SystemEventType.SKILL_MAPPING_CREATED.value, {
                        "action": "BATCH_CREATE",
                        "data": {"created_count": created_count}
                    })
            except Exception as e:
                logger.error(f"Webhook dispatch failed: {e}")

        status_code = 201 if created_count > 0 else 200
        logger.info(f"Batch result: {created_count} created, {skipped_count} skipped, {error_count} errors")
        return _cors_response({
            "message": "Batch skill hierarchy processing completed",
            "summary": {"total": len(skills_list), "created": created_count,
                        "already_exists": skipped_count, "errors": error_count, "csv_synced": csv_synced},
            "results": results,
        }, status_code)


    # Extract required fields
    employee_id = data.get("employee_id")
    domain_name = data.get("domain_name")
    discipline_name = data.get("discipline_name")
    skill_area = data.get("skill_area")
    framework_name = data.get("framework_name")

    # Validate required fields
    missing_fields = []
    if not employee_id:
        missing_fields.append("employee_id")
    if not domain_name:
        missing_fields.append("domain_name")
    if not discipline_name:
        missing_fields.append("discipline_name")
    if not skill_area:
        missing_fields.append("skill_area")
    if not framework_name:
        missing_fields.append("framework_name")

    if missing_fields:
        return _cors_response(
            {"error": f"Missing required fields: {', '.join(missing_fields)}"}, 400
        )

    try:
        employee_id = int(employee_id)
    except (ValueError, TypeError):
        return _cors_response({"error": "employee_id must be an integer"}, 400)

    # Extract optional fields
    domain_description = data.get("domain_description")
    discipline_description = data.get("discipline_description")
    skill_area_description = data.get("skill_area_description")
    framework_description = data.get("framework_description")
    basic = data.get("basic")
    intermediate = data.get("intermediate")
    expert = data.get("expert")

    logger.info(
        f"Adding skill: domain={domain_name}, discipline={discipline_name}, "
        f"skill_area={skill_area}, framework={framework_name}"
    )

    engine = get_db_engine()
    schema = os.getenv("DB_SCHEMA")
    logger.info(f"Using schema: {schema}")

    with engine.begin() as connection:
        # Step 0: Authorize — only dept/admin roles allowed
        check_role_authorization(employee_id, connection, schema)

        # Step 1: Get or create each master table entry
        domain_id, domain_created = get_or_create_domain(
            domain_name, domain_description, connection, schema, update_existing=False
        )

        discipline_id, discipline_created = get_or_create_discipline(
            discipline_name, discipline_description, connection, schema, update_existing=False
        )

        skill_area_id, skill_area_created = get_or_create_skill_area(
            skill_area, skill_area_description, connection, schema, update_existing=False
        )

        framework_id, framework_created = get_or_create_framework(
            framework_name, framework_description, basic, intermediate, expert,
            connection, schema, update_existing=False
        )

        # Step 2: Create skill hierarchy link
        skill_hierarchy_id, link_created = create_skill_hierarchy_link(
            domain_id, discipline_id, skill_area_id, framework_id,
            connection, schema
        )

    if not link_created:
        return _cors_response({
            "error": "Skill hierarchy already exists",
            "skill_hierarchy_id": skill_hierarchy_id,
        }, 409)



    # Append the new row to the GCS CSV (incremental sync)
    csv_row = {
        "skill_hierarchy_id": skill_hierarchy_id,
        "Discipline": discipline_name,
        "Domain": domain_name,
        "Skill Area": skill_area,
        "Framework": framework_name,
        "L1": basic,
        "L2": intermediate,
        "L3": expert,
    }
    csv_synced = sync_csv_append_row(csv_row, engine=engine, schema=schema)

    if publish_event and SystemEventType:
        try:
            with engine.connect() as conn:
                publish_event(conn, SystemEventType.SKILL_MAPPING_CREATED.value, {
                    "action": "CREATE",
                    "data": {"skill_hierarchy_id": skill_hierarchy_id}
                })
        except Exception as e:
            logger.error(f"Webhook dispatch failed: {e}")

    result = {
        "message": "Skill hierarchy added successfully",
        "skill_hierarchy_id": skill_hierarchy_id,
        "domain_id": domain_id,
        "discipline_id": discipline_id,
        "skill_area_id": skill_area_id,
        "framework_id": framework_id,
        "created": True,
        "csv_synced": csv_synced,
    }

    logger.info(f"Result: {result}")
    return _cors_response(result, 201)


def handle_put(request):
    """
    Handle PUT requests to update an existing skill hierarchy entry.
    Uses the same get-or-create pattern for master tables.
    Only provided fields are updated.
    Requires employee_id with role 'dept' or 'admin' for authorization.

    Body: {
        "employee_id": <int>,                   # Required - must have dept/admin role
        "skill_hierarchy_id": <int>,            # Required
        "domain_name": <string>,                # Optional
        "discipline_name": <string>,            # Optional
        "skill_area": <string>,                 # Optional
        "framework_name": <string>,             # Optional
        "domain_description": <string>,         # Optional
        "discipline_description": <string>,     # Optional
        "skill_area_description": <string>,     # Optional
        "framework_description": <string>,      # Optional
        "basic": <string>,                      # Optional - L1 criteria
        "intermediate": <string>,               # Optional - L2 criteria
        "expert": <string>,                     # Optional - L3 criteria
        "domain_is_mandatory": <bool>,          # Optional
        "discipline_is_mandatory": <bool>,      # Optional
        "skill_area_is_mandatory": <bool>,      # Optional
        "framework_is_mandatory": <bool>        # Optional
    }
    """
    if not request.is_json:
        logger.warning("Request must be JSON")
        return _cors_response({"error": "Request must be JSON"}, 400)

    data = request.get_json(silent=True)

    if not data:
        logger.warning("Invalid JSON data")
        return _cors_response({"error": "Invalid JSON data"}, 400)

    employee_id = data.get("employee_id")
    skill_hierarchy_id = data.get("skill_hierarchy_id")

    if not employee_id:
        return _cors_response({"error": "Missing required field: employee_id"}, 400)
    if not skill_hierarchy_id:
        return _cors_response({"error": "Missing required field: skill_hierarchy_id"}, 400)

    try:
        employee_id = int(employee_id)
    except (ValueError, TypeError):
        return _cors_response({"error": "employee_id must be an integer"}, 400)

    try:
        skill_hierarchy_id = int(skill_hierarchy_id)
    except (ValueError, TypeError):
        return _cors_response({"error": "skill_hierarchy_id must be an integer"}, 400)

    engine = get_db_engine()
    schema = os.getenv("DB_SCHEMA")
    logger.info(f"Using schema: {schema}")

    with engine.begin() as connection:
        # Step 0: Authorize — only dept/admin roles allowed
        check_role_authorization(employee_id, connection, schema)

        # Step 1: Fetch the existing skill hierarchy link
        existing_query = text(f'''
            SELECT domain_id, discipline_id, skill_area_id, framework_id
            FROM "{schema}".skill_hierarchy_links
            WHERE id = :id
        ''')
        existing = connection.execute(existing_query, {"id": skill_hierarchy_id}).fetchone()

        if not existing:
            return _cors_response(
                {"error": f"Skill hierarchy with id {skill_hierarchy_id} not found"}, 404
            )

        current_domain_id = existing[0]
        current_discipline_id = existing[1]
        current_skill_area_id = existing[2]
        current_framework_id = existing[3]

        # Step 2: For each provided field, get-or-create new master entry
        domain_name = data.get("domain_name")
        discipline_name = data.get("discipline_name")
        skill_area_name = data.get("skill_area")
        framework_name = data.get("framework_name")

        # Save old IDs for orphan cleanup later
        old_domain_id = current_domain_id
        old_discipline_id = current_discipline_id
        old_skill_area_id = current_skill_area_id
        old_framework_id = current_framework_id

        if domain_name:
            current_domain_id, _ = get_or_create_domain(
                domain_name, data.get("domain_description"), connection, schema,
                is_mandatory=data.get("domain_is_mandatory"),
                update_existing=False
            )

        if discipline_name:
            current_discipline_id, _ = get_or_create_discipline(
                discipline_name, data.get("discipline_description"), connection, schema,
                is_mandatory=data.get("discipline_is_mandatory"),
                update_existing=False
            )

        if skill_area_name:
            current_skill_area_id, _ = get_or_create_skill_area(
                skill_area_name, data.get("skill_area_description"), connection, schema,
                is_mandatory=data.get("skill_area_is_mandatory"),
                update_existing=False
            )

        if framework_name:
            current_framework_id, _ = get_or_create_framework(
                framework_name,
                data.get("framework_description"),
                data.get("basic"),
                data.get("intermediate"),
                data.get("expert"),
                connection, schema,
                is_mandatory=data.get("framework_is_mandatory"),
                update_existing=False
            )

        # Step 3: Check if the new combination already exists (duplicate check)
        duplicate_query = text(f'''
            SELECT id FROM "{schema}".skill_hierarchy_links
            WHERE domain_id = :domain_id
              AND discipline_id = :discipline_id
              AND skill_area_id = :skill_area_id
              AND framework_id = :framework_id
              AND id != :current_id
        ''')
        duplicate = connection.execute(duplicate_query, {
            "domain_id": current_domain_id,
            "discipline_id": current_discipline_id,
            "skill_area_id": current_skill_area_id,
            "framework_id": current_framework_id,
            "current_id": skill_hierarchy_id,
        }).fetchone()

        if duplicate:
            return _cors_response({
                "error": "Cannot update: this combination of domain, discipline, skill area, and framework already exists",
                "existing_skill_hierarchy_id": duplicate[0],
            }, 409)

        # Step 4: Check if employees have rated skills on this hierarchy (warning)
        employee_skills_query = text(f'''
            SELECT COUNT(*) FROM "{schema}".employee_skills
            WHERE skill_hierarchy_id = :id
        ''')
        employee_skills_count = connection.execute(
            employee_skills_query, {"id": skill_hierarchy_id}
        ).fetchone()[0]

        # Step 5: Update the skill_hierarchy_links row
        update_query = text(f'''
            UPDATE "{schema}".skill_hierarchy_links
            SET domain_id = :domain_id,
                discipline_id = :discipline_id,
                skill_area_id = :skill_area_id,
                framework_id = :framework_id
            WHERE id = :id
        ''')
        connection.execute(update_query, {
            "domain_id": current_domain_id,
            "discipline_id": current_discipline_id,
            "skill_area_id": current_skill_area_id,
            "framework_id": current_framework_id,
            "id": skill_hierarchy_id,
        })

        # Step 6: Orphan cleanup — delete old master entries that are no longer referenced
        orphans_deleted = []

        if old_domain_id != current_domain_id:
            ref_check = text(f'SELECT 1 FROM "{schema}".skill_hierarchy_links WHERE domain_id = :id LIMIT 1')
            if not connection.execute(ref_check, {"id": old_domain_id}).fetchone():
                connection.execute(text(f'DELETE FROM "{schema}".master_domain WHERE id = :id'), {"id": old_domain_id})
                orphans_deleted.append(f"domain (id={old_domain_id})")
                logger.info(f"Deleted orphaned domain (id={old_domain_id})")

        if old_discipline_id != current_discipline_id:
            ref_check = text(f'SELECT 1 FROM "{schema}".skill_hierarchy_links WHERE discipline_id = :id LIMIT 1')
            if not connection.execute(ref_check, {"id": old_discipline_id}).fetchone():
                connection.execute(text(f'DELETE FROM "{schema}".master_discipline WHERE id = :id'), {"id": old_discipline_id})
                orphans_deleted.append(f"discipline (id={old_discipline_id})")
                logger.info(f"Deleted orphaned discipline (id={old_discipline_id})")

        if old_skill_area_id != current_skill_area_id:
            ref_check = text(f'SELECT 1 FROM "{schema}".skill_hierarchy_links WHERE skill_area_id = :id LIMIT 1')
            if not connection.execute(ref_check, {"id": old_skill_area_id}).fetchone():
                connection.execute(text(f'DELETE FROM "{schema}".master_skill_area WHERE id = :id'), {"id": old_skill_area_id})
                orphans_deleted.append(f"skill_area (id={old_skill_area_id})")
                logger.info(f"Deleted orphaned skill_area (id={old_skill_area_id})")

        if old_framework_id != current_framework_id:
            ref_check = text(f'SELECT 1 FROM "{schema}".skill_hierarchy_links WHERE framework_id = :id LIMIT 1')
            if not connection.execute(ref_check, {"id": old_framework_id}).fetchone():
                connection.execute(text(f'DELETE FROM "{schema}".master_framework WHERE id = :id'), {"id": old_framework_id})
                orphans_deleted.append(f"framework (id={old_framework_id})")
                logger.info(f"Deleted orphaned framework (id={old_framework_id})")

    logger.info(f"Updated skill hierarchy (id={skill_hierarchy_id})")

    # Fetch updated names to reflect in CSV (join needed to get current names)
    with engine.connect() as conn:
        updated_rows = fetch_skill_hierarchies(conn, schema, skill_hierarchy_id)

    if updated_rows:
        r = updated_rows[0]
        csv_row = {
            "Discipline": r.get("discipline_name"),
            "Domain": r.get("domain_name"),
            "Skill Area": r.get("skill_area"),
            "Framework": r.get("framework_name"),
            "L1": r.get("L1"),
            "L2": r.get("L2"),
            "L3": r.get("L3"),
        }
    else:
        csv_row = {}

    # Update the matching row in the GCS CSV (incremental sync)
    csv_synced = sync_csv_update_row(skill_hierarchy_id, csv_row)

    if publish_event and SystemEventType:
        try:
            with engine.connect() as conn:
                publish_event(conn, SystemEventType.SKILL_MAPPING_UPDATED.value, {
                    "action": "UPDATE",
                    "data": {"skill_hierarchy_id": skill_hierarchy_id}
                })
        except Exception as e:
            logger.error(f"Webhook dispatch failed: {e}")

    response_data = {
        "message": "Skill hierarchy updated successfully",
        "skill_hierarchy_id": skill_hierarchy_id,
        "domain_id": current_domain_id,
        "discipline_id": current_discipline_id,
        "skill_area_id": current_skill_area_id,
        "framework_id": current_framework_id,
        "csv_synced": csv_synced,
    }

    if orphans_deleted:
        response_data["orphaned_masters_deleted"] = orphans_deleted

    # Add warning if employees have already rated skills on this hierarchy
    if employee_skills_count > 0:
        response_data["warning"] = (
            f"This hierarchy has {employee_skills_count} employee skill rating(s). "
            f"Modifying it may affect existing employee assessments."
        )

    return _cors_response(response_data, 200)


def handle_delete(request):
    """
    Handle DELETE requests to remove a skill hierarchy entry.
    Requires employee_id with role 'dept' or 'admin' for authorization.

    DELETE /?id=<int>&employee_id=<int>  → Deletes the skill hierarchy link with the given id

    Behavior:
    1. If employee_skills reference this hierarchy (ON DELETE RESTRICT),
       the delete will be rejected with a 409 Conflict response.
    2. Deletes the skill_hierarchy_links row
    3. Cleans up orphaned master table entries (domain, discipline, skill_area, framework)
       that are no longer referenced by any other skill_hierarchy_links row
    """
    skill_hierarchy_id = request.args.get("id")
    employee_id = request.args.get("employee_id")

    if not skill_hierarchy_id:
        return _cors_response({"error": "Missing required query parameter: id"}, 400)
    if not employee_id:
        return _cors_response({"error": "Missing required query parameter: employee_id"}, 400)

    try:
        skill_hierarchy_id = int(skill_hierarchy_id)
    except (ValueError, TypeError):
        return _cors_response({"error": "Invalid id parameter, must be an integer"}, 400)

    try:
        employee_id = int(employee_id)
    except (ValueError, TypeError):
        return _cors_response({"error": "Invalid employee_id parameter, must be an integer"}, 400)

    engine = get_db_engine()
    schema = os.getenv("DB_SCHEMA")
    logger.info(f"Using schema: {schema}")

    with engine.begin() as connection:
        # Step 0: Authorize — only dept/admin roles allowed
        check_role_authorization(employee_id, connection, schema)

        # Step 1: Fetch the existing link and its master table IDs
        select_query = text(f'''
            SELECT domain_id, discipline_id, skill_area_id, framework_id
            FROM "{schema}".skill_hierarchy_links WHERE id = :id
        ''')
        existing = connection.execute(select_query, {"id": skill_hierarchy_id}).fetchone()

        if not existing:
            return _cors_response(
                {"error": f"Skill hierarchy with id {skill_hierarchy_id} not found"}, 404
            )

        old_domain_id = existing[0]
        old_discipline_id = existing[1]
        old_skill_area_id = existing[2]
        old_framework_id = existing[3]

        # Step 2: Delete the skill_hierarchy_links row
        # Will fail with IntegrityError if employee_skills reference it (ON DELETE RESTRICT)
        delete_link = text(f'''
            DELETE FROM "{schema}".skill_hierarchy_links WHERE id = :id
        ''')
        connection.execute(delete_link, {"id": skill_hierarchy_id})
        logger.info(f"Deleted skill_hierarchy_links (id={skill_hierarchy_id})")

        # Step 3: Orphan cleanup — delete master entries no longer referenced by any link
        orphans_deleted = []

        ref_check = text(f'SELECT 1 FROM "{schema}".skill_hierarchy_links WHERE domain_id = :id LIMIT 1')
        if not connection.execute(ref_check, {"id": old_domain_id}).fetchone():
            connection.execute(text(f'DELETE FROM "{schema}".master_domain WHERE id = :id'), {"id": old_domain_id})
            orphans_deleted.append(f"domain (id={old_domain_id})")
            logger.info(f"Deleted orphaned domain (id={old_domain_id})")

        ref_check = text(f'SELECT 1 FROM "{schema}".skill_hierarchy_links WHERE discipline_id = :id LIMIT 1')
        if not connection.execute(ref_check, {"id": old_discipline_id}).fetchone():
            connection.execute(text(f'DELETE FROM "{schema}".master_discipline WHERE id = :id'), {"id": old_discipline_id})
            orphans_deleted.append(f"discipline (id={old_discipline_id})")
            logger.info(f"Deleted orphaned discipline (id={old_discipline_id})")

        ref_check = text(f'SELECT 1 FROM "{schema}".skill_hierarchy_links WHERE skill_area_id = :id LIMIT 1')
        if not connection.execute(ref_check, {"id": old_skill_area_id}).fetchone():
            connection.execute(text(f'DELETE FROM "{schema}".master_skill_area WHERE id = :id'), {"id": old_skill_area_id})
            orphans_deleted.append(f"skill_area (id={old_skill_area_id})")
            logger.info(f"Deleted orphaned skill_area (id={old_skill_area_id})")

        ref_check = text(f'SELECT 1 FROM "{schema}".skill_hierarchy_links WHERE framework_id = :id LIMIT 1')
        if not connection.execute(ref_check, {"id": old_framework_id}).fetchone():
            connection.execute(text(f'DELETE FROM "{schema}".master_framework WHERE id = :id'), {"id": old_framework_id})
            orphans_deleted.append(f"framework (id={old_framework_id})")
            logger.info(f"Deleted orphaned framework (id={old_framework_id})")

    csv_synced = sync_csv_delete_row(skill_hierarchy_id)

    if publish_event and SystemEventType:
        try:
            with engine.connect() as conn:
                publish_event(conn, SystemEventType.SKILL_MAPPING_DELETED.value, {
                    "action": "DELETE",
                    "data": {"skill_hierarchy_id": skill_hierarchy_id}
                })
        except Exception as e:
            logger.error(f"Webhook dispatch failed: {e}")

    logger.info(f"Full delete completed for hierarchy {skill_hierarchy_id}")
    return _cors_response({
        "message": "Skill hierarchy deleted successfully",
        "skill_hierarchy_id": skill_hierarchy_id,
        "orphaned_masters_deleted": orphans_deleted,
        "csv_synced": csv_synced,
    }, 200)


def add_skill_v2(request):
    """
    Main Cloud Function entry point to manage skill hierarchy entries.

    GET    /?id=<int>                → Returns a single skill hierarchy entry with joined master data
    GET    /                         → Returns all skill hierarchy entries with joined master data
    POST   /  {employee_id, ...}     → Creates a new skill hierarchy (requires dept/admin role)
    POST   /  {employee_id, skills:[...]}  → Creates multiple skill hierarchies in one request
    POST   /bulk-upload              → Bulk import from CSV file (multipart/form-data, requires dept/admin role)
    PUT    /  {employee_id, ...}     → Updates an existing skill hierarchy (requires dept/admin role)
    DELETE /?id=<int>&employee_id=   → Deletes a skill hierarchy link (requires dept/admin role)

    CSV Sync: POST, PUT, DELETE operations auto-export skill_hierarchy_links
    to GCS bucket (INFOLDER/Master_Skills.csv) to keep DB and bucket in sync.

    Returns:
        200: Success (GET, PUT, DELETE, or POST when entry already exists)
        201: Created (POST when new entry is created, or bulk upload with new rows)
        400: Missing required fields or invalid data
        403: Access denied (employee role is not dept/admin)
        404: Skill hierarchy not found (GET by id, PUT, DELETE)
        405: Method not allowed
        409: Conflict (DELETE blocked by employee_skills references)
        500: Server error
    """
    logger.info(f"========== NEW REQUEST ==========")
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
        if request.method == "GET":
            return handle_get(request)
        elif request.method == "POST":
            # Route /bulk-upload to bulk CSV handler
            if request.path.rstrip("/").endswith("/bulk-upload"):
                return handle_bulk_upload(request)
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
        logger.exception("Database error in add_skill_v2")
        # Check for foreign key violation (RESTRICT) — happens when employee_skills reference the link
        error_msg = str(db_err)
        if "violates foreign key constraint" in error_msg or "IntegrityError" in error_msg:
            return _cors_response({
                "error": "Cannot delete: this skill hierarchy is still referenced by employee skills",
                "details": error_msg,
            }, 409)
        return _cors_response({"error": "Database error", "details": error_msg}, 500)

    except Exception as e:
        logger.exception("Unexpected error in add_skill_v2")
        return _cors_response({"error": str(e)}, 500)


"""
===========================================
LOCAL TESTING
===========================================

functions-framework --target=add_skill_v2 --debug



===========================================
DEPLOYMENT COMMANDS
===========================================

Development Deployment:
-----------------------
gcloud functions deploy dev_add_skill_v2 \
  --runtime python311 \
  --trigger-http \
  --entry-point add_skill_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --allow-unauthenticated \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=development


Production Deployment:
----------------------
gcloud functions deploy add_skill_v2 \
  --runtime python311 \
  --trigger-http \
  --entry-point add_skill_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --allow-unauthenticated \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=production

"""
