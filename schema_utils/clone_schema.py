import os
import sys
import argparse
import logging
import re
import io
from datetime import datetime
from pathlib import Path
import psycopg2
from psycopg2 import sql, extras
from tabulate import tabulate
from dotenv import load_dotenv

from backup_schema import backup_schema as backup_destination_schema

# Setup paths
BASE_DIR = Path(__file__).parent.parent.parent.parent  # dev-tools/ad-hoc/schema-utils/<file> -> repo root
BACKEND_DIR = BASE_DIR / "backend"
LOGS_DIR = Path(__file__).parent / "logs"
LOGS_DIR.mkdir(exist_ok=True)

# Load environment variables
LOCAL_ENV = Path(__file__).parent / ".env"
BACKEND_ENV = BASE_DIR / "backend" / ".env"

# Load backend first (as fallback/defaults)
load_dotenv(BACKEND_ENV)
# Load local second (with override=True to prioritize)
load_dotenv(LOCAL_ENV, override=True)

# Logging configuration
log_filename = LOGS_DIR / f"clone_schema_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
stdout_handler = logging.StreamHandler(sys.stdout)
stdout_handler.flush = lambda: sys.stdout.flush()
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(log_filename),
        stdout_handler
    ]
)
logger = logging.getLogger(__name__)


# ─────────────────────── Credential Helpers ───────────────────────

def get_src_credentials():
    """Return source DB credentials from SRC_DB_* env vars (all required)."""
    creds = {
        "host":     os.getenv("SRC_DB_HOST"),
        "user":     os.getenv("SRC_DB_USER"),
        "password": os.getenv("SRC_DB_PASS"),
        "dbname":   os.getenv("SRC_DB_NAME"),
        "port":     os.getenv("SRC_DB_PORT", "5432"),
        "connect_timeout": 15,
    }
    missing = [k for k, v in creds.items() if not v]
    if missing:
        logger.error(f"Missing SOURCE credentials: {', '.join(missing)}")
        sys.exit(1)
    return creds


def get_dest_credentials():
    """Return destination DB credentials from DEST_DB_* env vars (all required)."""
    creds = {
        "host":     os.getenv("DEST_DB_HOST"),
        "user":     os.getenv("DEST_DB_USER"),
        "password": os.getenv("DEST_DB_PASS"),
        "dbname":   os.getenv("DEST_DB_NAME"),
        "port":     os.getenv("DEST_DB_PORT", "5432"),
        "connect_timeout": 15,
    }
    missing = [k for k, v in creds.items() if not v]
    if missing:
        logger.error(f"Missing DESTINATION credentials: {', '.join(missing)}")
        sys.exit(1)
    return creds


def get_schema_names():
    """Return (src_schema, dest_schema) from SRC_DB_SCHEMA / DEST_DB_SCHEMA."""
    return os.getenv("SRC_DB_SCHEMA"), os.getenv("DEST_DB_SCHEMA")


def is_same_database(src_creds, dest_creds):
    """Check whether source and destination point to the same database."""
    return (
        src_creds["host"] == dest_creds["host"]
        and src_creds["port"] == dest_creds["port"]
        and src_creds["dbname"] == dest_creds["dbname"]
    )


def destination_schema_exists(dest_creds, dest_schema):
    """Check whether the destination schema currently exists (nothing to back up if not)."""
    conn = psycopg2.connect(**dest_creds)
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM information_schema.schemata WHERE schema_name = %s", (dest_schema,))
            return cur.fetchone() is not None
    finally:
        conn.close()


# ─────────────────────── Safety ───────────────────────

