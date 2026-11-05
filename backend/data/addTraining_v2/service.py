
import os
import logging
from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool
from urllib.parse import quote_plus
import pandas as pd
from datetime import date, datetime
import re

from constants import (
    STATUS_NORMALIZATION,
    _DATE_FORMATS,
    BATCH_STATUS_NORMALIZATION,
    TRAINING_MODE_NORMALIZATION
    )


class ConflictError(Exception):
    """
    Raised when a business rule conflict occurs.
    Examples:
    - Batch cannot be deleted because it is in use
    - Batch belongs to a different training hierarchy
    """    
    pass

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

ENUM_CACHE = {}


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


def load_training_enums():
    """
    Load all PostgreSQL enum values once per Cloud Function instance.
    """

    if ENUM_CACHE:
        return ENUM_CACHE
    
    engine = get_db_engine()
    schema = os.getenv("DB_SCHEMA")

    try:
        with engine.connect() as connection:

            enum_types = {
                "training_status": "training_status_enum",
                "employee_type": "employee_type_enum",
                "batch_status": "training_batch_status_enum",
                "training_mode": "training_mode_enum",
            }

            for key, enum_name in enum_types.items():

                rows = connection.execute(
                    text(f"""
                        SELECT unnest(enum_range(NULL::"{schema}"."{enum_name}"))::text
                    """)
                ).fetchall()

                ENUM_CACHE[key] = {row[0] for row in rows}

    except Exception as e:
        logger.error(f"Error occurred while loading training enums: {e}")
        raise ValueError("Error occurred in processing the request.")
    
    return ENUM_CACHE


def get_enum(enum_name):

    if not ENUM_CACHE:
        load_training_enums()

    return ENUM_CACHE.get(enum_name, set())

def _safe_value(field_value):
    """
    Return a normalized value from a Pandas row.

    Returns:
        - None for NaN, None, empty strings
        - Dates formatted as YYYY-MM-DD
        - Integer-like floats (1234.0) converted to "1234"
        - Trimmed string otherwise
    """

    if (
        field_value is None
        or (isinstance(field_value, float) and pd.isna(field_value))
        or str(field_value).strip() in ("", "nan", "None")
    ):
        return None

    # Convert 1234.0 -> "1234"
    if isinstance(field_value, float) and field_value.is_integer():
        return str(int(field_value))

    # Convert dates
    if isinstance(field_value, (date, datetime, pd.Timestamp)):
        return field_value.strftime("%Y-%m-%d")

    field_value = str(field_value).strip()

    if field_value.endswith(".0") and field_value[:-2].isdigit():
        return field_value[:-2]

    return field_value


def check_role_authorization(admin_id, connection, schema):
    """
    Check if the admin_id has an authorized role (dept/admin/hr) to manage training records.
    Returns the admin role if authorized.
    Raises ValueError if not found or not authorized.

    NOTE: admin_id is the person PERFORMING the action (not the target employee).
    """
    query = text(f'SELECT id, role FROM "{schema}".employee WHERE id = :employee_id')
    result = connection.execute(query, {"employee_id": admin_id}).fetchone()

    if not result:
        raise ValueError(f"Admin employee with id {admin_id} not found")

    role = result[1]  # role column
    if not role:
        raise ValueError(f"Employee {admin_id} has no role assigned")

    allowed_roles = ['dept', 'department', 'admin', 'hr', 'user']
    if role.lower() not in allowed_roles:
        raise ValueError(
            f"Access denied. Employee {admin_id} has role '{role}'. "
            f"Only dept/admin roles are allowed to manage training records."
        )

    logger.info(f"Authorization passed: admin_id={admin_id} has role '{role}'")
    return role


def get_manager_info(employee_id, connection, schema):
    """
    Resolve the employee's manager (employee.reports_to) as (email, name).
    Returns (None, None) if there's no manager or no email.
    """
    query = text(f'''
        SELECT m.email, m.name
        FROM "{schema}".employee e
        JOIN "{schema}".employee m ON m.id = e.reports_to
        WHERE e.id = :employee_id
    ''')
    result = connection.execute(query, {"employee_id": employee_id}).fetchone()
    return (result[0], result[1]) if result else (None, None)


_MONTH_ABBR = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12,
}

# Non-ASCII dash variants that Excel/Word autocorrect (or copy-paste) can
# swap in for a plain hyphen, e.g. "05–Jun–24" instead of "05-Jun-24".
_DASH_CHARS = "‐‑‒–—―−"


def _clean_date_str(s):
    for ch in _DASH_CHARS:
        s = s.replace(ch, "-")
    return re.sub(r"\s+", " ", s).strip()


