import os
import re
import sys
import json
import shutil
import hashlib
import tempfile
import argparse
import logging
import subprocess
from datetime import datetime
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

# Setup paths
BASE_DIR = Path(__file__).parent.parent.parent.parent  # dev-tools/ad-hoc/schema-utils/<file> -> repo root
SCRIPT_DIR = Path(__file__).parent
BACKUPS_DIR = SCRIPT_DIR / "backups"
LOGS_DIR = SCRIPT_DIR / "logs" / "restore_schema"

LOCAL_ENV = SCRIPT_DIR / ".env"
BACKEND_ENV = BASE_DIR / "backend" / ".env"
load_dotenv(BACKEND_ENV)
load_dotenv(LOCAL_ENV, override=True)

# Module-level logger — no handlers attached yet, so importing this file (e.g.
# to reuse a helper function) never creates a log directory or file. Handlers
# are only attached by configure_logging(), called from the __main__ block.
logger = logging.getLogger("restore_schema")


def configure_logging():
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    log_filename = LOGS_DIR / f"restore_schema_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
    formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")

    file_handler = logging.FileHandler(log_filename)
    file_handler.setFormatter(formatter)
    stdout_handler = logging.StreamHandler(sys.stdout)
    stdout_handler.setFormatter(formatter)

    logger.setLevel(logging.INFO)
    logger.addHandler(file_handler)
    logger.addHandler(stdout_handler)
    return log_filename


# ─────────────────────── Credential Helpers ───────────────────────

def get_credentials(target):
    """Return {host, port, user, password, dbname, schema} for 'src' or 'dest'."""
    prefix = "SRC" if target == "src" else "DEST"
    creds = {
        "host":     os.getenv(f"{prefix}_DB_HOST"),
        "port":     os.getenv(f"{prefix}_DB_PORT", "5432"),
        "user":     os.getenv(f"{prefix}_DB_USER"),
        "password": os.getenv(f"{prefix}_DB_PASS"),
        "dbname":   os.getenv(f"{prefix}_DB_NAME"),
        "schema":   os.getenv(f"{prefix}_DB_SCHEMA"),
    }
    missing = [k for k, v in creds.items() if not v]
    if missing:
        logger.error(f"Missing {prefix}_DB_* config: {', '.join(missing)}")
        sys.exit(1)
    return creds


def get_server_major_version(creds):
    """Query the target server's major version, e.g. 17 for PostgreSQL 17.9."""
    try:
        conn = psycopg2.connect(
            host=creds["host"], port=creds["port"], user=creds["user"],
            password=creds["password"], dbname=creds["dbname"], connect_timeout=15,
        )
        try:
            with conn.cursor() as cur:
                cur.execute("SHOW server_version_num")
                return int(cur.fetchone()[0]) // 10000
        finally:
            conn.close()
    except Exception as e:
        logger.warning(f"Could not detect server version: {e}")
        return None


def resolve_client_binary(name, server_major_version=None):
    """Find the right client binary for the target server's version.

    On Debian/Ubuntu, plain `pg_dump`/`pg_restore`/`psql` on PATH is a wrapper
    (pg_wrapper) that guesses the version to run by matching the port
    against locally running clusters — it ignores -h/--host, so with a
    local cluster also on 5432 it can silently pick the wrong major
    version for a remote server. Prefer the exact versioned binary when
    we know the server's version; only fall back to PATH otherwise.
    """
    if server_major_version:
        versioned = Path(f"/usr/lib/postgresql/{server_major_version}/bin/{name}")
        if versioned.exists():
            return str(versioned)
        logger.warning(f"{name} for PostgreSQL {server_major_version} not found at {versioned} — "
                        f"falling back to '{name}' on PATH, which may be the wrong version.")

    path = shutil.which(name)
    if not path:
        logger.error(f"Required tool '{name}' not found on PATH. Install the PostgreSQL client tools "
                      f"(e.g. 'apt install postgresql-client').")
        sys.exit(1)
    return path