def validate_safe_destination_schema(dest_schema, src_schema=None, src_creds=None, dest_creds=None):
    """Block destructive actions against production-like schemas, unless explicitly overridden."""
    configured_prod_schema = (os.getenv("DB_SCHEMA_PROD") or "").strip().lower()
    normalized_dest = (dest_schema or "").strip().lower()
    override = (os.getenv("ALLOW_PROD_DESTINATION") or "").strip().lower() in ("1", "true", "yes", "on")

    if not normalized_dest:
        raise ValueError(
            "No destination schema was given. Set DEST_DB_SCHEMA in your .env file "
            "to the name of the schema you want to clone into."
        )

    is_prod_match = bool(configured_prod_schema) and normalized_dest == configured_prod_schema
    is_prod_like = bool(re.search(r"prod", normalized_dest, re.IGNORECASE))

    if is_prod_match or is_prod_like:
        reason = (
            f"it is the schema marked as Production (DB_SCHEMA_PROD={configured_prod_schema})"
            if is_prod_match
            else 'its name contains "prod"'
        )

        def block(title, schema, creds):
            lines = [f"{title}:", f"    schema:   {schema or '<unknown>'}"]
            if creds:
                lines.append(f"    server:   {creds.get('host')}")
                lines.append(f"    database: {creds.get('dbname')}")
            return "\n".join(lines)

        source_block = block("SOURCE (read only, left untouched)", src_schema, src_creds)
        dest_block = block("DESTINATION (will be wiped and overwritten)", dest_schema, dest_creds)
        divider = "-" * 60

        if not override:
            raise ValueError(
                "\n" + divider + "\n"
                "BLOCKED: destination schema looks like Production\n" +
                divider + "\n\n" +
                source_block + "\n\n" +
                dest_block + "\n\n" +
                f"Reason blocked: {reason}\n\n" +
                "Running this would permanently DELETE everything currently in the\n"
                "destination schema above and replace it with a copy of the source.\n"
                "There is no undo. Note: source and destination share the same schema\n"
                "name here, but they are different databases on different servers.\n\n" +
                "To proceed anyway:\n"
                "    set ALLOW_PROD_DESTINATION=true in your .env file\n"
                "    then run this script again.\n" +
                divider + "\n"
            )

        logger.warning(
            "\n" + divider + "\n"
            "WARNING: ALLOW_PROD_DESTINATION=true — proceeding anyway\n" +
            divider + "\n\n" +
            source_block + "\n\n" +
            dest_block + "\n\n" +
            f"This would normally be blocked because {reason}.\n\n" +
            "About to permanently DELETE everything in the destination schema\n"
            "above and replace it with a copy of the source. This cannot be undone.\n" +
            divider + "\n"
        )


# ─────────────────────── Row Counts ───────────────────────