def _parse_month_name_date(s):
    """
    Locale-independent fallback for 'DD-Mon-YY' / 'DD-Mon-YYYY' style dates
    (e.g. '05-Jun-24').
    """
    match = re.match(r"^(\d{1,2})[-/\s]([A-Za-z]{3,9})[-/\s](\d{2,4})$", s)
    if not match:
        return None

    day, month_name, year = match.groups()
    month = _MONTH_ABBR.get(month_name.lower()[:3])
    if not month:
        return None

    year = int(year)
    if year < 100:
        year += 2000 if year < 70 else 1900

    try:
        return date(year, month, int(day)).strftime("%Y-%m-%d")
    except ValueError:
        return None


def normalize_date(val):
    """
    Accept any date value (string, pandas Timestamp, datetime, date) and
    return a YYYY-MM-DD string, or None if empty / NaN.

    If no known format matches a string value, the raw string is returned as-is
    so that the existing validate_date() still catches it with a proper message.
    """
    if val is None:
        return None

    # Handle pandas Timestamp / datetime / date objects directly
    if isinstance(val, (pd.Timestamp, datetime, date)):
        return val.strftime("%Y-%m-%d")

    s = str(val).strip()
    if s in ("", "nan", "None", "NaT") or s.lower() == "not finished":
        return None

    s = _clean_date_str(s)

    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue

    parsed = _parse_month_name_date(s)
    if parsed:
        return parsed

    # No format matched — return raw so validate_date() can flag it
    return s


def normalize_training_status(raw_status):
    """
    Normalize a raw training status string to a canonical enum value.

    Returns:
        (canonical_value, warning_or_error)
        - Already valid enum   → (raw_status, None)
        - Known variant found  → (canonical, "Status 'xyz' was normalized to 'Canonical'")
        - Completely unknown   → (None, "Invalid Training Status 'xyz'. Allowed: ...")
    """
    if not raw_status:
        return (raw_status, None)

    s = str(raw_status).strip()
    if not s:
        return (None, None)

    # Already an exact canonical value?
    if s in get_enum("training_status"):
        return (s, None)

    # Lookup in normalization map
    key = s.lower()
    canonical = STATUS_NORMALIZATION.get(key)
    if canonical and canonical in get_enum("training_status"):
        return (canonical, f"Training Status '{s}' was normalized to '{canonical}'")

    # Completely unknown
    return (None, f"Invalid Training Status '{s}'. Allowed values: {', '.join(get_enum('training_status'))}")


# Statuses that need a reason in status_remarks. Add a status here to make
# it need a reason too.
DECISION_STATUSES_REQUIRING_REASON = {"Not Completed"}
MIN_DECISION_REASON_LENGTH = 10


def validate_decision_reason(training_status, status_remarks):
    """
    Returns an error message string if `status_remarks` doesn't satisfy the
    mandatory-reason rule for this `training_status`, or None if valid/not
    applicable. Callers turn a non-None return into an HTTP 400 themselves —
    this function only validates, it doesn't shape responses (SRP).
    """
    if training_status not in DECISION_STATUSES_REQUIRING_REASON:
        return None
    reason_text = (status_remarks or "").strip()
    if len(reason_text) < MIN_DECISION_REASON_LENGTH:
        return (
            f"status_remarks is required (min {MIN_DECISION_REASON_LENGTH} characters) "
            f"when setting training_status to '{training_status}'"
        )
    return None


def normalize_employee_type(raw_type):
    """
    Normalize a raw employee type string to a canonical enum value.
    """
    if not raw_type:
        return (None, None)

    s = str(raw_type).strip()
    if not s:
        return (None, None)

    # Ignore case, and also accept the singular form (Intern -> Interns).
    for valid in get_enum("employee_type"):
        if s.lower() == valid.lower() or s.lower() + 's' == valid.lower():
            if s != valid:
                return (valid, f"Employee Type '{s}' was normalized to '{valid}'")
            return (valid, None)

    # Completely unknown
    return (None, f"Invalid Employee Type '{s}'. Allowed values: {', '.join(get_enum('employee_type'))}")


