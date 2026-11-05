import os
import sys
import argparse
from datetime import datetime
from pathlib import Path

import psycopg2
from tabulate import tabulate
from dotenv import load_dotenv

# Setup paths
BASE_DIR = Path(__file__).parent.parent.parent.parent  # dev-tools/ad-hoc/schema-utils/<file> -> repo root
SCRIPT_DIR = Path(__file__).parent
LOCAL_ENV = SCRIPT_DIR / ".env"
BACKEND_ENV = BASE_DIR / "backend" / ".env"
DEFAULT_OUTPUT = SCRIPT_DIR / "schema_comparison_report.txt"

# Load env files (local takes precedence)
load_dotenv(BACKEND_ENV)
load_dotenv(LOCAL_ENV, override=True)


# ─────────────────────── Credential Helpers ───────────────────────

def get_src_connection():
    """Connect using SRC_DB_* env vars (all required)."""
    creds = {
        "host":     os.getenv("SRC_DB_HOST"),
        "user":     os.getenv("SRC_DB_USER"),
        "password": os.getenv("SRC_DB_PASS"),
        "dbname":   os.getenv("SRC_DB_NAME"),
        "port":     os.getenv("SRC_DB_PORT", "5432"),
    }
    missing = [k for k, v in creds.items() if not v]
    if missing:
        print(f"Error: Missing SOURCE DB config: {', '.join(missing)}")
        sys.exit(1)
    try:
        return psycopg2.connect(**creds), creds
    except Exception as e:
        print(f"Error connecting to source DB: {e}")
        sys.exit(1)


def get_dest_connection():
    """Connect using DEST_DB_* env vars (all required)."""
    creds = {
        "host":     os.getenv("DEST_DB_HOST"),
        "user":     os.getenv("DEST_DB_USER"),
        "password": os.getenv("DEST_DB_PASS"),
        "dbname":   os.getenv("DEST_DB_NAME"),
        "port":     os.getenv("DEST_DB_PORT", "5432"),
    }
    missing = [k for k, v in creds.items() if not v]
    if missing:
        print(f"Error: Missing DESTINATION DB config: {', '.join(missing)}")
        sys.exit(1)
    try:
        return psycopg2.connect(**creds), creds
    except Exception as e:
        print(f"Error connecting to destination DB: {e}")
        sys.exit(1)


def is_same_database(src_creds, dest_creds):
    return (
        src_creds["host"] == dest_creds["host"]
        and src_creds["port"] == dest_creds["port"]
        and src_creds["dbname"] == dest_creds["dbname"]
    )


# ─────────────────────── Schema Introspection ───────────────────────