def get_row_counts(conn, schema_name):
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = %s AND table_type = 'BASE TABLE'
            """, (schema_name,))
            tables = [row[0] for row in cur.fetchall()]

            counts = {}
            for table in tables:
                cur.execute(sql.SQL("SELECT COUNT(*) FROM {}.{}").format(
                    sql.Identifier(schema_name),
                    sql.Identifier(table)
                ))
                counts[table] = cur.fetchone()[0]
        return counts
    except Exception as e:
        logger.error(f"Failed to get row counts for schema {schema_name}: {e}")
        return None


# ═══════════════════════════════════════════════════════════════════
#  SAME-DATABASE CLONING  (fast path — uses LIKE / INSERT … SELECT)
# ═══════════════════════════════════════════════════════════════════

def _clone_same_db(conn, src_schema, dest_schema):
    """Clone within the same database using native SQL shortcuts."""
    logger.info("Using SAME-DATABASE fast path (LIKE / INSERT…SELECT)…")
    with conn.cursor() as cur:
        # 1. Drop + create destination schema
        cur.execute(sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(sql.Identifier(dest_schema)))
        cur.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(dest_schema)))

        # 2. ENUM types
        cur.execute("""
            SELECT t.typname, e.enumlabel
            FROM pg_type t
            JOIN pg_enum e ON t.oid = e.enumtypid
            JOIN pg_namespace n ON t.typnamespace = n.oid
            WHERE n.nspname = %s
            ORDER BY t.typname, e.enumsortorder;
        """, (src_schema,))
        enums = {}
        for row in cur.fetchall():
            enums.setdefault(row[0], []).append(row[1])

        for type_name, labels in enums.items():
            logger.info(f"  Cloning ENUM type {type_name}…")
            labels_str = ", ".join([f"'{l}'" for l in labels])
            cur.execute(sql.SQL("CREATE TYPE {}.{} AS ENUM ({})").format(
                sql.Identifier(dest_schema),
                sql.Identifier(type_name),
                sql.SQL(labels_str)
            ))

        # 3. Sequences
        cur.execute("""
            SELECT sequence_name 
            FROM information_schema.sequences 
            WHERE sequence_schema = %s
        """, (src_schema,))
        sequences = [row[0] for row in cur.fetchall()]
        for seq in sequences:
            logger.info(f"  Cloning sequence {seq}…")
            cur.execute(sql.SQL("CREATE SEQUENCE {}.{}").format(
                sql.Identifier(dest_schema), sql.Identifier(seq)))
            cur.execute(sql.SQL("SELECT last_value FROM {}.{}").format(
                sql.Identifier(src_schema), sql.Identifier(seq)))
            last_val = cur.fetchone()[0]
            qualified_seq = f'"{dest_schema}"."{seq}"'
            cur.execute(sql.SQL("SELECT setval(%s, %s)"), (qualified_seq, last_val))

        # 4. Tables (structure + data)
        cur.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = %s AND table_type = 'BASE TABLE'
        """, (src_schema,))
        tables = [row[0] for row in cur.fetchall()]

        for table in tables:
            logger.info(f"  Cloning table structure: {table}…")
            cur.execute(sql.SQL("CREATE TABLE {}.{} (LIKE {}.{} INCLUDING ALL)").format(
                sql.Identifier(dest_schema), sql.Identifier(table),
                sql.Identifier(src_schema), sql.Identifier(table)
            ))
            logger.info(f"  Copying data: {table}…")
            cur.execute(sql.SQL("INSERT INTO {}.{} SELECT * FROM {}.{}").format(
                sql.Identifier(dest_schema), sql.Identifier(table),
                sql.Identifier(src_schema), sql.Identifier(table)
            ))

        # 5. Fix sequence defaults
        logger.info("  Correcting sequence defaults…")
        cur.execute("""
            SELECT table_name, column_name, column_default
            FROM information_schema.columns
            WHERE table_schema = %s AND column_default LIKE 'nextval(%%'
        """, (dest_schema,))
        for table, col, default in cur.fetchall():
            if src_schema in default:
                new_default = re.sub(
                    r"'" + re.escape(src_schema) + r"\.([^']+)'",
                    lambda m: f'\'"' + dest_schema + '"."' + m.group(1) + '"\'',
                    default
                )
                cur.execute(sql.SQL("ALTER TABLE {}.{} ALTER COLUMN {} SET DEFAULT {}").format(
                    sql.Identifier(dest_schema), sql.Identifier(table),
                    sql.Identifier(col), sql.SQL(new_default)
                ))

        # 6. Foreign Keys
        logger.info("  Cloning Foreign Key constraints…")
        cur.execute("""
            SELECT 
                t.relname AS table_name,
                c.conname AS constraint_name,
                pg_get_constraintdef(c.oid) AS constraint_definition
            FROM pg_constraint c
            JOIN pg_class t ON c.conrelid = t.oid
            JOIN pg_namespace n ON t.relnamespace = n.oid
            WHERE n.nspname = %s AND c.contype = 'f';
        """, (src_schema,))
        for table, conname, condef in cur.fetchall():
            new_condef = condef.replace(f"{src_schema}.", f'"{dest_schema}".')
            logger.info(f"    FK {conname} on {table}…")
            cur.execute(sql.SQL("ALTER TABLE {}.{} ADD CONSTRAINT {} {}").format(
                sql.Identifier(dest_schema), sql.Identifier(table),
                sql.Identifier(conname), sql.SQL(new_condef)
            ))


# ═══════════════════════════════════════════════════════════════════
#  CROSS-DATABASE CLONING  (metadata rebuild + COPY streaming)
# ═══════════════════════════════════════════════════════════════════

def _get_column_definitions(cur, schema):
    """Fetch column definitions grouped by table from information_schema."""
    cur.execute("""
        SELECT table_name, column_name, data_type,
               character_maximum_length, numeric_precision, numeric_scale,
               is_nullable, column_default, udt_name
        FROM information_schema.columns
        WHERE table_schema = %s
        ORDER BY table_name, ordinal_position
    """, (schema,))
    columns = {}
    for row in cur.fetchall():
        table = row[0]
        columns.setdefault(table, []).append({
            "name": row[1], "data_type": row[2],
            "char_len": row[3], "num_prec": row[4], "num_scale": row[5],
            "nullable": row[6], "default": row[7], "udt_name": row[8],
        })
    return columns


def _build_col_type(col):
    """Build column type string from information_schema metadata."""
    udt = col["udt_name"]
    dt = col["data_type"]

    # User-defined types (ENUMs) — will be schema-qualified later
    if dt == "USER-DEFINED":
        return udt

    # Array types
    if dt == "ARRAY":
        base = udt.lstrip("_")
        return f"{base}[]"

    # Character types
    if dt in ("character varying", "varchar"):
        if col["char_len"]:
            return f"varchar({col['char_len']})"
        return "varchar"
    if dt == "character":
        return f"char({col['char_len']})" if col["char_len"] else "char"

    # Numeric with precision
    if dt == "numeric" and col["num_prec"]:
        if col["num_scale"]:
            return f"numeric({col['num_prec']},{col['num_scale']})"
        return f"numeric({col['num_prec']})"

    return dt