def normalize_training_Batch_status(raw_status):
    """
    Normalize a raw batch status string to a canonical enum value.

    Returns:
        (canonical_value, warning_or_error)
        - Already valid enum   → (raw_status, None)
        - Known variant found  → (canonical, "Status 'xyz' was normalized to 'Canonical'")
        - Completely unknown   → (None, "Invalid Training Status 'xyz'. Allowed: ...")
    """
    if not raw_status:
        return (raw_status, None)

    s = str(raw_status).strip()
    if not s:
        return (None, None)

    # Already an exact canonical value?
    if s in get_enum("batch_status"):
        return (s, None)

    # Lookup in normalization map
    key = s.lower()
    canonical = BATCH_STATUS_NORMALIZATION.get(key)
    if canonical and canonical in get_enum("batch_status"):
        return (canonical, f"Training Status '{s}' was normalized to '{canonical}'")

    # Completely unknown
    return (None, f"Invalid Training Status '{s}'. Allowed values: {', '.join(get_enum('batch_status'))}")


def normalize_training_mode(raw_mode):
    """
    Normalize a raw training mode string to a canonical enum value.
    """
    if not raw_mode:
        return (raw_mode, None)

    s = str(raw_mode).strip()
    if not s:
        return (None, None)

    valid_modes = get_enum("training_mode")

    for valid in valid_modes:
        if s.lower() == valid.lower():
            if s != valid:
                return (valid, f"Training Mode '{s}' was normalized to '{valid}'")
            return (valid, None)

    key = s.lower()
    canonical = TRAINING_MODE_NORMALIZATION.get(key)
    if canonical and canonical in valid_modes:
        return (canonical, f"Training Mode '{s}' was normalized to '{canonical}'")

    return (None, f"Invalid Training Mode '{s}'. Allowed values: {', '.join(valid_modes)}")


def determine_batch_status(training_status):
    if training_status == "In Progress":
        return "In Progress"

    if training_status == "Completed":
        return "Completed"

    return "Planned"



def validate_training_batch(
    batch_num=None,
    start_date=None,
    end_date=None,
    batch_size=None,
):
    """
    Validate training batch data.

    Raises:
        ValueError: If validation fails.
    """

    # -------------------------
    # Batch Number
    # -------------------------
    if batch_num is not None:
        batch_num = batch_num.strip()

        if not batch_num:
            raise ValueError("Batch Number cannot be empty.")

        if len(batch_num) > 255:
            raise ValueError(
                f"Batch Number is too long ({len(batch_num)} chars). Maximum is 255 characters."
            )

    # -------------------------
    # Batch Size
    # -------------------------
    if batch_size is not None:

        try:
            batch_size = int(batch_size)
        except (TypeError, ValueError):
            raise ValueError("Batch Size must be a valid integer.")

        if batch_size <= 0:
            raise ValueError("Batch Size must be greater than 0.")

    # -------------------------
    # Dates
    # -------------------------
    if start_date and end_date:

        if end_date < start_date:
            raise ValueError(
                "End Date cannot be earlier than Start Date."
            )


# ============================================================================

