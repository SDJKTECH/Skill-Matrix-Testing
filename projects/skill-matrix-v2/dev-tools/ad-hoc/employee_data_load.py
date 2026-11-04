"""
Usage:
    python employee_data_load.py <path-to-employee-csv> [--output-folder <folder>] [--dry-run]

    --output-folder   Where to write the validation report (defaults to the CSV's own folder).
    --dry-run         Run all DB logic then roll back instead of committing (no data is persisted).

    DB connection is read from backend/.env (DB_HOST, DB_USER, DB_PASS, DB_NAME, DB_SCHEMA, DB_PORT).
    Examples:
        python employee_data_load.py "C:\\path\\to\\Employee Data.csv" --dry-run
        python employee_data_load.py "C:\\path\\to\\Employee Data.csv" --output-folder "C:\\reports"
"""

import argparse
import os
from pathlib import Path
from datetime import datetime
import pandas as pd
import logging
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool
from urllib.parse import quote_plus

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

load_dotenv(Path(__file__).parent.parent.parent / "backend" / ".env")


REQUIRED_COLUMNS = [
    "Employee Number",
    "Full Name",
    "Work Email",
    "Department",
    "Job Title",
    "Manager Email ID",
    "Manager (TRUE/FALSE)"
        ]

def normalize(value):
    if pd.isna(value):
        return None

    value = str(value).strip()
    return value if value else None


def format_emp_id(value):
    if not value:
        return value

    return value.strip().zfill(6)

def get_db_engine():
    """Create and return a SQLAlchemy engine using environment variables."""
    db_user = quote_plus(os.getenv("DB_USER", ""))
    db_pass = quote_plus(os.getenv("DB_PASS", ""))
    db_name = os.getenv("DB_NAME", "")
    db_host = os.getenv("DB_HOST", "")
    db_port = os.getenv("DB_PORT", "5432")

    db_url = f"postgresql+psycopg2://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}"

    engine = create_engine(db_url, poolclass=NullPool, future=True)
    return engine


def read_employee_data(csv_file_path):

    try:
        df = pd.read_csv(csv_file_path, encoding="utf-8", dtype=str)
    except UnicodeDecodeError:
        df = pd.read_csv(csv_file_path, encoding="cp1252", dtype=str)

    df.columns = [c.strip() for c in df.columns]

    total_rows = len(df)

    employees = []
    errors = []

    # Validate required columns
    missing = [
        c
        for c in REQUIRED_COLUMNS
        if c not in df.columns
    ]

    if missing:
        errors.append(
            {
                "Row": "",
                "Employee Number": "",
                "Email": "",
                "Severity": "Error",
                "Error": f"Missing required columns: {', '.join(missing)}",
            }
        )
        return employees, errors, total_rows

    seen_email = set()
    seen_emp_id = set()

    for row_num, (_, row) in enumerate(df.iterrows(), start=2):

        emp_id = format_emp_id(normalize(row["Employee Number"]))
        email = normalize(row["Work Email"])

        if not emp_id:
            errors.append({
                "Row": row_num,
                "Employee Number": emp_id,
                "Email": email,
                "Error": f"Row {row_num}: Employee Number is required."
            })
            continue


        if not email:
            errors.append({
                "Row": row_num,
                "Employee Number": emp_id,
                "Email": email,
                "Error": f"Row {row_num}: Work Email is required."
            })
            continue

        email = email.lower()

        # Duplicate validations
        
        if emp_id in seen_emp_id:
            errors.append(
                {
                    "Row": row_num,
                    "Employee Number": emp_id,
                    "Email": email,
                    "Severity": "Error",
                    "Error": "Duplicate Employee Number found in CSV.",
                }
            )
            continue

        if email in seen_email:
            errors.append(
                {
                    "Row": row_num,
                    "Employee Number": emp_id,
                    "Email": email,
                    "Severity": "Error",
                    "Error": "Duplicate Work Email found in CSV.",
                }
            )
            continue

        seen_emp_id.add(emp_id)
        seen_email.add(email)

        manager_email = normalize(row["Manager Email ID"])

        if manager_email and manager_email.lower() == "not available":
            manager_email = None
        else:
            manager_email = manager_email.lower() if manager_email else None

        employees.append(
            {
                "emp_id": emp_id,
                "name": normalize(row["Full Name"]),
                "email": email,
                "department": normalize(row["Department"]),
                "job_title": normalize(row["Job Title"]),
                "manager_email": manager_email,
                "role": "User",
                "is_manager":
                    normalize(
                        row["Manager (TRUE/FALSE)"]
                    ).upper() == "TRUE"
                    if normalize(
                        row["Manager (TRUE/FALSE)"]
                    )
                    else False,
            }
        )

    return employees, errors, total_rows


