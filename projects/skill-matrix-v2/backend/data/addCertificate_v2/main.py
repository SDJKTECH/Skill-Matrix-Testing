"""
Google Cloud Function to add new Certificate entries (V2 Schema).
Consolidates creation of Master Certificate Provider, Master Certificate,
and Provider-Certificate Mapping into a single atomic flow.

Features:
1.  **Authorization**: Checks if `employee_id` has 'dept' or 'admin' role.
2.  **Get-or-Create**: Reuses existing Providers/Certificates to avoid duplicates.
3.  **Atomic Operation**: Creates Provider -> Certificate -> Mapping in one go.
4.  **Consolidated Input**: Accepts all necessary fields in a single JSON payload.
"""

import logging
import os
import json
from typing import Dict, Any, Tuple
from urllib.parse import quote_plus
from pathlib import Path

import io
import sys
import pandas as pd
from google.cloud import storage
from flask import Request, jsonify, make_response
from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool
from sqlalchemy.exc import SQLAlchemyError, IntegrityError
from dotenv import load_dotenv

# Allow importing shared utils from backend/utils
utils_path = str(Path(__file__).parent.parent.parent / "utils")
if utils_path not in sys.path:
    sys.path.append(utils_path)

try:
    from utils.event_publisher import publish_event
    from utils.event_types import SystemEventType
except ImportError:
    publish_event = None
    SystemEventType = None

# Load from backend/.env for local development only (deployed functions use Cloud Functions env vars)
# Try to load .env file if it exists (local development), otherwise use Cloud Functions env vars
try:
    env_file = Path(__file__).parent.parent.parent / ".env"
    if env_file.exists():
        load_dotenv(env_file)
except Exception:
    # Silently continue - Cloud Functions use environment variables set during deployment
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

def _cors_response(data: Any, status: int = 200):
    """
    Helper function to add CORS headers to any response (private - not an entry point).
    """
    response = make_response(jsonify(data), status)
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return response

def check_role_authorization(employee_id: int, conn, schema: str):
    """
    Checks if the employee has an authorized role (dept, department, admin, hr)
    to perform write operations. Raises ValueError if unauthorized.
    """
    query = text(f'SELECT role FROM "{schema}".employee WHERE id = :eid')
    result = conn.execute(query, {"eid": employee_id}).fetchone()

    if not result:
        raise ValueError(f"Employee with id {employee_id} not found")

    role = result[0]
    if not role:
        raise ValueError(f"Employee {employee_id} has no role assigned")

    allowed_roles = ['dept', 'department', 'admin', 'hr']
    if role.lower() not in allowed_roles:
        raise ValueError(
            f"Access denied. Employee {employee_id} has role '{role}'. "
            f"Only {allowed_roles} roles are allowed to manage certificates."
        )

    logger.info(f"Authorization passed: employee {employee_id} has role '{role}'")

def get_or_create_provider(conn, schema: str, provider_name: str) -> int:
    """
    Retrieves a provider ID if it exists, otherwise creates a new provider.
    """
    # Check if exists (case-insensitive)
    check_query = text(f'SELECT id FROM "{schema}".master_certificate_provider WHERE LOWER(cert_provider) = LOWER(:cp)')
    existing = conn.execute(check_query, {"cp": provider_name.strip()}).fetchone()

    if existing:
        logger.info(f"Found existing provider: {provider_name} (ID: {existing[0]})")
        return existing[0]

    # Create new
    insert_query = text(f'INSERT INTO "{schema}".master_certificate_provider (cert_provider) VALUES (:cp) RETURNING id')
    result = conn.execute(insert_query, {"cp": provider_name.strip()})
    new_id = result.fetchone()[0]
    logger.info(f"Created new provider: {provider_name} (ID: {new_id})")
    return new_id