def resolve_training_hierarchy(area_name, sub_area_name, module_name, connection, schema,
                               area_description=None, sub_area_description=None,
                               module_course_level=None, module_description=None):
    """
    Given area/subarea/module names, resolve or create the corresponding master
    table rows and return the training_hierarchy_id from training_hierarchy_links.

    For each entity:
      1. SELECT to check if name already exists (case-insensitive).
      2. If not found, INSERT and get new id (with optional description/course_level).
      3. If INSERT fails due to race/sequence issue, SELECT again to get existing id.

    Optional fields (used only on first-time INSERT, ignored if row already exists):
      area_description     → master_area.description
      sub_area_description → master_subarea.description
      module_course_level  → master_module.course_level
      module_description   → master_module.description
    """

    # ── Step A: Resolve master_area ──────────────────────────────────────────
    area_row = connection.execute(
        text(f'SELECT area_id FROM "{schema}".master_area WHERE LOWER(area_name) = LOWER(:name)'),
        {"name": area_name.strip()}
    ).fetchone()

    if area_row:
        area_id = area_row[0]
        logger.info(f"Found existing area '{area_name}' → area_id={area_id}")
    else:
        try:
            area_id = connection.execute(
                text(f'INSERT INTO "{schema}".master_area (area_name, description) VALUES (:name, :description) RETURNING area_id'),
                {"name": area_name.strip(), "description": area_description}
            ).fetchone()[0]
            logger.info(f"Created new area '{area_name}' → area_id={area_id}")
        except Exception:
            connection.rollback()
            area_id = connection.execute(
                text(f'SELECT area_id FROM "{schema}".master_area WHERE LOWER(area_name) = LOWER(:name)'),
                {"name": area_name.strip()}
            ).fetchone()[0]
            logger.info(f"Fallback SELECT area '{area_name}' → area_id={area_id}")

    # ── Step B: Resolve master_subarea ───────────────────────────────────────
    sub_row = connection.execute(
        text(f'SELECT sub_area_id FROM "{schema}".master_subarea WHERE LOWER(sub_area_name) = LOWER(:name)'),
        {"name": sub_area_name.strip()}
    ).fetchone()

    if sub_row:
        sub_area_id = sub_row[0]
        logger.info(f"Found existing subarea '{sub_area_name}' → sub_area_id={sub_area_id}")
    else:
        try:
            sub_area_id = connection.execute(
                text(f'INSERT INTO "{schema}".master_subarea (sub_area_name, description) VALUES (:name, :description) RETURNING sub_area_id'),
                {"name": sub_area_name.strip(), "description": sub_area_description}
            ).fetchone()[0]
            logger.info(f"Created new subarea '{sub_area_name}' → sub_area_id={sub_area_id}")
        except Exception:
            connection.rollback()
            sub_area_id = connection.execute(
                text(f'SELECT sub_area_id FROM "{schema}".master_subarea WHERE LOWER(sub_area_name) = LOWER(:name)'),
                {"name": sub_area_name.strip()}
            ).fetchone()[0]
            logger.info(f"Fallback SELECT subarea '{sub_area_name}' → sub_area_id={sub_area_id}")

    # ── Step C: Resolve master_module ────────────────────────────────────────
    mod_row = connection.execute(
        text(f'SELECT module_id FROM "{schema}".master_module WHERE LOWER(module_name) = LOWER(:name)'),
        {"name": module_name.strip()}
    ).fetchone()

    if mod_row:
        module_id = mod_row[0]
        logger.info(f"Found existing module '{module_name}' → module_id={module_id}")
    else:
        try:
            module_id = connection.execute(
                text(f'INSERT INTO "{schema}".master_module (module_name, course_level, description) VALUES (:name, :course_level, :description) RETURNING module_id'),
                {"name": module_name.strip(), "course_level": module_course_level, "description": module_description}
            ).fetchone()[0]
            logger.info(f"Created new module '{module_name}' → module_id={module_id}")
        except Exception:
            connection.rollback()
            module_id = connection.execute(
                text(f'SELECT module_id FROM "{schema}".master_module WHERE LOWER(module_name) = LOWER(:name)'),
                {"name": module_name.strip()}
            ).fetchone()[0]
            logger.info(f"Fallback SELECT module '{module_name}' → module_id={module_id}")

    # ── Step D: Resolve training_hierarchy_links ─────────────────────────────
    link_row = connection.execute(
        text(f'''
            SELECT training_hierarchy_id
            FROM "{schema}".training_hierarchy_links
            WHERE area_id = :area_id
              AND sub_area_id = :sub_area_id
              AND module_id = :module_id
        '''),
        {"area_id": area_id, "sub_area_id": sub_area_id, "module_id": module_id}
    ).fetchone()

    if link_row:
        training_hierarchy_id = link_row[0]
        logger.info(f"Found existing hierarchy link → training_hierarchy_id={training_hierarchy_id}")
    else:
        try:
            training_hierarchy_id = connection.execute(
                text(f'''
                    INSERT INTO "{schema}".training_hierarchy_links (area_id, sub_area_id, module_id)
                    VALUES (:area_id, :sub_area_id, :module_id)
                    RETURNING training_hierarchy_id
                '''),
                {"area_id": area_id, "sub_area_id": sub_area_id, "module_id": module_id}
            ).fetchone()[0]
            logger.info(f"Created new hierarchy link → training_hierarchy_id={training_hierarchy_id}")
        except Exception:
            connection.rollback()
            training_hierarchy_id = connection.execute(
                text(f'''
                    SELECT training_hierarchy_id
                    FROM "{schema}".training_hierarchy_links
                    WHERE area_id = :area_id
                      AND sub_area_id = :sub_area_id
                      AND module_id = :module_id
                '''),
                {"area_id": area_id, "sub_area_id": sub_area_id, "module_id": module_id}
            ).fetchone()[0]
            logger.info(f"Fallback SELECT hierarchy link → training_hierarchy_id={training_hierarchy_id}")

    return training_hierarchy_id

