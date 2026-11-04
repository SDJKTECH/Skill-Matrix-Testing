"""
Backfill script for master_framework.

Reads dev-tools/docs/master_framework_content_fixes.csv and, for each framework_name
found in the target schema, updates only the columns (description/basic/
intermediate/expert) that have a non-blank value in the CSV. Blank CSV cells
are left untouched in the DB.

Defaults to a dry run (no writes) - pass --apply to actually commit changes.
Target schema comes from DB_SCHEMA in backend/.env (falls back to
skill_matrix_v2_dev if unset), same as the other dev-tools/ad-hoc scripts.

Usage:
    python dev-tools/ad-hoc/master_framework_datafix.py
    python dev-tools/ad-hoc/master_framework_datafix.py --apply
"""

import argparse
import os
from datetime import datetime
from pathlib import Path
from urllib.parse import quote_plus

import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool

FIELDS = ["description", "basic", "intermediate", "expert"]

load_dotenv(Path(__file__).parent.parent.parent / "backend" / ".env")


def get_db_engine():
    db_user = quote_plus(os.getenv("DB_USER", ""))
    db_pass = quote_plus(os.getenv("DB_PASS", ""))
    db_name = os.getenv("DB_NAME", "")
    db_host = os.getenv("DB_HOST", "")
    db_port = os.getenv("DB_PORT", "5432")

    db_url = f"postgresql+psycopg2://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}"
    return create_engine(db_url, poolclass=NullPool, future=True)


def normalize(value):
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    value = str(value).strip()
    return value if value else None


def read_fixes(csv_file_path):
    df = pd.read_csv(csv_file_path, encoding="utf-8-sig", dtype=str)
    df.columns = [c.strip() for c in df.columns]

    missing = [c for c in ["framework_name"] + FIELDS if c not in df.columns]
    if missing:
        raise ValueError(f"CSV is missing required columns: {', '.join(missing)}")

    fixes = []
    for _, row in df.iterrows():
        name = normalize(row["framework_name"])
        if not name:
            continue
        fixes.append({
            "framework_name": name,
            **{field: normalize(row[field]) for field in FIELDS},
        })
    return fixes


def backfill(fixes, engine, schema, apply_changes):
    report_rows = []

    fetch_sql = text(f"""
        SELECT id, framework_name, description, basic, intermediate, expert
        FROM "{schema}".master_framework
        WHERE framework_name = ANY(:names);
    """)

    names = [f["framework_name"] for f in fixes]

    with engine.connect() as conn:
        existing = {
            row.framework_name: row
            for row in conn.execute(fetch_sql, {"names": names})
        }

    with engine.begin() as conn:
        for fix in fixes:
            name = fix["framework_name"]
            current = existing.get(name)

            if current is None:
                report_rows.append({
                    "framework_name": name,
                    "field": "",
                    "old_value": "",
                    "new_value": "",
                    "status": "SKIPPED - framework_name not found in schema",
                })
                continue

            set_clauses = []
            params = {"id": current.id}

            for field in FIELDS:
                new_value = fix[field]
                if new_value is None:
                    continue  # blank in CSV -> leave this field untouched

                old_value = getattr(current, field)
                set_clauses.append(f"{field} = :{field}")
                params[field] = new_value

                report_rows.append({
                    "framework_name": name,
                    "field": field,
                    "old_value": old_value or "",
                    "new_value": new_value,
                    "status": "UPDATED" if apply_changes else "WOULD UPDATE (dry run)",
                })

            if not set_clauses:
                continue

            if apply_changes:
                update_sql = text(f"""
                    UPDATE "{schema}".master_framework
                    SET {", ".join(set_clauses)}, updated_at = now()
                    WHERE id = :id;
                """)
                conn.execute(update_sql, params)

        if not apply_changes:
            conn.rollback()

    return report_rows


def write_report(report_rows, output_folder, schema, apply_changes):
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    mode = "applied" if apply_changes else "dryrun"
    report_path = os.path.join(
        output_folder,
        f"master_framework_backfill_{schema}_{mode}_{timestamp}.csv",
    )
    pd.DataFrame(report_rows).to_csv(report_path, index=False)
    return report_path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--csv",
        default="dev-tools/docs/master_framework_content_fixes.csv",
        help="Path to the fixes CSV (default: dev-tools/docs/master_framework_content_fixes.csv)",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually commit the updates. Without this flag, the script runs "
             "as a dry run and only writes a report of what WOULD change.",
    )
    args = parser.parse_args()

    schema = os.getenv("DB_SCHEMA") or "skill_matrix_v2_dev"

    fixes = read_fixes(args.csv)
    print(f"Loaded {len(fixes)} framework rows from {args.csv}")

    engine = get_db_engine()
    report_rows = backfill(fixes, engine, schema, args.apply)

    updated = sum(1 for r in report_rows if r["status"] == "UPDATED")
    would_update = sum(1 for r in report_rows if r["status"].startswith("WOULD UPDATE"))
    not_found = sum(1 for r in report_rows if r["status"].startswith("SKIPPED"))

    report_path = write_report(report_rows, os.path.dirname(args.csv) or ".", schema, args.apply)

    print(f"Schema: {schema}")
    print(f"Mode: {'APPLY (committed)' if args.apply else 'DRY RUN (no changes committed)'}")
    print(f"Fields updated: {updated}")
    print(f"Fields that would update (dry run): {would_update}")
    print(f"Frameworks not found in schema: {not_found}")
    print(f"Report: {report_path}")


if __name__ == "__main__":
    main()