def get_or_create_certificate(conn, schema: str, cert_data: Dict[str, Any]) -> int:
    """
    Retrieves a certificate ID if it exists (by Name + Level), otherwise creates a new one.
    """
    name = cert_data["certName"].strip()
    level = cert_data["certLevel"].strip()
    valid_years = cert_data.get("validYears", 0)  # Default 0 if not provided

    # Check existence by Name and Level
    check_query = text(f'''
        SELECT id FROM "{schema}".master_certificate 
        WHERE LOWER(cert_name) = LOWER(:name) AND LOWER(cert_level) = LOWER(:level)
    ''')
    existing = conn.execute(check_query, {"name": name, "level": level}).fetchone()

    if existing:
        logger.info(f"Found existing certificate: {name} - {level} (ID: {existing[0]})")
        # Optional: We could update valid_years/is_active here if logic requires sync behavior
        return existing[0]

    # Create new
    insert_query = text(f'''
        INSERT INTO "{schema}".master_certificate (cert_name, cert_level, valid_years)
        VALUES (:name, :level, :valid)
        RETURNING id
    ''')
    result = conn.execute(insert_query, {
        "name": name,
        "level": level,
        "valid": valid_years,
    })
    new_id = result.fetchone()[0]
    logger.info(f"Created new certificate: {name} - {level} (ID: {new_id})")
    return new_id

def create_mapping_if_not_exists(conn, schema: str, provider_id: int, certificate_id: int) -> int:
    """
    Creates a mapping between Provider and Certificate if it doesn't already exist.
    Returns the mapping ID.
    """
    # Check existence
    check_query = text(f'''
        SELECT id FROM "{schema}".provider_certificate_mapping
        WHERE provider_id = :pid AND certificate_id = :cid
    ''')
    existing = conn.execute(check_query, {"pid": provider_id, "cid": certificate_id}).fetchone()

    if existing:
        logger.info(f"Found existing mapping (ID: {existing[0]})")
        return existing[0]

    # Create new
    insert_query = text(f'''
        INSERT INTO "{schema}".provider_certificate_mapping (provider_id, certificate_id)
        VALUES (:pid, :cid)
        RETURNING id
    ''')
    result = conn.execute(insert_query, {"pid": provider_id, "cid": certificate_id})
    new_id = result.fetchone()[0]
    logger.info(f"Created new mapping (ID: {new_id})")
    return new_id

def parse_boolean(val: Any) -> bool:
    """Safely parse boolean values from Excel"""
    if pd.isna(val):
        return True # Default to active
    if isinstance(val, bool):
        return val
    val_str = str(val).lower().strip()
    return val_str in ['true', 'yes', '1', 'y', 'active']

# ---------------------------------------------------------------------------
# Excel columns order used in the bucket file
# ---------------------------------------------------------------------------
_EXCEL_COLUMNS = ["mapping_id", "Certificate Provider", "Certificate Name", "Certificate Level", "Valid Years", "Is Active"]
_EXCEL_BLOB_PATH = "master-certificate-mapping/Master_Certificates.xlsx"
_BACKUP_PREFIX = "master-certificate-mapping/Master_Certificates_"


def _get_gcs_bucket():
    """Return (client, bucket) or raise if BUCKET_NAME is not set."""
    bucket_name = os.getenv("BUCKET_NAME")
    if not bucket_name:
        raise EnvironmentError("BUCKET_NAME env var is not set — Excel sync skipped")
    project = os.getenv("GCP_PROJECT") or os.getenv("GOOGLE_CLOUD_PROJECT")
    client = storage.Client(project=project)
    return client, client.bucket(bucket_name)


def _read_excel_from_gcs(bucket):
    """
    Download INFOLDER/Master_Certificates.xlsx from GCS and return a DataFrame.
    If the file does not exist yet, return an empty DataFrame with the correct columns.
    """
    blob = bucket.blob(_EXCEL_BLOB_PATH)
    if not blob.exists():
        logger.info("Master_Certificates.xlsx not found in bucket — starting fresh")
        return pd.DataFrame(columns=_EXCEL_COLUMNS)
    
    excel_bytes = blob.download_as_bytes()
    df = pd.read_excel(io.BytesIO(excel_bytes), engine='openpyxl')
    
    # Ensure mapping_id column exists (backward-compat with old Excels lacking it)
    if "mapping_id" not in df.columns:
        df.insert(0, "mapping_id", None)
    return df