def _get_primary_keys(cur, schema):
    """Return {table: (constraint_name, [col1, col2, …])} for primary keys.
    Name is kept so the clone can reuse it instead of an auto-generated one."""
    cur.execute("""
        SELECT kcu.table_name, tc.constraint_name, kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = %s AND tc.constraint_type = 'PRIMARY KEY'
        ORDER BY kcu.table_name, kcu.ordinal_position
    """, (schema,))
    pks = {}
    for table, conname, col in cur.fetchall():
        pks.setdefault(table, (conname, []))[1].append(col)
    return pks


def _get_unique_constraints(cur, schema):
    """Return {table: [{name, columns}, …]}."""
    cur.execute("""
        SELECT tc.table_name, tc.constraint_name, kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = %s AND tc.constraint_type = 'UNIQUE'
        ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position
    """, (schema,))
    uqs = {}
    for table, cname, col in cur.fetchall():
        uqs.setdefault(table, {}).setdefault(cname, []).append(col)
    return uqs


def _get_indexes(cur, schema):
    """Return non-constraint indexes as [(table, indexdef), …]."""
    cur.execute("""
        SELECT
            t.relname AS table_name,
            pg_get_indexdef(ix.indexrelid) AS index_def
        FROM pg_index ix
        JOIN pg_class t ON t.oid = ix.indrelid
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = %s
          AND NOT ix.indisprimary
          AND NOT ix.indisunique
        ORDER BY t.relname
    """, (schema,))
    return cur.fetchall()