def resolve_training_batch(
    connection,
    schema,
    training_hierarchy_id,
    batch_num,
    batch_description,
    start_date,
    end_date,    
    batch_status="Planned",
    training_mode=None,
    training_quarter=None,
    batch_status_remarks=None,
    duration=None,
    trainer=None,
    batch_size=None,
    prerequisite=None,
    training_content=None,
    resources=None,
    bulk_insert=False
):

    """
    Returns batch_id.

    Behaviour:
    - Batch does not exist -> INSERT with the supplied batch details.
    - Same batch + same hierarchy -> return existing batch_id.
    - Same batch + different hierarchy -> Raise ConflictError
      (unless bulk_insert=True).
    """

    batch_num = batch_num.strip()

    if len(batch_num) > 255:
        raise ValueError(
            f"Batch Number is too long ({len(batch_num)} chars). Maximum is 255 characters."
        )

    existing = connection.execute(
        text(f"""
            SELECT
                id,
                training_hierarchy_id
            FROM "{schema}".training_batches
            WHERE LOWER(TRIM(batch_num)) = LOWER(TRIM(:batch_num))
        """),
        {
            "batch_num": batch_num
        }
    ).fetchone()

    # ---------------------------------
    # Batch already exists
    # ---------------------------------
    if existing:
        if (not bulk_insert
            and existing.training_hierarchy_id != training_hierarchy_id ):
            raise ConflictError(
                f"Batch '{batch_num}' already exists for "
                f"training hierarchy {existing.training_hierarchy_id}. "
                "A batch number cannot belong to multiple trainings."
            )

        return existing.id

    # ---------------------------------
    # Batch does not exist
    # ---------------------------------
    normalized_training_mode = training_mode
    if normalized_training_mode is not None:
        normalized_training_mode, mode_msg = normalize_training_mode(normalized_training_mode)
        if normalized_training_mode is None:
            raise ValueError(mode_msg)

    result = connection.execute(
        text(f"""
            INSERT INTO "{schema}".training_batches
            (
                batch_num,
                training_hierarchy_id,
                batch_desc,
                batch_status,
                batch_status_remarks,
                start_date,
                end_date,
                duration,
                training_mode,
                training_quarter,
                trainer,
                batch_size,
                prerequisite,
                training_content,
                resources
            )
            VALUES
            (
                :batch_num,
                :training_hierarchy_id,
                :batch_desc,
                :batch_status,
                :batch_status_remarks,
                :start_date,
                :end_date,
                :duration,
                :training_mode,
                :training_quarter,
                :trainer,
                :batch_size,
                :prerequisite,
                :training_content,
                :resources
            )
            RETURNING id
        """),
        {
            "batch_num": batch_num,
            "training_hierarchy_id": training_hierarchy_id,
            "batch_desc": batch_description,
            "batch_status": batch_status,
            "batch_status_remarks": batch_status_remarks,
            "start_date": start_date,
            "end_date": end_date,
            "duration": duration,
            "training_mode": normalized_training_mode,
            "training_quarter": training_quarter,
            "trainer": trainer,
            "batch_size": batch_size,
            "prerequisite": prerequisite,
            "training_content": training_content,
            "resources": resources,
        }
    ).fetchone()

    return result.id

# ============================================================================
# TRAINING BATCH HANDLERS
# ============================================================================

def get_training_batch(batch_id=None, batch_num=None):

    # Normalize batch number
    if batch_num:
        batch_num = batch_num.strip()

    engine = get_db_engine()
    schema = os.getenv("DB_SCHEMA")

    try:
        with engine.connect() as connection:
            query = text(f"""
                        SELECT
                            tb.id AS batch_id,
                            tb.batch_num,
                            tb.batch_desc,
                            tb.training_hierarchy_id,
                            tb.training_quarter,
                            tb.batch_status,
                            tb.batch_status_remarks,
                            tb.start_date,
                            tb.end_date,
                            tb.duration,
                            tb.training_mode,
                            tb.trainer,
                            tb.batch_size,
                            tb.prerequisite,
                            tb.training_content AS content,
                            tb.resources,
                            tb.created_at,
                            tb.updated_at,
                            ma.area_name,
                            msa.sub_area_name,
                            mm.module_name,
                            COALESCE(ec.employee_count, 0)  AS employee_count,
                            COALESCE(ec.completed_count, 0) AS completed_count

                        FROM "{schema}".training_batches tb

                        LEFT JOIN "{schema}".training_hierarchy_links thl
                            ON tb.training_hierarchy_id = thl.training_hierarchy_id

                        LEFT JOIN "{schema}".master_area ma
                            ON thl.area_id = ma.area_id

                        LEFT JOIN "{schema}".master_subarea msa
                            ON thl.sub_area_id = msa.sub_area_id

                        LEFT JOIN "{schema}".master_module mm
                            ON thl.module_id = mm.module_id

                        LEFT JOIN (
                            SELECT
                                batch_id,
                                COUNT(*) AS employee_count,
                                COUNT(*) FILTER (
                                    WHERE LOWER(training_status::text) = 'completed'
                                ) AS completed_count
                            FROM "{schema}".employee_trainings
                            GROUP BY batch_id
                        ) ec ON ec.batch_id = tb.id

                        WHERE (
                                (:batch_id IS NULL AND :batch_num IS NULL)
                                OR tb.id = :batch_id
                                OR LOWER(tb.batch_num) = LOWER(:batch_num)
                              )
                              
                        ORDER BY
                            tb.start_date DESC NULLS LAST,
                            tb.id;
                        """)
            
            results = connection.execute(
                query,
                {
                    "batch_id": batch_id,
                    "batch_num": batch_num
                }
            ).fetchall()
        
        batches = [dict(row._mapping) for row in results]
        return batches
    
    except Exception:
        logger.exception("Error fetching batches")
        raise