def _write_excel_to_gcs(bucket, df):
    """Upload the DataFrame as Excel to INFOLDER/Master_Certificates.xlsx with a rolling backup."""
    # Backup current file first
    existing_blob = bucket.blob(_EXCEL_BLOB_PATH)
    if existing_blob.exists():
        import datetime
        ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_name = f"{_BACKUP_PREFIX}{ts}_backup.xlsx"
        # Remove all old backups to keep only the latest one
        for old in bucket.list_blobs(prefix=_BACKUP_PREFIX):
            old.delete()
        bucket.copy_blob(existing_blob, bucket, backup_name)
        logger.info(f"Backed up existing Excel to {backup_name}")

    # Reorder / ensure correct columns
    for col in _EXCEL_COLUMNS:
        if col not in df.columns:
            df[col] = None
    df = df[_EXCEL_COLUMNS]

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Master_Certificates')
    
    excel_data = output.getvalue()
    bucket.blob(_EXCEL_BLOB_PATH).upload_from_string(
        excel_data,
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    logger.info(f"Uploaded Master_Certificates.xlsx to GCS ({len(df)} rows)")


def sync_excel_append_row(row_data: dict, engine=None, schema=None):
    """
    Append a single new certificate mapping row to the Excel in GCS (called after POST).

    - If the Excel does NOT exist yet in the bucket, triggers a full DB re-export
      so the Excel contains all existing certificates + the new one.
    - If the Excel already exists, appends only the new row (incremental).

    Duplicate guard: if a row with the same mapping_id already exists
    it is skipped (no duplicate is written).
    Returns True on success, False on failure.
    """
    try:
        mapping_id = row_data.get("mapping_id")

        _, bucket = _get_gcs_bucket()

        # If Excel doesn't exist yet, do a full re-export from DB instead of just appending
        blob = bucket.blob(_EXCEL_BLOB_PATH)
        if not blob.exists():
            if engine and schema:
                logger.info(
                    "Master_Certificates.xlsx not found in bucket — triggering full DB re-export "
                    "so Excel contains all existing certificates."
                )
                return sync_excel_full_reexport(engine, schema)
            else:
                logger.warning(
                    "Master_Certificates.xlsx not found and no engine/schema passed — "
                    "creating Excel with only the new row."
                )

        df = _read_excel_from_gcs(bucket)

        # Duplicate guard — skip append if this id is already present in the Excel
        if mapping_id is not None and not df.empty:
            already_exists = (df["mapping_id"].astype(str) == str(mapping_id)).any()
            if already_exists:
                logger.warning(
                    f"Excel API: mapping_id={mapping_id} already exists in Excel — skipping append to prevent duplicate"
                )
                return True  # Not an error; Excel is already in sync

        new_row = {col: row_data.get(col) for col in _EXCEL_COLUMNS}
        df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)
        _write_excel_to_gcs(bucket, df)
        logger.info(f"Excel API: appended row for mapping_id={mapping_id}")
        return True
    except EnvironmentError as env_err:
        logger.warning(str(env_err))
        return False
    except Exception as e:
        logger.warning(f"Excel append failed (non-critical): {e}")
        return False


def sync_excel_update_row(mapping_id: Any, row_data: dict):
    """
    Update the row matching mapping_id in the Excel in GCS (called after PUT).
    Returns True on success, False on failure.
    """
    try:
        _, bucket = _get_gcs_bucket()
        df = _read_excel_from_gcs(bucket)

        mask = df["mapping_id"].astype(str) == str(mapping_id)
        if mask.any():
            for col, val in row_data.items():
                if col in df.columns:
                    df.loc[mask, col] = val
            logger.info(f"Excel API: updated row for mapping_id={mapping_id}")
        else:
            # Row not found — append it so the Excel stays complete
            new_row = {"mapping_id": mapping_id}
            new_row.update({col: row_data.get(col) for col in _EXCEL_COLUMNS if col != "mapping_id"})
            df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)
            logger.info(f"Excel API: row not found, appended for mapping_id={mapping_id}")

        _write_excel_to_gcs(bucket, df)
        return True
    except EnvironmentError as env_err:
        logger.warning(str(env_err))
        return False
    except Exception as e:
        logger.warning(f"Excel update failed (non-critical): {e}")
        return False