def save_employees(employee_data, engine, schema, dry_run=False):

    warnings = []
    existing_count = 0

    fetch_all_sql = text(f"""
        SELECT id, LOWER(TRIM(email)) AS email
        FROM "{schema}".employee;
    """)

    upsert_sql = text(f"""
        INSERT INTO "{schema}".employee AS e
        (
            emp_id,
            name,
            email,
            department,
            job_title,
            is_manager,
            role
        )
        VALUES
        (
            :emp_id,
            :name,
            :email,
            :department,
            :job_title,
            :is_manager,
            :role
        )

        ON CONFLICT (email) DO UPDATE
        SET
            name = EXCLUDED.name,
            department = EXCLUDED.department,
            job_title = EXCLUDED.job_title,
            is_manager = EXCLUDED.is_manager,
            role = CASE
                WHEN e.role IS NULL OR TRIM(e.role::text) = '' THEN 'User'
                ELSE e.role
            END
        RETURNING id, email, (xmax = 0) AS inserted;
    """)

    update_manager_sql = text(f"""
        UPDATE "{schema}".employee AS e
        SET reports_to = v.manager_id
        FROM UNNEST(
            CAST(:emp_ids AS int[]),
            CAST(:manager_ids AS int[])
        ) AS v(emp_id, manager_id)
        WHERE e.id = v.emp_id;
    """)

    with engine.connect() as conn:
        trans = conn.begin()

        # Prefetch existing employees once instead of a per-row lookup.
        email_to_id = {
            row.email: row.id
            for row in conn.execute(fetch_all_sql)
        }

        #
        # PASS 1 - find employee by email and update it; create it if not found
        #
        for emp in employee_data:
            row = conn.execute(upsert_sql, emp).fetchone()
            if row is not None:
                email_to_id[row.email.strip().lower()] = row.id
                if not row.inserted:
                    existing_count = existing_count + 1

        #
        # PASS 2
        #
        emp_ids = []
        manager_ids = []

        for emp in employee_data:

            manager_email = emp.get("manager_email")
            emp_id = email_to_id.get(emp["email"])

            if emp_id is None:
                warnings.append(
                    {
                        "Severity": "Warning",
                        "Row": "",
                        "Employee Number": emp["emp_id"],
                        "Email": emp["email"],
                        "Error":
                            "Employee record was not found/created, skipping reporting manager assignment."
                    }
                )
                continue

            if not manager_email:
                # No manager specified in the file (blank / "Not available") -
                # clear any existing reporting manager for this employee.
                emp_ids.append(emp_id)
                manager_ids.append(None)
                continue

            if manager_email == emp["email"]:
                warnings.append(
                    {
                        "Severity": "Warning",
                        "Row": "",
                        "Employee Number": emp["emp_id"],
                        "Email": emp["email"],
                        "Error": "Employee cannot be their own reporting manager.",
                    }
                )
                continue

            manager_id = email_to_id.get(manager_email)

            if manager_id is None:
                warnings.append(
                    {
                        "Severity": "Warning",
                        "Row": "",
                        "Employee Number": emp["emp_id"],
                        "Email": emp["email"],
                        "Error": f"Reporting manager '{manager_email}' does not exist."
                    }
                )
                continue

            emp_ids.append(emp_id)
            manager_ids.append(manager_id)

        if emp_ids:
            conn.execute(
                update_manager_sql,
                {"emp_ids": emp_ids, "manager_ids": manager_ids},
            )

        if dry_run:
            trans.rollback()
            logger.info("Dry run: transaction rolled back, no changes were persisted.")
        else:
            trans.commit()

    return warnings,existing_count


def generate_validation_report(
    output_folder,
    total_rows,
    valid_rows,
    error_rows,
    warning_rows,
    existing_emp_cnt,
    errors):

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    summary_path = os.path.join(
        output_folder,
        f"Employee_Upload_Report_{timestamp}_summary.csv"
    )

    errors_path = os.path.join(
        output_folder,
        f"Employee_Upload_Report_{timestamp}_errors.csv"
    )

    summary = pd.DataFrame([
        {
            "Metric": "Total Records",
            "Value": total_rows
        },
        {
            "Metric": "Valid Records",
            "Value": valid_rows
        },
        {
            "Metric": "Invalid Records",
            "Value": error_rows
        },
        {
            "Metric": "Warnings",
            "Value": warning_rows
        },
        {
            "Metric": "Existing Employees",
            "Value": existing_emp_cnt
        },
        {
            "Metric": "Upload Status",
            "Value": (
                "SUCCESS"
                if error_rows == 0
                else "PARTIAL SUCCESS"
            )
        }
    ])

    error_df = pd.DataFrame(errors)

    summary.to_csv(summary_path, index=False)
    error_df.to_csv(errors_path, index=False)

    return summary_path, errors_path

def main():
    parser = argparse.ArgumentParser(
        description="Load/update employee data from a CSV file into the Skill Matrix database."
    )
    parser.add_argument(
        "input_file",
        help="Path to the Employee Data CSV file to load."
    )
    parser.add_argument(
        "--output-folder",
        help="Folder to write the validation report to (defaults to the input file's folder).",
        default=None
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate and run all DB logic, then roll back instead of committing."
    )
    args = parser.parse_args()

    input_file_path = Path(args.input_file)
    output_folder = Path(args.output_folder) if args.output_folder else input_file_path.parent

    engine = get_db_engine()
    schema = os.getenv("DB_SCHEMA") or "skill_matrix_v2_dev"

    employee_data, errors, total_rows = read_employee_data(input_file_path)

    valid_rows = len(employee_data)
    error_rows = len(errors)

    warnings, existing_emp_cnt = save_employees(employee_data, engine, schema, dry_run=args.dry_run)

    errors.extend(warnings)
    warning_rows = len(warnings)

    summary_path, errors_path = generate_validation_report(
        output_folder=output_folder,
        total_rows=total_rows,
        valid_rows=valid_rows,
        error_rows=error_rows,
        warning_rows=warning_rows,
        existing_emp_cnt=existing_emp_cnt,
        errors=errors
    )

    print(f"Summary report: {summary_path}")
    print(f"Errors report: {errors_path}")


if __name__ == "__main__":
    main()