def get_schema_details(conn, schema_name):
    """Fetch tables, columns, constraints, plain indexes and enum types for a schema."""
    cursor = conn.cursor()

    cursor.execute("""
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = %s AND table_type = 'BASE TABLE'
        ORDER BY table_name;
    """, (schema_name,))
    tables = [row[0] for row in cursor.fetchall()]

    cursor.execute("""
        SELECT table_name, column_name, data_type, is_nullable, character_maximum_length
        FROM information_schema.columns
        WHERE table_schema = %s
        ORDER BY table_name, ordinal_position;
    """, (schema_name,))
    columns = {}
    for table_name, column_name, data_type, is_nullable, char_len in cursor.fetchall():
        columns.setdefault(table_name, {})[column_name] = {
            "data_type": data_type,
            "is_nullable": is_nullable,
            "char_len": char_len,
        }

    # Constraints (PK / FK / UNIQUE). Pulled from pg_constraint rather than
    # information_schema: joining key_column_usage to constraint_column_usage
    # by constraint_name alone (no positional match) cross-products composite
    # constraints, and pg_get_constraintdef already gives a ready-made,
    # correctly-paired human-readable definition.
    cursor.execute("""
        SELECT t.relname AS table_name, c.conname, c.contype, pg_get_constraintdef(c.oid) AS definition
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        JOIN pg_namespace n ON t.relnamespace = n.oid
        WHERE n.nspname = %s AND c.contype IN ('p', 'f', 'u', 'c')
        ORDER BY t.relname, c.conname;
    """, (schema_name,))
    contype_labels = {"p": "PRIMARY KEY", "f": "FOREIGN KEY", "u": "UNIQUE", "c": "CHECK"}
    constraints = {}
    for table_name, conname, contype, definition in cursor.fetchall():
        # Strip the schema qualifier so definitions compare equal across
        # differently-named schemas (e.g. prod vs uat) and read more cleanly.
        clean_def = definition.replace(f"{schema_name}.", "")
        constraints.setdefault(table_name, []).append({
            "name": conname,
            "type": contype_labels.get(contype, contype),
            "definition": clean_def,
        })

    # Plain indexes only — indexes backing a PK/UNIQUE constraint are already
    # covered by the constraint comparison above, so exclude them here to
    # avoid reporting the same difference twice.
    cursor.execute("""
        SELECT t.relname AS table_name, i.relname AS index_name, a.attname AS column_name
        FROM pg_class t, pg_class i, pg_index ix, pg_attribute a, pg_namespace n
        WHERE t.oid = ix.indrelid
          AND i.oid = ix.indexrelid
          AND a.attrelid = t.oid
          AND a.attnum = ANY(ix.indkey)
          AND t.relnamespace = n.oid
          AND n.nspname = %s
          AND NOT ix.indisprimary
          AND NOT ix.indisunique
        ORDER BY t.relname, i.relname, a.attnum;
    """, (schema_name,))
    indexes = {}
    for table_name, index_name, column_name in cursor.fetchall():
        indexes.setdefault(table_name, {}).setdefault(index_name, []).append(column_name)

    cursor.execute("""
        SELECT t.typname, e.enumlabel
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        JOIN pg_namespace n ON t.typnamespace = n.oid
        WHERE n.nspname = %s
        ORDER BY t.typname, e.enumsortorder;
    """, (schema_name,))
    enums = {}
    for type_name, label in cursor.fetchall():
        enums.setdefault(type_name, []).append(label)

    # Triggers, keyed per table by name.
    cursor.execute("""
        SELECT c.relname, t.tgname, pg_get_triggerdef(t.oid, true)
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = %s AND NOT t.tgisinternal;
    """, (schema_name,))
    triggers = {}
    for table_name, tgname, trigdef in cursor.fetchall():
        clean_def = trigdef.replace(f"{schema_name}.", "")
        triggers.setdefault(table_name, {})[tgname] = clean_def

    # Functions, keyed globally by (name, args).
    cursor.execute("""
        SELECT p.proname, pg_get_function_identity_arguments(p.oid), pg_get_functiondef(p.oid)
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = %s AND p.prokind = 'f';
    """, (schema_name,))
    functions = {}
    for proname, args, funcdef in cursor.fetchall():
        clean_args = args.replace(f"{schema_name}.", "")
        clean_def = funcdef.replace(f"{schema_name}.", "")
        functions[(proname, clean_args)] = clean_def

    # Views: compares body via pg_get_viewdef, not just existence.
    cursor.execute("SELECT viewname, definition FROM pg_views WHERE schemaname = %s;", (schema_name,))
    views = {}
    for viewname, definition in cursor.fetchall():
        views[viewname] = definition.replace(f"{schema_name}.", "")

    # Table/view/column comments, plus function comments below.
    cursor.execute("""
        SELECT c.relkind, c.relname, d.objsubid, a.attname, d.description
        FROM pg_description d
        JOIN pg_class c ON c.oid = d.objoid
        LEFT JOIN pg_attribute a ON a.attrelid = d.objoid AND a.attnum = d.objsubid AND d.objsubid > 0
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = %s AND d.classoid = 'pg_class'::regclass;
    """, (schema_name,))
    comments = {}
    for relkind, relname, objsubid, attname, description in cursor.fetchall():
        if objsubid == 0:
            label = f"{'VIEW' if relkind in ('v', 'm') else 'TABLE'}:{relname}"
        else:
            label = f"COLUMN:{relname}.{attname}"
        comments[label] = description

    cursor.execute("""
        SELECT p.proname, pg_get_function_identity_arguments(p.oid), d.description
        FROM pg_description d
        JOIN pg_proc p ON p.oid = d.objoid
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = %s AND d.classoid = 'pg_proc'::regclass;
    """, (schema_name,))
    for proname, args, description in cursor.fetchall():
        comments[f"FUNCTION:{proname}({args.replace(f'{schema_name}.', '')})"] = description

    cursor.close()
    return {
        "tables": tables,
        "columns": columns,
        "constraints": constraints,
        "indexes": indexes,
        "enums": enums,
        "triggers": triggers,
        "functions": functions,
        "views": views,
        "comments": comments,
    }