def sync_excel_delete_row(mapping_id: int):
    """
    Remove the row matching mapping_id from the Excel in GCS (called after DELETE).
    Returns True on success, False on failure.
    """
    try:
        _, bucket = _get_gcs_bucket()
        df = _read_excel_from_gcs(bucket)

        before = len(df)
        df = df[df["mapping_id"].astype(str) != str(mapping_id)]
        after = len(df)
        logger.info(f"Excel API: removed {before - after} row(s) for mapping_id={mapping_id}")

        _write_excel_to_gcs(bucket, df)
        return True
    except EnvironmentError as env_err:
        logger.warning(str(env_err))
        return False
    except Exception as e:
        logger.warning(f"Excel delete failed (non-critical): {e}")
        return False


def export_certificates_excel_to_gcs(engine, schema):
    """
    Full re-export of ALL provider_certificate_mapping from the DB to GCS Excel.
    Used by bulk-upload and as a recovery fallback.
    """
    bucket_name = os.getenv("BUCKET_NAME")
    if not bucket_name:
        logger.warning("BUCKET_NAME not set, skipping Excel sync")
        return

    export_query = text(f'''
        SELECT
            pcm.id AS "mapping_id",
            mcp.cert_provider AS "Certificate Provider",
            mc.cert_name AS "Certificate Name",
            mc.cert_level AS "Certificate Level",
            mc.valid_years AS "Valid Years"
        FROM "{schema}".provider_certificate_mapping pcm
        LEFT JOIN "{schema}".master_certificate_provider mcp ON mcp.id = pcm.provider_id
        LEFT JOIN "{schema}".master_certificate mc ON mc.id = pcm.certificate_id
        ORDER BY mcp.cert_provider, mc.cert_name
    ''')

    with engine.connect() as connection:
        result = connection.execute(export_query)
        rows = result.fetchall()
    columns = list(result.keys())

    df = pd.DataFrame(rows, columns=columns)

    project = os.getenv("GCP_PROJECT") or os.getenv("GOOGLE_CLOUD_PROJECT")
    client = storage.Client(project=project)
    bucket = client.bucket(bucket_name)
    _write_excel_to_gcs(bucket, df)
    logger.info(f"Full re-export: {len(df)} rows written to gs://{bucket_name}/{_EXCEL_BLOB_PATH}")


def sync_excel_full_reexport(engine, schema):
    """
    Safely trigger a full DB re-export to GCS Excel.
    Returns True on success, False on failure.
    """
    try:
        export_certificates_excel_to_gcs(engine, schema)
        return True
    except Exception as e:
        logger.warning(f"Excel full re-export failed (non-critical): {e}")
        return False


def handle_get(conn, schema: str, request: Request) -> Tuple[str, int]:
    """
    Handle GET requests to fetch certificate ecosystem entries.
    GET /?id=<int>   → Returns a single entry (mapping + details)
    GET /            → Returns all entries
    """
    mapping_id = request.args.get("id")

    base_query = f"""
        SELECT 
            pcm.id AS mapping_id,
            pcm.provider_id,
            mcp.cert_provider,
            pcm.certificate_id,
            mc.cert_name,
            mc.cert_level,
            mc.valid_years,
            pcm.created_at,
            pcm.updated_at
        FROM "{schema}".provider_certificate_mapping pcm
        JOIN "{schema}".master_certificate_provider mcp ON pcm.provider_id = mcp.id
        JOIN "{schema}".master_certificate mc ON pcm.certificate_id = mc.id
    """

    if mapping_id:
        try:
            mapping_id = int(mapping_id)
        except ValueError:
            return json.dumps({"error": "Invalid id parameter"}), 400
            
        query = text(base_query + " WHERE pcm.id = :id")
        row = conn.execute(query, {"id": mapping_id}).fetchone()
        
        if not row:
            return json.dumps({"error": "Certificate entry not found"}), 404
            
        result = {
            "id": row.mapping_id,
            "providerId": row.provider_id,
            "certProvider": row.cert_provider,
            "certificateId": row.certificate_id,
            "certName": row.cert_name,
            "certLevel": row.cert_level,
            "validYears": row.valid_years,
            "isActive": row.is_active,
            "createdAt": row.created_at.isoformat() if row.created_at else None,
            "updatedAt": row.updated_at.isoformat() if row.updated_at else None
        }
        return json.dumps(result), 200

    else:
        # List all
        query = text(base_query + " ORDER BY pcm.id DESC")
        rows = conn.execute(query).fetchall()
        
        results = []
        for row in rows:
            results.append({
                "id": row.mapping_id,
                "providerId": row.provider_id,
                "certProvider": row.cert_provider,
                "certificateId": row.certificate_id,
                "certName": row.cert_name,
                    "certLevel": row.cert_level,
                    "validYears": row.valid_years,
                "createdAt": row.created_at.isoformat() if row.created_at else None,
                "updatedAt": row.updated_at.isoformat() if row.updated_at else None
            })
        return json.dumps(results), 200