def _clone_cross_db(src_conn, dest_conn, src_schema, dest_schema):
    """Clone across different databases by rebuilding structure from metadata."""
    logger.info("Using CROSS-DATABASE path (metadata rebuild + COPY streaming)…")

    src_cur = src_conn.cursor()
    dest_cur = dest_conn.cursor()

    # 1. Drop + create destination schema
    dest_cur.execute(sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(sql.Identifier(dest_schema)))
    dest_cur.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(dest_schema)))

    # 2. ENUM types
    src_cur.execute("""
        SELECT t.typname, e.enumlabel
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        JOIN pg_namespace n ON t.typnamespace = n.oid
        WHERE n.nspname = %s
        ORDER BY t.typname, e.enumsortorder;
    """, (src_schema,))
    enums = {}
    for row in src_cur.fetchall():
        enums.setdefault(row[0], []).append(row[1])

    for type_name, labels in enums.items():
        logger.info(f"  Cloning ENUM type {type_name}…")
        labels_str = ", ".join([f"'{l}'" for l in labels])
        dest_cur.execute(sql.SQL("CREATE TYPE {}.{} AS ENUM ({})").format(
            sql.Identifier(dest_schema), sql.Identifier(type_name), sql.SQL(labels_str)
        ))

    # 3. Sequences
    src_cur.execute("""
        SELECT c.relname, format_type(s.seqtypid, NULL)
        FROM pg_sequence s
        JOIN pg_class c ON c.oid = s.seqrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = %s
    """, (src_schema,))
    seq_types = dict(src_cur.fetchall())

    # Sequence ownership, captured now but applied later (step 4b) once the
    # owning column exists in the destination.
    src_cur.execute("""
        SELECT s.relname, t.relname, a.attname
        FROM pg_depend d
        JOIN pg_class s ON s.oid = d.objid AND s.relkind = 'S'
        JOIN pg_class t ON t.oid = d.refobjid
        JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
        JOIN pg_namespace n ON n.oid = s.relnamespace
        WHERE d.deptype = 'a' AND n.nspname = %s
    """, (src_schema,))
    seq_owners = {seq: (table, col) for seq, table, col in src_cur.fetchall()}

    src_cur.execute("""
        SELECT sequence_name 
        FROM information_schema.sequences 
        WHERE sequence_schema = %s
    """, (src_schema,))
    sequences = [row[0] for row in src_cur.fetchall()]
    for seq_name in sequences:
        logger.info(f"  Cloning sequence {seq_name}…")
        dest_cur.execute(sql.SQL("CREATE SEQUENCE {}.{} AS {}").format(
            sql.Identifier(dest_schema), sql.Identifier(seq_name), sql.SQL(seq_types[seq_name])))
        src_cur.execute(sql.SQL("SELECT last_value, is_called FROM {}.{}").format(
            sql.Identifier(src_schema), sql.Identifier(seq_name)))
        last_val, is_called = src_cur.fetchone()
        qualified_seq = f'"{dest_schema}"."{seq_name}"'
        dest_cur.execute(sql.SQL("SELECT setval(%s, %s, %s)"), (qualified_seq, last_val, is_called))

    # 4. Tables — build CREATE TABLE from information_schema
    col_defs = _get_column_definitions(src_cur, src_schema)
    pk_defs = _get_primary_keys(src_cur, src_schema)
    uq_defs = _get_unique_constraints(src_cur, src_schema)

    src_cur.execute("""
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = %s AND table_type = 'BASE TABLE'
    """, (src_schema,))
    tables = [row[0] for row in src_cur.fetchall()]

    for table in tables:
        logger.info(f"  Creating table structure: {table}…")
        cols = col_defs.get(table, [])
        parts = []
        for c in cols:
            col_type = _build_col_type(c)
            # Qualify user-defined types with dest schema
            if c["data_type"] == "USER-DEFINED":
                col_type = f"{dest_schema}.{col_type}"
            line = f'  {c["name"]} {col_type}'
            if c["nullable"] == "NO":
                line += " NOT NULL"
            if c["default"]:
                default_val = c["default"]
                # Rewrite schema references in defaults — both quoted sequence
                # refs (nextval('src.seq'::regclass)) and unquoted enum casts
                # ('Planned'::src.some_enum), bare or double-quoted.
                if src_schema in default_val:
                    default_val = re.sub(
                        r'(?<![\w"])"?' + re.escape(src_schema) + r'"?\.',
                        lambda m: f'"{dest_schema}".',
                        default_val
                    )
                line += f" DEFAULT {default_val}"
            parts.append(line)

        # Primary key (named to match the source)
        pk_info = pk_defs.get(table)
        if pk_info:
            pk_name, pk_cols = pk_info
            parts.append(f'  CONSTRAINT {pk_name} PRIMARY KEY ({", ".join(pk_cols)})')

        # Unique constraints
        for cname, ucols in uq_defs.get(table, {}).items():
            parts.append(f'  CONSTRAINT {cname} UNIQUE ({", ".join(ucols)})')

        create_sql = f'CREATE TABLE {dest_schema}.{table} (\n' + ",\n".join(parts) + '\n)'
        dest_cur.execute(create_sql)

    # 4b. Sequence ownership (needs tables to exist first)
    logger.info("  Setting sequence ownership…")
    for seq_name, (owner_table, owner_col) in seq_owners.items():
        logger.info(f"    {seq_name} OWNED BY {owner_table}.{owner_col}…")
        dest_cur.execute(sql.SQL("ALTER SEQUENCE {}.{} OWNED BY {}.{}.{}").format(
            sql.Identifier(dest_schema), sql.Identifier(seq_name),
            sql.Identifier(dest_schema), sql.Identifier(owner_table), sql.Identifier(owner_col)
        ))

    # 5. Copy data via COPY streaming
    for table in tables:
        logger.info(f"  Streaming data: {table}…")
        buf = io.BytesIO()

        copy_out = sql.SQL("COPY {}.{} TO STDOUT WITH (FORMAT binary)").format(
            sql.Identifier(src_schema), sql.Identifier(table))
        src_cur.copy_expert(copy_out.as_string(src_conn), buf)

        buf.seek(0)
        if buf.getbuffer().nbytes > 0:
            copy_in = sql.SQL("COPY {}.{} FROM STDIN WITH (FORMAT binary)").format(
                sql.Identifier(dest_schema), sql.Identifier(table))
            dest_cur.copy_expert(copy_in.as_string(dest_conn), buf)

    # 6. Indexes (non-PK, non-unique)
    logger.info("  Cloning indexes…")
    indexes = _get_indexes(src_cur, src_schema)
    for table, indexdef in indexes:
        new_def = indexdef.replace(f"{src_schema}.", f'"{dest_schema}".')
        logger.info(f"    Index on {table}…")
        dest_cur.execute(new_def)

    # 7. Foreign Keys
    logger.info("  Cloning Foreign Key constraints…")
    src_cur.execute("""
        SELECT 
            t.relname AS table_name,
            c.conname AS constraint_name,
            pg_get_constraintdef(c.oid) AS constraint_definition
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        JOIN pg_namespace n ON t.relnamespace = n.oid
        WHERE n.nspname = %s AND c.contype = 'f';
    """, (src_schema,))
    for table, conname, condef in src_cur.fetchall():
        new_condef = condef.replace(f"{src_schema}.", f'"{dest_schema}".')
        logger.info(f"    FK {conname} on {table}…")
        dest_cur.execute(sql.SQL("ALTER TABLE {}.{} ADD CONSTRAINT {} {}").format(
            sql.Identifier(dest_schema), sql.Identifier(table),
            sql.Identifier(conname), sql.SQL(new_condef)
        ))

    # 8. CHECK constraints
    logger.info("  Cloning CHECK constraints…")
    src_cur.execute("""
        SELECT 
            t.relname AS table_name,
            c.conname AS constraint_name,
            pg_get_constraintdef(c.oid) AS constraint_definition
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        JOIN pg_namespace n ON t.relnamespace = n.oid
        WHERE n.nspname = %s AND c.contype = 'c';
    """, (src_schema,))
    for table, conname, condef in src_cur.fetchall():
        new_condef = condef.replace(f"{src_schema}.", f'"{dest_schema}".')
        logger.info(f"    CHECK {conname} on {table}…")
        dest_cur.execute(sql.SQL("ALTER TABLE {}.{} DROP CONSTRAINT IF EXISTS {}").format(
            sql.Identifier(dest_schema), sql.Identifier(table), sql.Identifier(conname)
        ))
        dest_cur.execute(sql.SQL("ALTER TABLE {}.{} ADD CONSTRAINT {} {}").format(
            sql.Identifier(dest_schema), sql.Identifier(table),
            sql.Identifier(conname), sql.SQL(new_condef)
        ))

    # 9. Functions (triggers below need these first)
    logger.info("  Cloning functions…")
    src_cur.execute("""
        SELECT p.proname, pg_get_function_identity_arguments(p.oid), pg_get_functiondef(p.oid)
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = %s AND p.prokind = 'f';
    """, (src_schema,))
    functions = src_cur.fetchall()
    for funcname, args, funcdef in functions:
        new_funcdef = funcdef.replace(f"{src_schema}.", f'"{dest_schema}".')
        logger.info(f"    Function {funcname}({args})…")
        # Already "CREATE OR REPLACE FUNCTION" — idempotent as-is.
        dest_cur.execute(new_funcdef)

    # 10. Triggers
    logger.info("  Cloning triggers…")
    src_cur.execute("""
        SELECT c.relname, t.tgname, pg_get_triggerdef(t.oid, true)
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = %s AND NOT t.tgisinternal;
    """, (src_schema,))
    for table, tgname, trigdef in src_cur.fetchall():
        new_trigdef = trigdef.replace(f"{src_schema}.", f'"{dest_schema}".')
        logger.info(f"    Trigger {tgname} on {table}…")
        dest_cur.execute(sql.SQL("DROP TRIGGER IF EXISTS {} ON {}.{}").format(
            sql.Identifier(tgname), sql.Identifier(dest_schema), sql.Identifier(table)
        ))
        dest_cur.execute(new_trigdef)

    # 11. Views
    logger.info("  Cloning views…")
    src_cur.execute("SELECT viewname, definition FROM pg_views WHERE schemaname = %s;", (src_schema,))
    for viewname, viewdef in src_cur.fetchall():
        new_viewdef = viewdef.replace(f"{src_schema}.", f'"{dest_schema}".').strip().rstrip(';')
        logger.info(f"    View {viewname}…")
        dest_cur.execute(sql.SQL("CREATE OR REPLACE VIEW {}.{} AS {}").format(
            sql.Identifier(dest_schema), sql.Identifier(viewname), sql.SQL(new_viewdef)
        ))

    # 12. Comments (last, since they can document anything above)
    logger.info("  Cloning comments…")
    src_cur.execute("""
        SELECT c.relkind, c.relname, d.objsubid, a.attname, d.description
        FROM pg_description d
        JOIN pg_class c ON c.oid = d.objoid
        LEFT JOIN pg_attribute a ON a.attrelid = d.objoid AND a.attnum = d.objsubid AND d.objsubid > 0
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = %s AND d.classoid = 'pg_class'::regclass;
    """, (src_schema,))
    for relkind, relname, objsubid, attname, description in src_cur.fetchall():
        if objsubid == 0:
            if relkind in ('v', 'm'):
                logger.info(f"    Comment on VIEW {relname}…")
                dest_cur.execute(sql.SQL("COMMENT ON VIEW {}.{} IS {}").format(
                    sql.Identifier(dest_schema), sql.Identifier(relname), sql.Literal(description)
                ))
            else:
                logger.info(f"    Comment on TABLE {relname}…")
                dest_cur.execute(sql.SQL("COMMENT ON TABLE {}.{} IS {}").format(
                    sql.Identifier(dest_schema), sql.Identifier(relname), sql.Literal(description)
                ))
        else:
            logger.info(f"    Comment on column {relname}.{attname}…")
            dest_cur.execute(sql.SQL("COMMENT ON COLUMN {}.{}.{} IS {}").format(
                sql.Identifier(dest_schema), sql.Identifier(relname), sql.Identifier(attname), sql.Literal(description)
            ))

    src_cur.execute("""
        SELECT p.proname, pg_get_function_identity_arguments(p.oid), d.description
        FROM pg_description d
        JOIN pg_proc p ON p.oid = d.objoid
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = %s AND d.classoid = 'pg_proc'::regclass;
    """, (src_schema,))
    for funcname, args, description in src_cur.fetchall():
        logger.info(f"    Comment on function {funcname}({args})…")
        dest_cur.execute(sql.SQL("COMMENT ON FUNCTION {}.{}({}) IS {}").format(
            sql.Identifier(dest_schema), sql.Identifier(funcname), sql.SQL(args), sql.Literal(description)
        ))

    src_cur.close()
    dest_cur.close()