# ─────────────────────── Safety ───────────────────────
# Same rule clone_schema.py enforces: never let a destructive restore land on prod.

def validate_safe_destination_schema(dest_schema):
    """Block a restore into a prod-like schema unless overridden (same
    ALLOW_PROD_DESTINATION escape hatch as clone_schema.py)."""
    configured_prod_schema = (os.getenv("DB_SCHEMA_PROD") or "").strip().lower()
    normalized_dest = (dest_schema or "").strip().lower()
    override = (os.getenv("ALLOW_PROD_DESTINATION") or "").strip().lower() in ("1", "true", "yes", "on")

    if not normalized_dest:
        raise ValueError("Destination schema is empty.")

    if configured_prod_schema and normalized_dest == configured_prod_schema:
        if not override:
            raise ValueError(
                f"Refusing to restore into destination schema '{dest_schema}' because it matches DB_SCHEMA_PROD. "
                f"To proceed anyway, set ALLOW_PROD_DESTINATION=true in your .env file and run again."
            )
        logger.warning(f"ALLOW_PROD_DESTINATION=true — proceeding with a restore into '{dest_schema}', "
                        f"which matches DB_SCHEMA_PROD and would normally be blocked.")
        return

    if re.search(r"prod", normalized_dest, re.IGNORECASE):
        if not override:
            raise ValueError(
                f"Refusing to restore into destination schema '{dest_schema}' because schema names "
                f"containing 'prod' are protected. To proceed anyway, set ALLOW_PROD_DESTINATION=true "
                f"in your .env file and run again."
            )
        logger.warning(f"ALLOW_PROD_DESTINATION=true — proceeding with a restore into '{dest_schema}', "
                        f"which would normally be blocked because schema names containing 'prod' are protected.")


# ─────────────────────── Backup File Discovery ───────────────────────

def find_backup_file(explicit_path, schema_hint):
    if explicit_path:
        path = Path(explicit_path)
        if not path.exists():
            logger.error(f"Backup file not found: {path}")
            sys.exit(1)
        return path

    if not schema_hint:
        logger.error("No --file given and no schema to search for. Pass --file or --target.")
        sys.exit(1)

    candidates = sorted(BACKUPS_DIR.glob(f"{schema_hint}_*.dump"))
    if not candidates:
        logger.error(f"No backups found for schema '{schema_hint}' in {BACKUPS_DIR}. Pass --file explicitly.")
        sys.exit(1)
    return candidates[-1]  # lexicographic == chronological, timestamp format sorts correctly


def load_manifest(dump_file):
    manifest_file = dump_file.with_suffix(dump_file.suffix + ".json")
    if not manifest_file.exists():
        logger.warning(f"No manifest found next to {dump_file.name} — proceeding without it "
                        f"(no checksum or row-count verification will be possible).")
        return None
    return json.loads(manifest_file.read_text())


# ─────────────────────── Integrity Helpers ───────────────────────

def sha256_of(path):
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_archive_readable(pg_restore_bin, dump_file):
    """Confirm the archive's table of contents can be read back — the cheapest
    possible check that the file isn't truncated or corrupted."""
    result = subprocess.run([pg_restore_bin, "-l", str(dump_file)], capture_output=True, text=True)
    if result.returncode != 0:
        return False, result.stderr.strip()
    toc_lines = [l for l in result.stdout.splitlines() if l and not l.startswith(";")]
    if not toc_lines:
        return False, "archive table of contents is empty"
    return True, toc_lines


def verify_checksum(dump_file, manifest):
    """Compare the file's current sha256 against what the manifest recorded at
    backup time. Returns (ok, message). ok=True if there's nothing to check
    against (older manifest, or none) — absence of a checksum isn't itself
    proof of corruption, just proof we can't rule it out."""
    expected = (manifest or {}).get("sha256")
    if not expected:
        return True, "no checksum recorded in manifest — skipped"
    actual = sha256_of(dump_file)
    if actual != expected:
        return False, f"expected {expected[:16]}…, got {actual[:16]}…"
    return True, f"matches manifest ({actual[:16]}…)"