def handle_post(conn, schema: str, data: Dict[str, Any]) -> Tuple[str, int]:
    """
    Handle POST request to create a new entry.
    """
    # 1. Validation
    required_fields = ["employee_id", "certProvider", "certName", "certLevel"]
    missing = [field for field in required_fields if not data.get(field)]
    if missing:
        return json.dumps({"error": f"Missing required fields: {', '.join(missing)}"}), 400

    employee_id = data["employee_id"]
    
    # 2. Authorization
    check_role_authorization(employee_id, conn, schema)

    # 3. Get or Create Provider
    provider_id = get_or_create_provider(conn, schema, data["certProvider"])

    # 4. Get or Create Certificate
    certificate_id = get_or_create_certificate(conn, schema, data)

    # 5. Create Mapping
    mapping_id = create_mapping_if_not_exists(conn, schema, provider_id, certificate_id)

    # 6. Sync back the results to Cloud Storage incrementally
    csv_row = {
        "mapping_id": mapping_id,
        "Certificate Provider": data["certProvider"],
        "Certificate Name": data["certName"],
        "Certificate Level": data["certLevel"],
        "Valid Years": data.get("validYears", 0),
        "Is Active": data.get("isActive", True),
    }
    sync_excel_append_row(csv_row, engine=conn.engine, schema=schema)

    if publish_event and SystemEventType:
        try:
            publish_event(conn, SystemEventType.CERTIFICATE_MAPPING_CREATED.value, {
                "action": "CREATE",
                "data": {
                    "mapping_id": mapping_id,
                    "provider_id": provider_id,
                    "certificate_id": certificate_id,
                    "certificate_details": {
                        "provider": data["certProvider"],
                        "name": data["certName"],
                        "level": data["certLevel"]
                    }
                }
            })
        except Exception as e:
            logger.error(f"Webhook dispatch failed: {e}")

    return json.dumps({
        "message": "Certificate ecosystem entry processed successfully",
        "mapping_id": mapping_id,
        "provider_id": provider_id,
        "certificate_id": certificate_id
    }), 201