# ═══════════════════════════════════════════════════════════════════
#  Display & Orchestration
# ═══════════════════════════════════════════════════════════════════

def display_comparison(src_schema, dest_schema, src_counts, dest_counts):
    if src_counts is not None and dest_counts is not None:
        table_data = []
        all_tables = sorted(set(list(src_counts.keys()) + list(dest_counts.keys())))
        for t in all_tables:
            s_val = src_counts.get(t, "N/A")
            d_val = dest_counts.get(t, "N/A")
            status = "OK" if s_val == d_val else "MISMATCH"
            table_data.append([t, s_val, d_val, status])

        print("\nRow Count Comparison Table:")
        print(tabulate(table_data,
                       headers=["Table", f"{src_schema} Rows", f"{dest_schema} Rows", "Status"],
                       tablefmt="grid"))
    else:
        logger.warning("Could not complete row count verification.")


def clone_schema(src_schema, dest_schema, drop=False, skip_backup=False):
    """Main entry point — decides which cloning path to use."""
    src_creds = get_src_credentials()
    dest_creds = get_dest_credentials()

    validate_safe_destination_schema(dest_schema, src_schema, src_creds, dest_creds)

    same_db = is_same_database(src_creds, dest_creds)

    logger.info("=" * 60)
    logger.info("PostgreSQL Schema Cloner")
    logger.info("=" * 60)
    logger.info(f"Source      : {src_creds['host']}:{src_creds['port']}/{src_creds['dbname']}  →  schema '{src_schema}'")
    logger.info(f"Destination : {dest_creds['host']}:{dest_creds['port']}/{dest_creds['dbname']}  →  schema '{dest_schema}'")
    logger.info(f"Mode        : {'SAME-DATABASE' if same_db else 'CROSS-DATABASE'}")
    logger.info("=" * 60)

    # Snapshot whatever is currently in the destination before it gets
    # dropped, so a bad clone (wrong source, unwanted overwrite, etc.) is
    # always recoverable with restore_schema.py. This runs before any
    # destructive statement — if the backup itself fails, backup_destination_schema()
    # exits the process here and the destination is never touched. In normal use
    # (DEST_DB_SCHEMA always gets a fresh timestamp suffix) this is a no-op, since
    # there's nothing existing at the new name yet — it only does something if the
    # exact timestamped name happens to already exist.
    if skip_backup:
        logger.warning("Skipping pre-clone backup of destination schema (--skip-backup passed).")
    elif not destination_schema_exists(dest_creds, dest_schema):
        logger.info(f"Destination schema '{dest_schema}' does not exist yet — nothing to back up.")
    else:
        logger.info(f"Backing up destination schema '{dest_schema}' before it gets overwritten…")
        backup_file = backup_destination_schema("dest", schema_override=dest_schema)
        logger.info(f"Pre-clone backup saved: {backup_file}")
        logger.info(f"If this clone turns out wrong: python3 restore_schema.py --file {backup_file} --execute")

    try:
        if same_db:
            conn = psycopg2.connect(**src_creds)
            conn.autocommit = False
            try:
                _clone_same_db(conn, src_schema, dest_schema)

                logger.info("Post-clone verification…")
                src_counts = get_row_counts(conn, src_schema)
                dest_counts = get_row_counts(conn, dest_schema)
                display_comparison(src_schema, dest_schema, src_counts, dest_counts)

                if src_counts and dest_counts:
                    for t in set(list(src_counts.keys()) + list(dest_counts.keys())):
                        if src_counts.get(t) != dest_counts.get(t):
                            raise RuntimeError(f"Row count mismatch on table '{t}': "
                                               f"source={src_counts.get(t)}, dest={dest_counts.get(t)}")

                conn.commit()
                logger.info("Transaction COMMITTED — clone completed successfully!")
            except Exception:
                conn.rollback()
                logger.error("Transaction ROLLED BACK — destination schema unchanged.")
                raise
            finally:
                conn.close()
        else:
            src_conn = psycopg2.connect(**src_creds)
            dest_conn = psycopg2.connect(**dest_creds)
            dest_conn.autocommit = False
            try:
                _clone_cross_db(src_conn, dest_conn, src_schema, dest_schema)

                logger.info("Post-clone verification…")
                src_counts = get_row_counts(src_conn, src_schema)
                dest_counts = get_row_counts(dest_conn, dest_schema)
                display_comparison(src_schema, dest_schema, src_counts, dest_counts)

                if src_counts and dest_counts:
                    for t in set(list(src_counts.keys()) + list(dest_counts.keys())):
                        if src_counts.get(t) != dest_counts.get(t):
                            raise RuntimeError(f"Row count mismatch on table '{t}': "
                                               f"source={src_counts.get(t)}, dest={dest_counts.get(t)}")

                dest_conn.commit()
                logger.info("Transaction COMMITTED — clone completed successfully!")
            except Exception:
                dest_conn.rollback()
                logger.error("Transaction ROLLED BACK — destination schema unchanged.")
                raise
            finally:
                src_conn.close()
                dest_conn.close()

        if skip_backup:
            logger.warning("Skipping post-clone local dump of destination schema (--skip-backup passed).")
        else:
            logger.info(f"Creating local dump of the newly cloned destination schema '{dest_schema}'…")
            try:
                dump_file = backup_destination_schema("dest", schema_override=dest_schema)
                logger.info(f"Local dump saved: {dump_file}")
            except (Exception, SystemExit) as dump_err:
                # The clone itself already committed successfully above — a failure here
                # (pg_dump missing, disk full, etc.) doesn't undo that, so it's logged as
                # a warning rather than turned into an overall failure return.
                logger.error(f"Post-clone local dump failed ({dump_err}) — the schema clone "
                             f"itself succeeded and is unaffected. Run backup_schema.py manually "
                             f"if you still need a local dump of '{dest_schema}'.")

        return True
    except Exception as e:
        logger.error(f"Cloning failed: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Clone a PostgreSQL schema (same-DB or cross-DB/cross-host).")
    parser.add_argument("--drop-if-exists", action="store_true",
                        help="Deprecated: destination schema is now always dropped first")
    parser.add_argument("--skip-backup", action="store_true",
                        help="Skip both automatic backup dumps: the pre-clone snapshot of the "
                             "destination (rarely relevant now — see docs) and the post-clone "
                             "local .dump of the freshly cloned schema (not recommended)")

    args = parser.parse_args()

    src_schema, dest_schema = get_schema_names()

    if not src_schema or not dest_schema:
        print("Error: SRC_DB_SCHEMA and DEST_DB_SCHEMA must both be set in .env")
        sys.exit(1)

    dest_schema = f"{dest_schema}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    logger.info(f"Destination schema auto-suffixed with a timestamp — cloning into '{dest_schema}'")

    clone_schema(src_schema, dest_schema, args.drop_if_exists, skip_backup=args.skip_backup)
