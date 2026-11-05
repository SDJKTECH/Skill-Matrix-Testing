import os
import sys
import json
import shutil
import hashlib
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
LOGS_DIR = SCRIPT_DIR / "logs" / "backup_schema"

LOCAL_ENV = SCRIPT_DIR / ".env"
BACKEND_ENV = BASE_DIR / "backend" / ".env"
load_dotenv(BACKEND_ENV)
load_dotenv(LOCAL_ENV, override=True)

# Module-level logger — no handlers attached yet, so importing this file (e.g.
# to reuse a helper function) never creates a log directory or file. Handlers
# are only attached by configure_logging(), called from the __main__ block.
logger = logging.getLogger("backup_schema")


def configure_logging():
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    log_filename = LOGS_DIR / f"backup_schema_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
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

    On Debian/Ubuntu, plain `pg_dump`/`pg_restore` on PATH is a wrapper
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
    return True, f"{len(toc_lines)} objects"


def check_disk_space(path, min_free_mb=500):
    try:
        free_mb = shutil.disk_usage(path).free / (1024 * 1024)
        if free_mb < min_free_mb:
            logger.warning(f"Low disk space at {path}: {free_mb:.0f} MB free. "
                            f"The dump may fail partway through if space runs out.")
    except OSError as e:
        logger.warning(f"Could not check disk space at {path}: {e}")


# ─────────────────────── Row Counts ───────────────────────

def get_row_counts(creds, schema):
    """Return {table: row_count} for verification purposes. Best-effort — never fatal."""
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
        logger.warning(f"Could not capture row counts for manifest: {e}")
        return None


# ─────────────────────── Backup ───────────────────────

def run_pg_dump(creds, schema, tmp_file, pg_dump):
    env = os.environ.copy()
    env["PGPASSWORD"] = creds["password"]

    cmd = [
        pg_dump,
        "-h", creds["host"], "-p", str(creds["port"]),
        "-U", creds["user"], "-d", creds["dbname"],
        "-n", schema,
        "-Fc",                    # custom format — compressed, supports pg_restore -l / selective restore
        "--no-owner", "--no-privileges",
        "-f", str(tmp_file),
        "-v",
    ]
    logger.info(f"Running: pg_dump -h {creds['host']} -p {creds['port']} -U {creds['user']} "
                f"-d {creds['dbname']} -n {schema} -Fc -f {tmp_file}")

    # Note: pg_dump takes a single consistent MVCC snapshot of the whole
    # schema internally (a REPEATABLE READ transaction), so a concurrently
    # changing database can never produce a torn/inconsistent dump — that
    # part is handled by PostgreSQL itself, not by anything in this script.
    process = None
    try:
        with subprocess.Popen(
            cmd,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        ) as process:
            for line in process.stdout:
                logger.info(f"  {line.rstrip()}")

            return process.wait() == 0
    except KeyboardInterrupt:
        logger.warning("Interrupted — stopping pg_dump and removing the partial backup file.")
        if process is not None:
            process.terminate()
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                logger.warning("pg_dump did not stop after SIGTERM; killing it.")
                process.kill()
                process.wait()
        raise


def backup_schema(target, schema_override=None, out_dir=None):
    creds = get_credentials(target)
    schema = schema_override or creds["schema"]
    out_dir = Path(out_dir) if out_dir else BACKUPS_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    check_disk_space(out_dir)

    major_version = get_server_major_version(creds)
    pg_dump = resolve_client_binary("pg_dump", major_version)
    pg_restore = resolve_client_binary("pg_restore", major_version)
    logger.info(f"Using pg_dump: {pg_dump}" + (f" (server is PostgreSQL {major_version})" if major_version else ""))

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_file = out_dir / f"{schema}_{timestamp}.dump"
    # Dump to a temp path first. Only a file that exists at `out_file` (the
    # final name) is ever treated as a real backup — nothing renames it there
    # except a fully-written, integrity-checked, checksummed dump. If pg_dump
    # is killed, the network drops, or the disk fills up mid-dump, all that's
    # left behind is a `.inprogress` file that no other tool will ever pick up.
    tmp_file = out_file.with_suffix(out_file.suffix + ".inprogress")

    logger.info("=" * 60)
    logger.info("PostgreSQL Schema Backup")
    logger.info("=" * 60)
    logger.info(f"Target   : {target.upper()}  ({creds['host']}:{creds['port']}/{creds['dbname']})")
    logger.info(f"Schema   : {schema}")
    logger.info(f"Output   : {out_file}")
    logger.info("=" * 60)

    try:
        if not run_pg_dump(creds, schema, tmp_file, pg_dump):
            logger.error("pg_dump failed — no backup file was produced.")
            sys.exit(1)

        logger.info("Verifying the dump is readable before trusting it…")
        ok, detail = verify_archive_readable(pg_restore, tmp_file)
        if not ok:
            logger.error(f"Dump failed integrity verification (archive unreadable): {detail}")
            sys.exit(1)
        logger.info(f"Integrity check passed: {detail}")

        logger.info("Computing checksum…")
        checksum = sha256_of(tmp_file)

        logger.info("Capturing row counts for restore-time verification…")
        row_counts = get_row_counts(creds, schema)

        manifest = {
            "schema": schema,
            "host": creds["host"],
            "port": creds["port"],
            "dbname": creds["dbname"],
            "target": target,
            "created_at": datetime.now().isoformat(timespec="seconds"),
            "file": out_file.name,
            "format": "custom",
            "pg_dump_flags": ["-n", schema, "-Fc", "--no-owner", "--no-privileges"],
            "row_counts": row_counts,
            "sha256": checksum,
            "size_bytes": tmp_file.stat().st_size,
        }

        # Promote temp file -> final name only now that it's fully verified.
        # Path.rename() is an atomic operation on the same filesystem, so the
        # final `.dump` path never appears in a half-written state.
        tmp_file.rename(out_file)

        manifest_file = out_file.with_suffix(out_file.suffix + ".json")
        manifest_file.write_text(json.dumps(manifest, indent=2))
    except BaseException:
        tmp_file.unlink(missing_ok=True)
        raise

    size_mb = out_file.stat().st_size / (1024 * 1024)
    logger.info(f"Backup complete: {out_file.name} ({size_mb:.2f} MB, sha256 {checksum[:12]}…)")
    logger.info(f"Manifest written: {manifest_file.name}")
    logger.info(f"Restore (dry run by default): python3 restore_schema.py --file {out_file}")
    return out_file


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Back up a PostgreSQL schema with pg_dump (custom format, restorable with restore_schema.py)."
    )
    parser.add_argument("--target", choices=["src", "dest"], default="dest",
                        help="Which configured connection to back up: 'src' = SRC_DB_*, "
                             "'dest' = DEST_DB_* (default: dest — the schema clone_schema.py would overwrite)")
    parser.add_argument("--schema", help="Override the schema name read from .env")
    parser.add_argument("--out-dir", help=f"Directory to write the backup to (default: {BACKUPS_DIR})")
    args = parser.parse_args()  # exits before logging starts for --help / bad args

    configure_logging()
    backup_schema(args.target, schema_override=args.schema, out_dir=args.out_dir)