def handle_put(conn, schema: str, data: Dict[str, Any]) -> Tuple[str, int]:
    """
    Handle PUT request to update an existing entry.
    Actually updates the mapping to point to new/existing provider/cert.
    Does NOT modify the master provider/cert records directly (as they might be shared), 
    but instead points to the correct ones (Get-or-Create pattern).
    """
    mapping_id = data.get("id")
    employee_id = data.get("employee_id")
    
    if not mapping_id or not employee_id:
        return json.dumps({"error": "Missing required fields: id, employee_id"}), 400

    # Authorization
    check_role_authorization(employee_id, conn, schema)
    
    # Check existence
    existing = conn.execute(
        text(f'SELECT id FROM "{schema}".provider_certificate_mapping WHERE id = :id'),
        {"id": mapping_id}
    ).fetchone()
    
    if not existing:
        return json.dumps({"error": "Certificate entry not found"}), 404

    # Get-or-Create new Provider/Cert if provided
    current_provider_id = None
    current_cert_id = None
    
    # Fetch current IDs to keep if not updating
    current_mapping = conn.execute(
        text(f'SELECT provider_id, certificate_id FROM "{schema}".provider_certificate_mapping WHERE id = :id'),
        {"id": mapping_id}
    ).fetchone()
    current_provider_id = current_mapping[0]
    current_cert_id = current_mapping[1]

    if "certProvider" in data:
        current_provider_id = get_or_create_provider(conn, schema, data["certProvider"])
    
    if "certName" in data or "certLevel" in data: # logic for certificate
        # If updating cert details, we treat it as "switching to another certificate" or "creating a new one"
        # We need name and level to find/create. If only one provided, we need to know the other? 
        # For simplicity in V2, let's require both if changing either, OR fetch existing to fill gaps.
        # Here we assume if they want to change cert, they provide full cert details or we use defaults?
        # Better: require Name and Level if updating Cert info.
        if "certName" in data and "certLevel" in data:
             current_cert_id = get_or_create_certificate(conn, schema, data)
        else:
             # If partial update, we might need to fetch existing cert details to modify? 
             # But "Master" certs are shared. We shouldn't modify the Master Cert itself if others use it.
             # So we always "Link to" a cert. 
             # If user sends just "certName", it implies a new Cert entity (or existing one).
             # Let's enforce providing both for a predictable "Link to this Cert" behavior.
             if "certName" in data or "certLevel" in data:
                 return json.dumps({"error": "To update certificate, please provide both certName and certLevel"}), 400

    # Update Mapping
    update_query = text(f'''
        UPDATE "{schema}".provider_certificate_mapping
        SET provider_id = :pid, certificate_id = :cid, updated_at = NOW()
        WHERE id = :id
    ''')
    conn.execute(update_query, {"pid": current_provider_id, "cid": current_cert_id, "id": mapping_id})
    
    # Fetch updated names to reflect in Excel
    updated_row_query = text(f"""
        SELECT 
            mcp.cert_provider AS "Certificate Provider",
            mc.cert_name AS "Certificate Name",
            mc.cert_level AS "Certificate Level",
            mc.valid_years AS "Valid Years",
            mc.is_active AS "Is Active"
        FROM "{schema}".provider_certificate_mapping pcm
        JOIN "{schema}".master_certificate_provider mcp ON pcm.provider_id = mcp.id
        JOIN "{schema}".master_certificate mc ON pcm.certificate_id = mc.id
        WHERE pcm.id = :id
    """)
    updated_rec = conn.execute(updated_row_query, {"id": mapping_id}).fetchone()

    csv_row = {}
    if updated_rec:
        csv_row = {
            "Certificate Provider": updated_rec[0],
            "Certificate Name": updated_rec[1],
            "Certificate Level": updated_rec[2],
            "Valid Years": updated_rec[3],
            "Is Active": updated_rec[4],
        }

    # Sync back the results to Cloud Storage incrementally
    sync_excel_update_row(mapping_id, csv_row)

    if publish_event and SystemEventType:
        try:
            publish_event(conn, SystemEventType.CERTIFICATE_MAPPING_UPDATED.value, {
                "action": "UPDATE",
                "data": {
                    "mapping_id": mapping_id,
                    "provider_id": current_provider_id,
                    "certificate_id": current_cert_id,
                    "updated_by": employee_id
                }
            })
        except Exception as e:
            logger.error(f"Webhook dispatch failed: {e}")

    return json.dumps({
        "message": "Certificate entry updated successfully",
        "mapping_id": mapping_id,
        "provider_id": current_provider_id,
        "certificate_id": current_cert_id
    }), 200