# ─────────────────────── Row Counts ───────────────────────

def get_row_counts(creds, schema):
    try:
        conn = psycopg2.connect(
            host=creds["host"], port=creds["port"], user=creds["user"],
            password=creds["password"], dbname=creds["dbname"], connect_timeout=15,
        )
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT table_name FROM information_schema.tables
                    WHERE table_schema = %s AND table_type = 'BASE TABLE'
                """, (schema,))
                tables = [row[0] for row in cur.fetchall()]

                counts = {}
                for table in tables:
                    cur.execute(f'SELECT COUNT(*) FROM "{schema}"."{table}"')
                    counts[table] = cur.fetchone()[0]
            return counts
        finally:
            conn.close()
    except Exception as e:
        logger.warning(f"Could not read current schema contents: {e}")
        return None


# ─────────────────────── Dry Run ───────────────────────

def dry_run(dump_file, manifest, creds, target_schema):
    logger.info("=" * 60)
    logger.info("DRY RUN — no changes will be made")
    logger.info("=" * 60)
    logger.info(f"Backup file : {dump_file}")
    if manifest:
        logger.info(f"Backed up   : {manifest.get('created_at')} from schema '{manifest.get('schema')}' "
                     f"on {manifest.get('host')}:{manifest.get('port')}/{manifest.get('dbname')}")
    logger.info(f"Would restore into : {creds['host']}:{creds['port']}/{creds['dbname']}  schema '{target_schema}'")
    logger.info("")

    # 1. Safety check — surface a blocked restore before anything else.
    try:
        validate_safe_destination_schema(target_schema)
        logger.info("Safety check        : OK (not blocked)")
    except ValueError as e:
        logger.error(f"Safety check        : WOULD BE BLOCKED — {e}")

    # 2. Archive integrity — proves the file is a valid, readable, uncorrupted archive.
    major_version = get_server_major_version(creds)
    pg_restore = resolve_client_binary("pg_restore", major_version)
    logger.info(f"Using pg_restore    : {pg_restore}" + (f" (server is PostgreSQL {major_version})" if major_version else ""))

    ok, result = verify_archive_readable(pg_restore, dump_file)
    if not ok:
        logger.error(f"Archive integrity   : FAILED — {result}")
        logger.error("This backup file is unreadable/corrupted. --execute would refuse to use it.")
    else:
        toc_lines = result
        logger.info(f"Archive integrity   : OK ({len(toc_lines)} objects)")
        for line in toc_lines[:20]:
            logger.info(f"  {line}")
        if len(toc_lines) > 20:
            logger.info(f"  … and {len(toc_lines) - 20} more (use 'pg_restore -l {dump_file}' to see all)")

    # 3. Checksum — catches corruption that a mere TOC read might miss (bit
    # rot, a bad copy between machines, manual tampering).
    ok, detail = verify_checksum(dump_file, manifest)
    logger.info(f"Checksum            : {'OK' if ok else 'MISMATCH'} — {detail}")
    if not ok:
        logger.error("This backup's contents don't match what was recorded at backup time. "
                      "--execute would refuse to restore from it.")

    # 4. What's currently in the destination — i.e. what --execute would replace.
    logger.info("")
    current_counts = get_row_counts(creds, target_schema)
    if current_counts is None:
        logger.info(f"Current contents of '{target_schema}': could not connect / schema may not exist yet")
    elif not current_counts:
        logger.info(f"Current contents of '{target_schema}': schema has no tables (nothing would be lost)")
    else:
        logger.info(f"Current contents of '{target_schema}' — THIS WOULD BE REPLACED on --execute:")
        for table, count in sorted(current_counts.items()):
            logger.info(f"  {table}: {count} rows")

    if manifest and manifest.get("row_counts"):
        logger.info("")
        logger.info("Row counts recorded in the backup (what would be restored):")
        for table, count in sorted(manifest["row_counts"].items()):
            logger.info(f"  {table}: {count} rows")

    logger.info("")
    logger.info("Execute plan: the destination schema is dropped (CASCADE) and fully rebuilt as ONE "
                "PostgreSQL transaction. If anything fails partway — a dropped connection, disk full, "
                "a killed process — PostgreSQL rolls back everything automatically and the destination "
                "is left exactly as it is now. Nothing is left half-restored.")

    logger.info("")
    logger.info("=" * 60)
    logger.info("DRY RUN COMPLETE — no changes were made.")
    logger.info("Re-run with --execute to actually restore.")
    logger.info("=" * 60)


# ─────────────────────── Execute ───────────────────────

def execute_restore(dump_file, manifest, creds, target_schema, assume_yes):
    try:
        validate_safe_destination_schema(target_schema)
    except ValueError as e:
        logger.error(f"Safety check failed — refusing to restore: {e}")
        sys.exit(1)

    major_version = get_server_major_version(creds)
    pg_restore = resolve_client_binary("pg_restore", major_version)
    psql = resolve_client_binary("psql", major_version)
    logger.info(f"Using pg_restore: {pg_restore}")
    logger.info(f"Using psql: {psql}" + (f" (server is PostgreSQL {major_version})" if major_version else ""))

    # Integrity checks BEFORE anything touches the destination.
    ok, result = verify_archive_readable(pg_restore, dump_file)
    if not ok:
        logger.error(f"Archive failed integrity check — refusing to restore: {result}")
        sys.exit(1)
    logger.info(f"Archive integrity check passed ({len(result)} objects).")

    ok, detail = verify_checksum(dump_file, manifest)
    if not ok:
        logger.error(f"Checksum verification failed — refusing to restore a possibly corrupted backup: {detail}")
        sys.exit(1)
    logger.info(f"Checksum check: {detail}")

    if not assume_yes:
        logger.warning(f"About to DROP and REBUILD schema '{target_schema}' on "
                        f"{creds['host']}:{creds['port']}/{creds['dbname']} from {dump_file.name}.")
        typed = input(f"Type the schema name ('{target_schema}') to confirm: ").strip()
        if typed != target_schema:
            logger.error("Confirmation did not match — aborting. No changes were made.")
            sys.exit(1)

    # Render the archive to plain SQL first. This step only ever reads the
    # archive and writes a local file — it cannot touch the live database, so
    # if IT fails (e.g. a corrupt archive slipped past the checks above), the
    # destination schema is still guaranteed untouched.
    fd, sql_path = tempfile.mkstemp(prefix=f"restore_{target_schema}_", suffix=".sql")
    os.close(fd)
    sql_file = Path(sql_path)
    try:
        logger.info("Rendering archive to SQL…")
        result = subprocess.run(
            [pg_restore, "--clean", "--if-exists", "--no-owner", "--no-privileges",
             "-f", str(sql_file), str(dump_file)],
            capture_output=True, text=True,
        )
        if result.returncode != 0:
            logger.error(f"Failed to render archive to SQL — the destination was not touched: {result.stderr}")
            sys.exit(1)

        # pg_restore's own --clean only drops objects IT knows about from the
        # archive, then emits a plain `DROP SCHEMA IF EXISTS schema;` (no
        # CASCADE) expecting the schema to already be empty. If the
        # destination has anything the backup doesn't know about (e.g. a
        # table added after the backup was taken), that bare DROP SCHEMA
        # fails — which is safe (see below) but not what we want for a
        # "restore to exactly this backup" operation. Prepend our own CASCADE
        # drop so the restore succeeds regardless, and keep it inside the
        # same script so it's covered by the single transaction below.
        original_sql = sql_file.read_text()
        combined_sql = f'DROP SCHEMA IF EXISTS "{target_schema}" CASCADE;\n\n' + original_sql
        sql_file.write_text(combined_sql)

        logger.info(f"Restoring '{target_schema}' as a single transaction (BEGIN…COMMIT around the "
                    f"whole script, ON_ERROR_STOP so the first error aborts immediately). If it fails "
                    f"or is interrupted at any point, PostgreSQL rolls back everything automatically — "
                    f"the destination is either fully restored or completely unchanged, never in between.")

        env = os.environ.copy()
        env["PGPASSWORD"] = creds["password"]
        cmd = [
            psql,
            "-h", creds["host"], "-p", str(creds["port"]),
            "-U", creds["user"], "-d", creds["dbname"],
            "-v", "ON_ERROR_STOP=1",
            "--single-transaction",
            "-f", str(sql_file),
        ]
        result = subprocess.run(cmd, env=env, capture_output=True, text=True)
    finally:
        sql_file.unlink(missing_ok=True)

    if result.stdout:
        for line in result.stdout.strip().splitlines()[-40:]:
            logger.info(f"  {line}")
    if result.returncode != 0:
        logger.error("Restore FAILED and was rolled back automatically by PostgreSQL — "
                      "the destination schema is unchanged. Fix the issue below and retry.")
        logger.error(result.stderr.strip())
        sys.exit(1)

    logger.info("Restore transaction committed.")

    logger.info("Verifying row counts against the backup manifest…")
    restored_counts = get_row_counts(creds, target_schema)
    expected_counts = (manifest or {}).get("row_counts")
    if expected_counts and restored_counts is not None:
        mismatches = [
            t for t in set(expected_counts) | set(restored_counts)
            if expected_counts.get(t) != restored_counts.get(t)
        ]
        if mismatches:
            logger.error(f"Row count mismatch after restore on: {', '.join(sorted(mismatches))}")
            for t in sorted(mismatches):
                logger.error(f"  {t}: expected {expected_counts.get(t)}, got {restored_counts.get(t)}")
            logger.error("The restore itself committed successfully — this mismatch means the backup's "
                         "own manifest disagrees with its contents, not that the restore was interrupted. "
                         "Investigate before trusting this schema.")
            sys.exit(1)
        logger.info(f"Verified {len(restored_counts)} tables — row counts match the backup.")
    else:
        logger.warning("No row counts available in the manifest to verify against.")

    logger.info("Restore complete.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Restore a PostgreSQL schema from a backup made by backup_schema.py. "
                     "Defaults to a dry run — pass --execute to actually restore."
    )
    parser.add_argument("--target", choices=["src", "dest"], default="dest",
                        help="Which configured connection to restore into (default: dest)")
    parser.add_argument("--file", help="Path to a .dump file (default: latest backup for the target schema)")
    parser.add_argument("--execute", action="store_true",
                         help="Actually perform the restore. Without this flag, only a dry run is done.")
    parser.add_argument("--yes", action="store_true",
                         help="Skip the interactive confirmation prompt (for automation). Only used with --execute.")
    args = parser.parse_args()  # exits before logging starts for --help / bad args

    configure_logging()

    creds = get_credentials(args.target)
    dump_file = find_backup_file(args.file, creds["schema"])
    manifest = load_manifest(dump_file)

    target_schema = (manifest or {}).get("schema") or creds["schema"]
    if manifest and manifest.get("schema") != creds["schema"]:
        logger.warning(f"Backup was taken from schema '{manifest.get('schema')}', but {args.target.upper()}_DB_SCHEMA "
                        f"is currently '{creds['schema']}'. Restoring into '{target_schema}' (the schema recorded "
                        f"in the backup) — restoring into a different schema name is not supported by this tool.")

    if not args.execute:
        dry_run(dump_file, manifest, creds, target_schema)
    else:
        execute_restore(dump_file, manifest, creds, target_schema, args.yes)