def add_training_batch(data):
    admin_id = data.get("admin_id")
    area        = data.get("area", "").strip() if data.get("area") else ""
    sub_area    = data.get("subarea", "").strip() if data.get("subarea") else ""
    module      = data.get("module", "").strip() if data.get("module") else ""
    batch_num   = data.get("batch_num") if data.get("batch_num") else ""
    batch_num  = batch_num.strip()

    missing_fields = []
    if not admin_id:
        missing_fields.append("admin_id")
    if not area:
        missing_fields.append("area")
    if not sub_area:
        missing_fields.append("subarea")
    if not module:
        missing_fields.append("module")
    if not batch_num:
         missing_fields.append("batch_num")

    if missing_fields:
        raise ValueError(f"Missing required fields: {', '.join(missing_fields)}")

    try:
        admin_id = int(admin_id)
    except (ValueError, TypeError):
        raise ValueError(f"admin_id must be an integer")

    # Validate batch_status enum if provided
    batch_status = None
    raw_batch_status = data.get("batch_status")
    if raw_batch_status:
        batch_status, status_msg = normalize_training_Batch_status(raw_batch_status)
        if batch_status is None:
            raise ValueError(status_msg)

    # Validate training_mode enum if provided
    training_mode = None
    raw_training_mode = data.get("training_mode")
    if raw_training_mode is not None:
        training_mode, mode_msg = normalize_training_mode(raw_training_mode)
        if training_mode is None:
            raise ValueError(mode_msg)

    # Normalize dates 
    raw_start_date = data.get("start_date")
    raw_end_date   = data.get("end_date")
    start_date = normalize_date(raw_start_date)
    end_date   = normalize_date(raw_end_date)

    if start_date is None:
        start_date = date.today().strftime("%Y-%m-%d")

    engine = get_db_engine()
    schema = os.getenv("DB_SCHEMA")
    logger.info(f"Using schema: {schema}")

    validate_training_batch(
                batch_num=batch_num,
                batch_size=data.get("batch_size"),
                start_date=start_date,
                end_date=end_date,
            )

    with engine.begin() as connection:
        # Step 0: Authorize — only dept/admin/hr roles allowed (checks admin_id)
        check_role_authorization(admin_id, connection, schema)

        # Resolve training_hierarchy_id from area/subarea/module names
        training_hierarchy_id = resolve_training_hierarchy(
            area, sub_area, module, connection, schema,
            area_description=data.get("area_description"),
            sub_area_description=data.get("subarea_description"),
            module_course_level=data.get("module_course_level"),
            module_description=data.get("module_description"),
        )

        # Check whether batch already exists
        existing_batch = connection.execute(
                text(f"""
                    SELECT id
                    FROM "{schema}".training_batches
                    WHERE LOWER(batch_num) = LOWER(:batch_num)
                """),
                {
                    "batch_num": batch_num
                }
            ).fetchone()

        if existing_batch:
            raise ConflictError(f"Training batch '{batch_num}' already exists.")

        insert_query = text(f"""
                            INSERT INTO "{schema}".training_batches
                            (
                                batch_num,
                                training_hierarchy_id,
                                batch_desc,
                                training_quarter,
                                batch_status,
                                batch_status_remarks,
                                start_date,
                                end_date,
                                duration,
                                training_mode,
                                trainer,
                                batch_size,
                                prerequisite,
                                training_content,
                                resources
                            )
                            VALUES
                            (
                                :batch_num,
                                :training_hierarchy_id,
                                :batch_desc,
                                :training_quarter,
                                :batch_status,
                                :batch_status_remarks,
                                :start_date,
                                :end_date,
                                :duration,
                                :training_mode,
                                :trainer,
                                :batch_size,
                                :prerequisite,
                                :content,
                                :resources
                            )
                            RETURNING id
                        """)

        batch_id = connection.execute(
            insert_query,
            {
                "batch_num": batch_num,
                "training_hierarchy_id": training_hierarchy_id,
                "batch_desc": data.get("batch_desc"),
                "training_quarter": data.get("training_quarter"),
                "batch_status": batch_status or "Planned",
                "batch_status_remarks": data.get("batch_status_remarks"),
                "start_date": start_date,
                "end_date": end_date,
                "duration": data.get("duration"),
                "training_mode": training_mode,
                "trainer": data.get("trainer"),
                "batch_size": data.get("batch_size"),
                "prerequisite": data.get("prerequisite"),
                "content": data.get("content"),
                "resources": data.get("resources"),
            }
        ).scalar_one()

        logger.info(
            f"Created training batch (id={batch_id}) by admin_id={admin_id}"
        )

        response_data = {
            "message": "Training batch added successfully",
            "batch_id": batch_id,
            "training_hierarchy_id": training_hierarchy_id,
            "created_by": admin_id,
            "created": True
        }

    return response_data