def handle_delete(conn, schema: str, request: Request) -> Tuple[str, int]:
    """
    Handle DELETE request to remove a mapping.
    """
    mapping_id = request.args.get("id")
    employee_id = request.args.get("employee_id")
    
    # Also support JSON body for DELETE
    if not mapping_id or not employee_id:
        data = request.get_json(silent=True) or {}
        mapping_id = data.get("id")
        employee_id = data.get("employee_id")

    if not mapping_id or not employee_id:
        return json.dumps({"error": "Missing required fields: id, employee_id"}), 400

    try:
        mapping_id = int(mapping_id)
        employee_id = int(employee_id)
    except ValueError:
        return json.dumps({"error": "Invalid ID format"}), 400

    # Authorization
    check_role_authorization(employee_id, conn, schema)

    # Fetch current IDs to keep track for orphan cleanup
    existing = conn.execute(
        text(f'SELECT provider_id, certificate_id FROM "{schema}".provider_certificate_mapping WHERE id = :id'),
        {"id": mapping_id}
    ).fetchone()

    if not existing:
        return json.dumps({"error": "Certificate entry not found"}), 404

    old_provider_id = existing[0]
    old_certificate_id = existing[1]

    # Delete Mapping
    conn.execute(text(f'DELETE FROM "{schema}".provider_certificate_mapping WHERE id = :id'), {"id": mapping_id})
    
    # Orphan cleanup - delete old master entries that are no longer referenced
    orphans_deleted = []

    ref_check = text(f'SELECT 1 FROM "{schema}".provider_certificate_mapping WHERE provider_id = :id LIMIT 1')
    if not conn.execute(ref_check, {"id": old_provider_id}).fetchone():
        conn.execute(text(f'DELETE FROM "{schema}".master_certificate_provider WHERE id = :id'), {"id": old_provider_id})
        orphans_deleted.append(f"provider (id={old_provider_id})")
        logger.info(f"Deleted orphaned provider (id={old_provider_id})")

    ref_check = text(f'SELECT 1 FROM "{schema}".provider_certificate_mapping WHERE certificate_id = :id LIMIT 1')
    if not conn.execute(ref_check, {"id": old_certificate_id}).fetchone():
        conn.execute(text(f'DELETE FROM "{schema}".master_certificate WHERE id = :id'), {"id": old_certificate_id})
        orphans_deleted.append(f"certificate (id={old_certificate_id})")
        logger.info(f"Deleted orphaned certificate (id={old_certificate_id})")

    # Sync back the results to Cloud Storage incrementally
    sync_excel_delete_row(mapping_id)

    if publish_event and SystemEventType:
        try:
            publish_event(conn, SystemEventType.CERTIFICATE_MAPPING_DELETED.value, {
                "action": "DELETE",
                "data": {
                    "mapping_id": mapping_id,
                    "deleted_by": employee_id,
                    "orphaned_providers_deleted": 1 if f"provider (id={old_provider_id})" in orphans_deleted else 0,
                    "orphaned_certificates_deleted": 1 if f"certificate (id={old_certificate_id})" in orphans_deleted else 0
                }
            })
        except Exception as e:
            logger.error(f"Webhook dispatch failed: {e}")

    response_data = {"message": "Certificate entry deleted"}
    if orphans_deleted:
        response_data["orphaned_masters_deleted"] = orphans_deleted

    return json.dumps(response_data), 200