# ─────────────────────── Formatting Helpers ───────────────────────

def _const_signature(c):
    # Name matters too -- same definition under a different name is real
    # drift, not a match, same as indexes below.
    return (c["name"], c["type"], c["definition"])


def _format_constraint(c):
    return f'{c["name"]}: {c["definition"]}'


def _section(lines, title):
    lines.append("-" * 80)
    lines.append(f" {title}")
    lines.append("-" * 80)


# ─────────────────────── Comparison ───────────────────────

def compare_schemas(s1, s2, output_file):
    """Compare schema s1 (source) against s2 (destination) and write a report.

    Returns True if the schemas match, False if any differences were found.
    """
    src_conn, src_creds = get_src_connection()
    dest_conn, dest_creds = get_dest_connection()
    same_db = is_same_database(src_creds, dest_creds)

    print(f"Source:      {src_creds['host']}:{src_creds['port']}/{src_creds['dbname']}  schema='{s1}'")
    print(f"Destination: {dest_creds['host']}:{dest_creds['port']}/{dest_creds['dbname']}  schema='{s2}'")
    print(f"Mode:        {'SAME-DATABASE' if same_db else 'CROSS-DATABASE'}")
    print()

    try:
        print(f"Fetching details for '{s1}'...")
        src_data = get_schema_details(src_conn, s1)

        print(f"Fetching details for '{s2}'...")
        dest_conn_to_use = src_conn if same_db else dest_conn
        dest_data = get_schema_details(dest_conn_to_use, s2)
    finally:
        src_conn.close()
        dest_conn.close()

    if not src_data["tables"]:
        print(f"Warning: schema '{s1}' has no tables — check the schema name is correct.")
    if not dest_data["tables"]:
        print(f"Warning: schema '{s2}' has no tables — check the schema name is correct.")

    common_tables = [t for t in src_data["tables"] if t in dest_data["tables"]]
    missing_tables = [t for t in src_data["tables"] if t not in dest_data["tables"]]
    extra_tables = [t for t in dest_data["tables"] if t not in src_data["tables"]]

    # --- Columns ---
    column_rows = []
    for table in common_tables:
        c1 = src_data["columns"].get(table, {})
        c2 = dest_data["columns"].get(table, {})
        for col, meta in c1.items():
            if col not in c2:
                column_rows.append([table, col, "missing in destination"])
                continue
            other = c2[col]
            diffs = []
            if meta["data_type"] != other["data_type"]:
                diffs.append(f"type: {meta['data_type']} vs {other['data_type']}")
            if meta["is_nullable"] != other["is_nullable"]:
                diffs.append(f"nullable: {meta['is_nullable']} vs {other['is_nullable']}")
            if meta["char_len"] != other["char_len"]:
                diffs.append(f"length: {meta['char_len']} vs {other['char_len']}")
            if diffs:
                column_rows.append([table, col, "; ".join(diffs)])
        for col in c2:
            if col not in c1:
                column_rows.append([table, col, "extra in destination"])

    # --- Constraints (PK / FK / UNIQUE) ---
    constraint_rows = []
    for table in common_tables:
        s1_sigs = {_const_signature(c): c for c in src_data["constraints"].get(table, [])}
        s2_sigs = {_const_signature(c): c for c in dest_data["constraints"].get(table, [])}
        for sig, c in s1_sigs.items():
            if sig not in s2_sigs:
                constraint_rows.append([table, _format_constraint(c), "missing in destination"])
        for sig, c in s2_sigs.items():
            if sig not in s1_sigs:
                constraint_rows.append([table, _format_constraint(c), "extra in destination"])

    # --- Indexes ---
    index_rows = []
    for table in common_tables:
        i1 = src_data["indexes"].get(table, {})
        i2 = dest_data["indexes"].get(table, {})
        for name, cols in i1.items():
            if name not in i2:
                index_rows.append([table, name, f"({', '.join(cols)})", "missing in destination"])
            elif sorted(cols) != sorted(i2[name]):
                index_rows.append([table, name, f"({', '.join(cols)}) vs ({', '.join(i2[name])})", "column mismatch"])
        for name, cols in i2.items():
            if name not in i1:
                index_rows.append([table, name, f"({', '.join(cols)})", "extra in destination"])

    # --- Enum types ---
    enum_rows = []
    for name in sorted(set(src_data["enums"]) | set(dest_data["enums"])):
        l1 = src_data["enums"].get(name)
        l2 = dest_data["enums"].get(name)
        if l1 is None:
            enum_rows.append([name, ", ".join(l2), "missing in source"])
        elif l2 is None:
            enum_rows.append([name, ", ".join(l1), "missing in destination"])
        elif l1 != l2:
            enum_rows.append([name, f"{', '.join(l1)}  vs  {', '.join(l2)}", "labels differ"])

    # --- Triggers ---
    trigger_rows = []
    for table in common_tables:
        t1 = src_data["triggers"].get(table, {})
        t2 = dest_data["triggers"].get(table, {})
        for name, definition in t1.items():
            if name not in t2:
                trigger_rows.append([table, name, "missing in destination"])
            elif definition != t2[name]:
                trigger_rows.append([table, name, "definition differs"])
        for name, definition in t2.items():
            if name not in t1:
                trigger_rows.append([table, name, "extra in destination"])

    # --- Functions ---
    function_rows = []
    for key in sorted(set(src_data["functions"]) | set(dest_data["functions"])):
        d1 = src_data["functions"].get(key)
        d2 = dest_data["functions"].get(key)
        label = f"{key[0]}({key[1]})"
        if d1 is None:
            function_rows.append([label, "missing in source"])
        elif d2 is None:
            function_rows.append([label, "missing in destination"])
        elif d1 != d2:
            function_rows.append([label, "definition differs"])

    # --- Views ---
    view_rows = []
    for name in sorted(set(src_data["views"]) | set(dest_data["views"])):
        d1 = src_data["views"].get(name)
        d2 = dest_data["views"].get(name)
        if d1 is None:
            view_rows.append([name, "missing in source"])
        elif d2 is None:
            view_rows.append([name, "missing in destination"])
        elif d1 != d2:
            view_rows.append([name, "definition differs"])

    # --- Comments ---
    comment_rows = []
    for key in sorted(set(src_data["comments"]) | set(dest_data["comments"])):
        d1 = src_data["comments"].get(key)
        d2 = dest_data["comments"].get(key)
        if d1 is None:
            comment_rows.append([key, "missing in source"])
        elif d2 is None:
            comment_rows.append([key, "missing in destination"])
        elif d1 != d2:
            comment_rows.append([key, "text differs"])

    checks = {
        "Tables": not missing_tables and not extra_tables,
        "Columns": not column_rows,
        "Constraints (PK/FK/UNIQUE/CHECK)": not constraint_rows,
        "Indexes": not index_rows,
        "Enum types": not enum_rows,
        "Triggers": not trigger_rows,
        "Functions": not function_rows,
        "Views": not view_rows,
        "Comments": not comment_rows,
    }
    overall_ok = all(checks.values())
    summary_rows = [[name, "OK" if ok else "MISMATCH"] for name, ok in checks.items()]

    # ─────────────────────── Build report ───────────────────────

    lines = []
    lines.append("=" * 80)
    lines.append("DATABASE SCHEMA COMPARISON REPORT")
    lines.append("=" * 80)
    lines.append(f"Generated:    {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append(f"Source:       {src_creds['host']}:{src_creds['port']}/{src_creds['dbname']}  ->  schema '{s1}'")
    lines.append(f"Destination:  {dest_creds['host']}:{dest_creds['port']}/{dest_creds['dbname']}  ->  schema '{s2}'")
    lines.append(f"Mode:         {'SAME-DATABASE' if same_db else 'CROSS-DATABASE'}")
    lines.append("")

    _section(lines, "SUMMARY")
    lines.append(tabulate(summary_rows, headers=["Check", "Result"], tablefmt="grid"))
    lines.append("")
    lines.append(f"Overall result: {'OK — schemas match' if overall_ok else 'MISMATCH — differences found'}")
    lines.append("")

    _section(lines, "1. TABLES")
    lines.append(f"{len(common_tables)} common, {len(missing_tables)} missing in destination, "
                 f"{len(extra_tables)} extra in destination.")
    if missing_tables:
        lines.append(f"Missing in '{s2}': {', '.join(missing_tables)}")
    if extra_tables:
        lines.append(f"Extra in '{s2}': {', '.join(extra_tables)}")
    if not missing_tables and not extra_tables:
        lines.append("All tables match.")
    lines.append("")

    _section(lines, "2. COLUMNS")
    if column_rows:
        lines.append(tabulate(column_rows, headers=["Table", "Column", "Issue"], tablefmt="grid"))
    else:
        lines.append("All columns match on common tables.")
    lines.append("")

    _section(lines, "3. CONSTRAINTS (PRIMARY KEY / FOREIGN KEY / UNIQUE / CHECK)")
    if constraint_rows:
        lines.append(tabulate(constraint_rows, headers=["Table", "Constraint", "Status"], tablefmt="grid"))
    else:
        lines.append("All constraints match on common tables.")
    lines.append("")

    _section(lines, "4. INDEXES (excluding indexes backing PK/UNIQUE constraints)")
    if index_rows:
        lines.append(tabulate(index_rows, headers=["Table", "Index", "Columns", "Status"], tablefmt="grid"))
    else:
        lines.append("All indexes match on common tables.")
    lines.append("")

    _section(lines, "5. ENUM TYPES")
    if enum_rows:
        lines.append(tabulate(enum_rows, headers=["Enum Type", "Labels", "Status"], tablefmt="grid"))
    else:
        lines.append("All enum types match.")
    lines.append("")

    _section(lines, "6. TRIGGERS")
    if trigger_rows:
        lines.append(tabulate(trigger_rows, headers=["Table", "Trigger", "Status"], tablefmt="grid"))
    else:
        lines.append("All triggers match on common tables.")
    lines.append("")

    _section(lines, "7. FUNCTIONS")
    if function_rows:
        lines.append(tabulate(function_rows, headers=["Function", "Status"], tablefmt="grid"))
    else:
        lines.append("All functions match.")
    lines.append("")

    _section(lines, "8. VIEWS")
    if view_rows:
        lines.append(tabulate(view_rows, headers=["View", "Status"], tablefmt="grid"))
    else:
        lines.append("All views match.")
    lines.append("")

    _section(lines, "9. COMMENTS")
    if comment_rows:
        lines.append(tabulate(comment_rows, headers=["Object", "Status"], tablefmt="grid"))
    else:
        lines.append("All comments match.")
    lines.append("")

    lines.append("=" * 80)
    lines.append("END OF REPORT")

    Path(output_file).write_text("\n".join(lines) + "\n")

    print()
    print(tabulate(summary_rows, headers=["Check", "Result"], tablefmt="grid"))
    print(f"\nOverall result: {'OK — schemas match' if overall_ok else 'MISMATCH — differences found'}")
    print(f"Full report written to: {output_file}")

    return overall_ok


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Compare two PostgreSQL schemas (same-DB or cross-DB/cross-host).")

    # Get defaults from environment
    env_src = os.getenv("SRC_DB_SCHEMA")
    env_dest = os.getenv("DEST_DB_SCHEMA")

    parser.add_argument("--s1", default=env_src, help=f"Source schema (default: {env_src})")
    parser.add_argument("--s2", default=env_dest, help=f"Destination schema (default: {env_dest})")
    parser.add_argument("--out", default=str(DEFAULT_OUTPUT), help=f"Output file (default: {DEFAULT_OUTPUT})")

    args = parser.parse_args()

    if not args.s1 or not args.s2:
        print("Error: SRC_DB_SCHEMA and DEST_DB_SCHEMA must both be set in .env")
        sys.exit(1)

    is_match = compare_schemas(args.s1, args.s2, args.out)
    sys.exit(0 if is_match else 1)