def update_training_batch(data):
    admin_id = data.get("admin_id")
    batch_num   = data.get("batch_num")
    batch_id   = data.get("batch_id")

    missing_fields = []
    if not admin_id:
        missing_fields.append("admin_id")

    if missing_fields:
        raise ValueError(f"Missing required fields: {', '.join(missing_fields)}")
    
    if not batch_num and not batch_id:
        raise ValueError("Either 'batch_num' or 'batch_id' must be provided.")

    try:
        admin_id = int(admin_id)
    except (ValueError, TypeError):
        raise ValueError(f"admin_id must be an integer")

    # Validate batch_status enum if provided
    batch_status = None
    raw_batch_status = data.get("batch_status")
    if raw_batch_status:
        batch_status, status_msg = normalize_training_Batch_status(raw_batch_status)
        if batch_status is None:
            raise ValueError(status_msg)

    # Validate training_mode enum if provided
    training_mode = None
    raw_training_mode = data.get("training_mode")
    if raw_training_mode is not None:
        training_mode, mode_msg = normalize_training_mode(raw_training_mode)
        if training_mode is None:
            raise ValueError(mode_msg)

    # Normalize dates 
    raw_start_date = data.get("start_date")
    raw_end_date   = data.get("end_date")
    start_date = normalize_date(raw_start_date)
    end_date   = normalize_date(raw_end_date)

    # In case Training hierarchy is changes
    area        = data.get("area", "").strip() if data.get("area") else ""
    sub_area    = data.get("subarea", "").strip() if data.get("subarea") else ""
    module      = data.get("module", "").strip() if data.get("module") else ""

    validate_training_batch(
                batch_num=batch_num,
                batch_size=data.get("batch_size"),
                start_date=start_date,
                end_date=end_date,
            )
    
    engine = get_db_engine()
    schema = os.getenv("DB_SCHEMA")
    logger.info(f"Using schema: {schema}")

    with engine.begin() as connection:
        # Step 0: Authorize — only dept/admin/hr roles allowed (checks admin_id)
        check_role_authorization(admin_id, connection, schema)

        # Resolve training_hierarchy_id from area/subarea/module names — only when at
        # least one is provided, otherwise this would create bogus empty-string rows.
        training_hierarchy_id = None
        if area or sub_area or module:
            training_hierarchy_id = resolve_training_hierarchy(
                area, sub_area, module, connection, schema,
                area_description=data.get("area_description"),
                sub_area_description=data.get("subarea_description"),
                module_course_level=data.get("module_course_level"),
                module_description=data.get("module_description"),
            )

        # Find the existing batch
        normalized_batch_num = batch_num.strip() if batch_num else None
        existing_batch = connection.execute(
            text(f"""
                    SELECT id, batch_num FROM "{schema}".training_batches
                    WHERE
                    (:batch_id IS NOT NULL AND id = :batch_id)
                    OR
                    (:batch_id IS NULL AND LOWER(batch_num) = LOWER(:batch_num))
                """),
                {
                    "batch_id": batch_id,
                    "batch_num": normalized_batch_num
                }
            ).fetchone()

        if not existing_batch:
            raise ConflictError(f"Training batch does not exist.")

        batch_id = existing_batch.id

        updatable_fields = {
            "training_hierarchy_id": training_hierarchy_id if area or sub_area or module else None,
            "batch_desc": data.get("batch_desc"),
            "training_quarter": data.get("training_quarter"),
            "batch_status": batch_status,
            "batch_status_remarks": data.get("batch_status_remarks"),
            "start_date": start_date,
            "end_date": end_date,
            "duration": data.get("duration"),
            "training_mode": training_mode,
            "trainer": data.get("trainer"),
            "batch_size": data.get("batch_size"),
            "prerequisite": data.get("prerequisite"),
            "training_content": data.get("content"),
            "resources": data.get("resources"),
        }

        # Fields the client can clear by sending null. batch_status and
        # training_hierarchy_id are never cleared.
        nullable_fields = {
            "batch_desc", "training_quarter", "batch_status_remarks", "start_date", "end_date",
            "duration", "training_mode", "trainer", "batch_size",
            "prerequisite", "training_content", "resources",
        }

        updates = []
        params = {"batch_id": batch_id}

        for field, value in updatable_fields.items():
            # The DB column is training_content, but the JSON key is "content".
            payload_key = "content" if field == "training_content" else field
            if payload_key in data or (
                field == "training_hierarchy_id"
                and updatable_fields["training_hierarchy_id"] is not None
            ):
                # Sending null clears the value (only for fields in nullable_fields).
                if value is not None or field in nullable_fields:
                    updates.append(f"{field} = :{field}")
                    params[field] = value

        # Found by batch_id with a different batch_num means a rename.
        # Stop if another batch already uses that name.
        new_batch_num = normalized_batch_num
        if new_batch_num and new_batch_num != existing_batch.batch_num:
            duplicate = connection.execute(
                text(f"""
                    SELECT id FROM "{schema}".training_batches
                    WHERE LOWER(TRIM(batch_num)) = LOWER(TRIM(:batch_num))
                      AND id != :batch_id
                """),
                {"batch_num": new_batch_num, "batch_id": batch_id},
            ).fetchone()
            if duplicate:
                raise ConflictError(f"Training batch '{new_batch_num}' already exists.")
            updates.append("batch_num = :batch_num")
            params["batch_num"] = new_batch_num

        if not updates:
            raise ValueError("No Training Batch fields supplied to update.")
        
        # Always update timestamp
        updates.append("updated_at = CURRENT_TIMESTAMP")

        update_sql = f"""
                UPDATE "{schema}".training_batches
                SET {", ".join(updates)}
                WHERE id = :batch_id
            """
        connection.execute(text(update_sql), params)

        logger.info(
            f"Updated training batch (id={batch_id}) by admin_id={admin_id}"
        )

        response_data = {
            "message": "Training batch updated successfully",
            "batch_id": batch_id,
            "batch_num": params.get("batch_num", existing_batch.batch_num),
            "updated_by": admin_id,
            "updated": True,
        }


    return response_data