def handle_bulk_upload(conn, schema: str, request: Request) -> Tuple[str, int]:
    """
    Handle POST /bulk-upload to import certificates from an Excel or CSV file.
    Accepts multipart/form-data with 'file' and 'employee_id'
    """
    if 'file' not in request.files:
        return json.dumps({"error": "No file uploaded"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return json.dumps({"error": "No file selected"}), 400

    employee_id_str = request.form.get('employee_id')
    if not employee_id_str:
        return json.dumps({"error": "employee_id is required"}), 400
        
    try:
        employee_id = int(employee_id_str)
    except ValueError:
        return json.dumps({"error": "Invalid employee_id"}), 400

    file_bytes = file.read()
    try:
        if file.filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(file_bytes))
        else:
            df = pd.read_excel(io.BytesIO(file_bytes))
    except Exception as e:
        return json.dumps({"error": f"Failed to parse file: {str(e)}"}), 400

    if df.empty:
        return json.dumps({"error": "Uploaded file is empty"}), 400

    columns = df.columns.tolist()
    if "Certificate Provider" not in columns or "Certificate Name" not in columns:
        return json.dumps({"error": "Missing required columns: 'Certificate Provider' and 'Certificate Name'"}), 400

    success_count: int = 0
    skipped_count: int = 0
    error_rows: list[dict[str, Any]] = []

    check_role_authorization(employee_id, conn, schema)

    for index, row in df.iterrows():
        try:
            provider = str(row.get("Certificate Provider", "")).strip()
            name = str(row.get("Certificate Name", "")).strip()

            if not provider or provider == 'nan' or not name or name == 'nan':
                error_rows.append({"row": index + 2, "error": "Missing Certificate Provider or Certificate Name"})
                continue

            level = str(row.get("Certificate Level", "")) if pd.notna(row.get("Certificate Level")) else ""
            if level == 'nan': level = ""

            valid_years_raw = row.get("Valid Years", 0)
            try:
                valid_years = int(float(valid_years_raw)) if pd.notna(valid_years_raw) else 0
            except ValueError:
                valid_years = 0

            is_active = parse_boolean(row.get("Is Active", True))

            provider_id = get_or_create_provider(conn, schema, provider)

            cert_data = {
                "certName": name,
                "certLevel": level,
                "validYears": valid_years,
                "isActive": is_active
            }
            certificate_id = get_or_create_certificate(conn, schema, cert_data)
            
            # Check if mapping already exists to track skips
            check_query = text(f'''
                SELECT id FROM "{schema}".provider_certificate_mapping
                WHERE provider_id = :pid AND certificate_id = :cid
            ''')
            existing = conn.execute(check_query, {"pid": provider_id, "cid": certificate_id}).fetchone()

            if existing:
                skipped_count += 1
                logger.info(f"Row {index + 2}: Mapping already exists, skipping.")
            else:
                create_mapping_if_not_exists(conn, schema, provider_id, certificate_id)
                success_count += 1
                
        except Exception as e:
            logger.error(f"Error processing row {index + 2}: {e}")
            error_rows.append({"row": index + 2, "error": str(e)})

    response_payload = {
        "message": "Bulk upload completed",
        "successful_inserts": success_count,
        "skipped_existing": skipped_count,
        "errors": error_rows,
        "total_rows": len(df)
    }
    
    status_code = 207 if error_rows else 200
    if success_count == 0 and skipped_count == 0 and len(df) > 0:
        status_code = 400

    if success_count > 0:
        logger.info(f"Bulk Process Done: {success_count} rows created. Regenerating Excel.")
        try:
            sync_excel_full_reexport(conn.engine, schema)
        except Exception as sync_e:
            logger.error(f"Failed to sync bucket after bulk upload: {sync_e}")

        if publish_event and SystemEventType:
            try:
                publish_event(conn, SystemEventType.CERTIFICATE_MAPPING_CREATED.value, {
                    "action": "BULK_CREATE",
                    "data": {
                        "successful_inserts": success_count,
                        "skipped_existing": skipped_count,
                        "total_rows": len(df)
                    }
                })
            except Exception as e:
                logger.error(f"Webhook dispatch failed: {e}")

    return json.dumps(response_payload), status_code

def add_certificate_v2(request: Request):
    """
    Cloud Function Entry Point.
    """
    # Handle CORS OPTIONS
    if request.method == "OPTIONS":
        response = make_response("", 204)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response.headers["Access-Control-Max-Age"] = "3600"
        return response

    try:
        schema = os.getenv("DB_SCHEMA")
        engine = get_db_engine()

        with engine.begin() as conn:
            if request.method == "GET":
                response_body, status = handle_get(conn, schema, request)
            elif request.method == "POST":
                if request.path.rstrip("/").endswith("/bulk-upload"):
                    response_body, status = handle_bulk_upload(conn, schema, request)
                else:
                    data = request.get_json(silent=True) or {}
                    response_body, status = handle_post(conn, schema, data)
            elif request.method == "PUT":
                data = request.get_json(silent=True) or {}
                response_body, status = handle_put(conn, schema, data)
            elif request.method == "DELETE":
                response_body, status = handle_delete(conn, schema, request)
            else:
                 return _cors_response({"error": "Method Not Allowed"}, 405)
            
            # response_body is already a JSON string, so parse it back to dict for _cors_response
            response_data = json.loads(response_body) if isinstance(response_body, str) else response_body
            return _cors_response(response_data, status)

    except ValueError as e:
        logger.warning(f"Validation/Auth Error: {e}")
        return _cors_response({"error": str(e)}, 400)
    except SQLAlchemyError as e:
        logger.error(f"Database Error: {e}")
        return _cors_response({"error": "Database error occurred"}, 500)
    except Exception as e:
        logger.error(f"Unexpected Error: {e}")
        return _cors_response({"error": "Internal server error"}, 500)


"""
===========================================
LOCAL TESTING
===========================================

functions-framework --target=add_certificate_v2 --debug



===========================================
DEPLOYMENT COMMANDS
===========================================

Development Deployment:
-----------------------
gcloud functions deploy dev_add_certificate_v2 \
  --runtime python311 \
  --trigger-http \
  --entry-point add_certificate_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --allow-unauthenticated \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=development


Production Deployment:
----------------------
gcloud functions deploy add_certificate_v2 \
  --runtime python311 \
  --trigger-http \
  --entry-point add_certificate_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --allow-unauthenticated \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=production

"""