def delete_training_batch(data):
     
    admin_id = data.get("admin_id")
    batch_id = data.get("batch_id")

    missing_fields = []
    if not admin_id:
        missing_fields.append("admin_id")
    if not batch_id:
        missing_fields.append("batch_id")
    
    if missing_fields:
        raise ValueError(f"Missing required fields: {', '.join(missing_fields)}")

    try:
        admin_id = int(admin_id)
    except (ValueError, TypeError):
        raise ValueError(f"admin_id must be an integer")
    
    try:
        batch_id = int(batch_id)
    except (ValueError, TypeError):
        raise ValueError(f"batch_id must be an integer")

    engine = get_db_engine()
    schema = os.getenv("DB_SCHEMA")
    logger.info(f"Using schema: {schema}")

    with engine.begin() as connection:
        # Step 0: Authorize — only dept/admin/hr roles allowed (checks admin_id)
        check_role_authorization(admin_id, connection, schema)

        # Step 1: Check the batch exists
        existing = connection.execute(
            text(f'SELECT id, batch_num FROM "{schema}".training_batches WHERE id = :id'),
            {"id": batch_id}
        ).fetchone()

        if not existing:
            raise ValueError(f"Training batch with id {batch_id} not found")

        # Step 2: Refuse if employee_trainings records still reference this batch
        usage_count = connection.execute(
            text(f'SELECT COUNT(*) FROM "{schema}".employee_trainings WHERE batch_id = :batch_id'),
            {"batch_id": batch_id}
        ).scalar()


        if usage_count:
            # Name the batch by its user-facing number, not the internal id, and
            # carry the count so the API layer can expose it in the 409 body.
            err = ConflictError(
                f"Training batch '{existing.batch_num}' cannot be deleted because "
                f"{usage_count} employee training record(s) are associated with it."
            )
            err.employee_training_count = usage_count
            raise err
            
        # Step 3: Delete the batch
        connection.execute(
            text(f'DELETE FROM "{schema}".training_batches WHERE id = :id'),
            {"id": batch_id}
        )
        logger.info(f"Deleted training batch (id={batch_id}) by admin_id={admin_id}")

        response_data = {
        "message": "Training batch deleted successfully",
        "batch_id": batch_id,
        "deleted": True,
    }

    return response_data