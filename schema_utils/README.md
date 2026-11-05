# Database Schema Utilities

Tools to **clone**, **compare**, **back up**, and **restore** PostgreSQL schemas for the Skill Matrix project. Use them to refresh a dev/UAT schema from production, verify two schemas actually match after a migration, or take a safety net before a risky operation.

| Script | Purpose |
|---|---|
| [`clone_schema.py`](clone_schema.py) | Clone a source schema into a new, timestamped destination schema (tables, data, types, sequences, indexes, FKs, CHECK constraints, functions, triggers, views, comments), then dump that result to a local `.dump` file too. |
| [`compare_schemas.py`](compare_schemas.py) | Diff two schemas (tables, columns, constraints incl. CHECK, indexes, enum types, triggers, functions, views, comments) and generate a readable report. |
| [`backup_schema.py`](backup_schema.py) | Dump a schema to a restorable file with `pg_dump` — the most complete, authoritative snapshot of the four tools. |
| [`restore_schema.py`](restore_schema.py) | Restore a schema from a `backup_schema.py` dump. Defaults to a safe **dry run**; `--execute` is opt-in. |

All four scripts work whether the source and destination are **schemas in the same database** or **schemas on entirely different hosts/databases** — this is detected automatically from your connection config.

### Directory layout

```
dev-tools/ad-hoc/schema_utils/
├── clone_schema.py       ─┐
├── compare_schemas.py     │ the four tools
├── backup_schema.py       │
├── restore_schema.py     ─┘
├── README.md
├── requirements.txt
├── .env                   (git-ignored — your real credentials)
├── .env.example           (tracked — placeholder template)
├── logs/                  (git-ignored — one subfolder per script, see below)
└── backups/               (git-ignored — dump files from backup_schema.py)
```

Only these files are tracked in git; everything else here is either local config or generated output. If you find other scripts in this folder that aren't part of that list, they don't belong here — this project previously accumulated some unrelated one-off scripts (a bash clone script with hardcoded credentials, a CSV-anonymization script, a tracking spreadsheet) that have since been moved to `database/schema_utils_archive/` rather than deleted.

---

## 1. Setup

### Install dependencies

```bash
cd dev-tools/ad-hoc/schema_utils
pip install -r requirements.txt
```

`backup_schema.py` and `restore_schema.py` also need the PostgreSQL client tools (`pg_dump` / `pg_restore`) installed on your machine — see [Backing up](#4-backing-up-a-schema--backup_schemapy) for the exact install steps and a version-mismatch gotcha on Debian/Ubuntu.

### Configure credentials

1. Copy the example env file and fill in real values:

   ```bash
   cp .env.example .env
   ```

2. Edit `.env`:

   ```bash
   # Source (copied FROM / compared as baseline)
   SRC_DB_HOST=35.224.205.186
   SRC_DB_PORT=5432
   SRC_DB_USER=postgres
   SRC_DB_PASS=********
   SRC_DB_NAME=SkillMatrix-PROD
   SRC_DB_SCHEMA=skill_matrix_v2_prod

   # Destination (copied TO / compared against source)
   DEST_DB_HOST=34.47.204.166
   DEST_DB_PORT=5432
   DEST_DB_USER=postgres
   DEST_DB_PASS=********
   DEST_DB_NAME=Skill_Matrix
   DEST_DB_SCHEMA=skill_matrix_v2_uat

   # Safety — must equal the real prod schema name
   DB_SCHEMA_PROD=skill_matrix_v2_prod
   # Off by default. Set to true only for the one run that deliberately needs
   # clone_schema.py or restore_schema.py to write into a destination matching
   # DB_SCHEMA_PROD, or containing "prod" (e.g. a "..._prod_backup" naming
   # convention) — see §2/§5. Flip it back off afterward.
   ALLOW_PROD_DESTINATION=false
   ```

All `SRC_DB_*` and `DEST_DB_*` variables are **required** — there is no fallback to a shared/unprefixed `DB_*` block, so source and destination must each be fully and explicitly configured.

**Never commit `.env`.** It is already listed in `.gitignore` — only `.env.example` (with placeholder values) should ever be tracked in git.

A second `.env` is also read from `backend/.env` and loaded first, but this folder's `.env` always overrides it — in practice you should set every `SRC_DB_*` / `DEST_DB_*` value here rather than relying on `backend/.env`.

---

## 2. Cloning a schema — `clone_schema.py`

Deletes the destination schema and rebuilds it as an exact copy of the source schema: tables, data, ENUM types, sequences (with current value, type, and ownership), primary/unique/foreign/CHECK constraints, indexes, functions, triggers, views, and object/column comments. Also writes a local, restorable `.dump` file of the result — one command does the full "clone into a new dated schema + take a portable backup of it" workflow.

```bash
python3 clone_schema.py
```

Schemas are read from `.env` (`SRC_DB_SCHEMA` / `DEST_DB_SCHEMA` — both required). **`DEST_DB_SCHEMA` is always suffixed with `_YYYYMMDD_HHMMSS` before cloning** — e.g. `DEST_DB_SCHEMA=skill_matrix_v2_dev_backup` in `.env` actually clones into `skill_matrix_v2_dev_backup_20260903_153045`. This is unconditional, not a flag — every run lands in a brand-new schema, so repeated runs pile up dated copies instead of overwriting each other. The actual name used is printed to the terminal/log at the start of the run; `.env` only supplies the base name.

| Flag | Default | Meaning |
|---|---|---|
| `--skip-backup` | off | Skip **both** automatic backup dumps (pre-clone snapshot of the destination — rarely relevant now, see below — and the post-clone local `.dump` of the freshly cloned schema). Not recommended. |
| `--drop-if-exists` | — | Deprecated: destination schema is now always dropped first, so this flag has no effect. |

### What it does, step by step

0. **Suffix** `DEST_DB_SCHEMA` with the current timestamp (see above).
1. **Back up** the destination schema, via the same code path as `backup_schema.py --target dest` — skipped automatically if the (now-timestamped) destination schema doesn't exist yet, which in practice is every run, since the name is always new. This step only does something if you happen to run the script twice within the same second, or pass a `.env` schema name that already ends in the exact timestamp about to be generated. If the backup itself fails, the clone aborts here — nothing about the destination has been touched yet.
2. **Drop** the destination schema (`CASCADE`) if it exists.
3. **Create** a fresh, empty destination schema.
4. **Clone** ENUM types, sequences (type, current value, ownership), table structure, and data.
5. **Clone** indexes, foreign key constraints, CHECK constraints, functions, triggers, views, and comments — in that dependency order (functions before the triggers that call them, views after the tables they select from, comments last since they can document any of the above).
6. **Verify**: row counts are compared table-by-table between source and destination.
7. **Commit** only if every table's row count matches; otherwise the whole operation is **rolled back** and nothing is left half-done.
8. **Dump**: once committed, take a local `.dump` (+ manifest) of the newly cloned destination schema — the same code path as `backup_schema.py --target dest`, saved to `backups/`. If this step fails (disk full, `pg_dump` missing, …), it's logged as an error but does **not** undo the clone or fail the run — the schema clone already succeeded and stands on its own; you'd just need to run `backup_schema.py` manually to get a file.

Same-database clones use fast native SQL (`CREATE TABLE ... LIKE ... INCLUDING ALL`, `INSERT ... SELECT`). Cross-database clones rebuild table structure from `information_schema` and stream data with PostgreSQL's binary `COPY` protocol — no intermediate files.

### Safety rules (built in, not optional)

- Because the destination schema name is always freshly timestamped, `clone_schema.py` never overwrites an existing schema in normal use — there is no incremental/merge mode, and (unlike before) also effectively no overwrite mode. Old clones are left in place; clean them up manually (`DROP SCHEMA ... CASCADE`) once you no longer need them.
- The script **refuses to run** if the destination schema exactly matches `DB_SCHEMA_PROD`.
- The script **refuses to run** if the destination schema name contains `prod` in any case (`prod`, `Prod`, `PROD`, `myprodcopy`, ...) — checked against the full timestamped name.
- Both of the above can be deliberately overridden by setting `ALLOW_PROD_DESTINATION=true` in `.env` — useful for a naming convention like `..._prod_backup` that legitimately needs "prod" in the name. The script logs a loud warning every time the override fires.
- On any failure mid-clone, the transaction is rolled back — the destination schema is left untouched, not half-populated.

Keep `DB_SCHEMA_PROD` in `.env` set to your real production schema name at all times so these checks stay effective, and keep `ALLOW_PROD_DESTINATION` off except for the one run that needs it.

### Logs

Every run writes a timestamped log file, in addition to printing progress to the terminal — e.g. `logs/clone_schema/clone_schema_20260710_120347.log`. Check there first if a clone fails partway through.

**Every script logs to its own subfolder** under `logs/` — `clone_schema/`, `compare_schemas/`, `backup_schema/`, `restore_schema/` — so a busy history from one tool never buries another's. This applies to all four scripts, not just `clone_schema.py`; see [§8 Logging](#8-logging) for the full explanation.

---

## 3. Comparing schemas — `compare_schemas.py`

Verifies two schemas actually match — useful right after a clone, or to catch drift between environments.

```bash
python3 compare_schemas.py
```

Optional flags:

```bash
python3 compare_schemas.py --s1 skill_matrix_v2_prod --s2 skill_matrix_v2_uat --out report.txt
```

| Flag | Default | Meaning |
|---|---|---|
| `--s1` | `SRC_DB_SCHEMA` from `.env` | Source/baseline schema |
| `--s2` | `DEST_DB_SCHEMA` from `.env` | Destination schema to compare against `--s1` |
| `--out` | `schema_comparison_report.txt` (written next to the script) | Report output path |

### What gets compared

- **Tables** — present in one schema but not the other. Views are reported separately, below — not folded into this list.
- **Columns** — missing/extra columns, and type / nullability / length mismatches on shared columns.
- **Constraints** — primary keys, foreign keys, unique, and CHECK constraints, shown as readable definitions (e.g. `FOREIGN KEY (batch_id) REFERENCES training_batches(id) ON DELETE CASCADE`) rather than raw internal identifiers. Matched by **name as well as definition** — an identically-defined constraint under a different name is reported as a real mismatch, not silently treated as equivalent.
- **Indexes** — indexes other than those already backing a primary/unique key (to avoid double-reporting the same thing twice).
- **Enum types** — missing enum types and differing label sets.
- **Triggers** — missing/extra triggers per table, and definition changes (timing, function called, etc.).
- **Functions** — missing/extra functions, and body changes.
- **Views** — missing/extra views, and changes to the actual query body (via `pg_get_viewdef`), not just whether the view exists.
- **Comments** — missing/extra/changed comments on tables, views, columns, and functions.

### Reading the report

The report opens with a **SUMMARY** table so you can see pass/fail per category at a glance, followed by one detailed section per category (only populated when there's something to show):

```
+----------------------------------+----------+
| Check                            | Result   |
+==================================+==========+
| Tables                           | OK       |
| Columns                          | MISMATCH |
| Constraints (PK/FK/UNIQUE/CHECK) | OK       |
| Indexes                          | OK       |
| Enum types                       | OK       |
| Triggers                         | OK       |
| Functions                        | OK       |
| Views                            | OK       |
| Comments                         | OK       |
+----------------------------------+----------+

Overall result: MISMATCH — differences found
```

The same summary is also printed to the terminal, so for a quick check you don't need to open the report file at all.

### Using it in scripts / CI

The process exits with status `0` when the schemas match and `1` when any difference was found — safe to use as a gate after a clone/migration:

```bash
python3 compare_schemas.py && echo "schemas match"
```

---

## 4. Backing up a schema — `backup_schema.py`

Dumps a schema to a single restorable file with `pg_dump` — the most complete and authoritative snapshot of the four tools, since it's `pg_dump` itself doing the work rather than a hand-rolled metadata rebuild. `clone_schema.py`'s cross-database path also clones views, functions, triggers, and CHECK constraints now, but still doesn't reproduce a handful of finer-grained sequence properties (a custom min/max/increment/cache/cycle outside the base type's default range) or RLS policies — use `backup_schema.py` when you need an exact, restorable snapshot rather than just a working copy.

### Install the PostgreSQL client tools

```bash
sudo apt install -y postgresql-client   # or a specific version, see below
pg_dump --version
```

**Version-mismatch gotcha (Debian/Ubuntu):** `pg_dump` refuses to dump from a server *newer* than itself. If your server is on a newer major version than the default apt package provides (e.g. server is PostgreSQL 17 but `apt install postgresql-client` gives you 16), add the official PGDG repo and install the matching client:

```bash
sudo apt install -y postgresql-common
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
sudo apt update
sudo apt install -y postgresql-client-17   # match your server's major version
```

Separately, on machines that also run a local PostgreSQL cluster, the plain `pg_dump`/`pg_restore` on `PATH` is Debian's `pg_wrapper`, which guesses which installed version to run by matching the **port** against locally running clusters — it does not look at `-h`/`--host`. If a local cluster happens to share a port with the remote server you're targeting (both default to 5432), the wrapper can silently run the wrong version. Both `backup_schema.py` and `restore_schema.py` work around this automatically: they query the target server's actual version first and call the versioned binary directly (`/usr/lib/postgresql/<version>/bin/pg_dump`) instead of trusting `PATH`.

### Usage

```bash
python3 backup_schema.py --target dest
```

| Flag | Default | Meaning |
|---|---|---|
| `--target` | `dest` | Which configured connection to back up: `src` (`SRC_DB_*`) or `dest` (`DEST_DB_*`). Defaults to `dest` — the schema `clone_schema.py` would overwrite. |
| `--schema` | schema configured for `--target` | Override the schema name to back up. |
| `--out-dir` | [`backups/`](backups/) next to the script | Where to write the dump. |

Each run produces two files in `backups/`:
- `<schema>_<timestamp>.dump` — the actual `pg_dump` custom-format archive (compressed, restorable with `pg_restore`).
- `<schema>_<timestamp>.dump.json` — a manifest recording where it came from, a per-table row count snapshot, and a SHA-256 checksum of the dump — all used by `restore_schema.py` to verify a later restore.

`backups/` is git-ignored, same as `logs/` — treat it as local/disposable storage, not a durable off-machine backup location.

### What happens if the backup is interrupted partway (network drop, disk full, killed process)

`pg_dump` writes to a temporary `<schema>_<timestamp>.dump.inprogress` file first — never directly to the final `.dump` name. Only after the dump finishes is the file:
1. Verified readable (`pg_restore -l` against it — catches truncation),
2. Checksummed (SHA-256, recorded in the manifest), and
3. **Atomically renamed** to its final name.

If `pg_dump` fails, is killed, or the process dies at any point before all three of those succeed, the `.inprogress` file is deleted and no `.dump` file is ever created at the final path. This means: **if a file exists at `backups/<schema>_<timestamp>.dump`, it is guaranteed complete** — nothing in this toolkit will ever pick up a partial backup, because a partial one can never reach that filename.

---

## 5. Restoring a schema — `restore_schema.py`

Restores a schema from a `backup_schema.py` dump. **Defaults to a dry run** — it never touches the database unless you pass `--execute`.

```bash
# Dry run (default, safe) — shows what WOULD happen, makes no changes
python3 restore_schema.py --target dest

# Actually restore, after you've reviewed the dry run
python3 restore_schema.py --target dest --execute
```

| Flag | Default | Meaning |
|---|---|---|
| `--target` | `dest` | Which configured connection to restore into. |
| `--file` | latest backup in `backups/` matching the target's schema | Path to a specific `.dump` file. |
| `--execute` | off | Actually perform the restore. Without it, only a dry run runs. |
| `--yes` | off | Skip the interactive "type the schema name to confirm" prompt (for automation). Only relevant with `--execute`. |

### What the dry run shows

- The same **prod-name safety check** `clone_schema.py` enforces (blocks `DB_SCHEMA_PROD` or any schema name containing `prod`, overridable with `ALLOW_PROD_DESTINATION=true` in `.env`), so a blocked restore is caught before you ever pass `--execute`.
- **Archive integrity** (`pg_restore -l`) — proves the file is valid and readable, and lists what it contains.
- **Checksum verification** — recomputes the backup file's SHA-256 and compares it against what the manifest recorded at backup time.
- What currently exists in the destination schema right now — i.e. **exactly what `--execute` would replace**.
- The row counts recorded in the backup's manifest, for comparison.

### What `--execute` does, and why a failure mid-restore is safe

1. Re-runs the safety check, archive integrity check, and checksum check — **any of these failing aborts before anything touches the destination.**
2. Prompts you to type the destination schema name to confirm (skip with `--yes`).
3. Renders the backup archive to a plain SQL script (`pg_restore --clean --if-exists`) — this only reads the archive and writes a local temp file, so it cannot touch the database even if it fails.
4. Prepends a `DROP SCHEMA IF EXISTS ... CASCADE` to that script. (`pg_restore --clean` on its own only drops objects *it knows about from the archive*, then emits a plain `DROP SCHEMA` — which fails if the destination has anything extra the backup doesn't know about. The CASCADE prefix guarantees the restore succeeds regardless of what's currently in the destination.)
5. Runs the whole script through `psql --single-transaction -v ON_ERROR_STOP=1` — the **entire drop + rebuild happens as one PostgreSQL transaction.**
6. Verifies the restored row counts against the backup manifest and fails loudly if any table doesn't match.

Step 5 is the important one: because the drop and the full rebuild are one transaction, **there is no state where the destination is half-restored.** If `psql` is killed, the network drops, the disk fills up, or any statement errors, PostgreSQL rolls back the entire transaction automatically (this happens server-side — even an abruptly closed connection triggers it) and the destination schema is left in exactly the state it was in before `--execute` ran. You retry the same command; nothing needs manual cleanup.

**Restores always target the schema name recorded in the backup's manifest**, not whatever `DEST_DB_SCHEMA` happens to be set to at restore time — if they differ, `restore_schema.py` warns you and uses the manifest's schema name. Restoring a backup into a *different* schema name than it was taken from isn't supported.

---

## 6. Recommended workflow

`clone_schema.py` always clones into a freshly timestamped destination schema (see [§2](#2-cloning-a-schema--clone_schemapy)) — it never overwrites an existing one in normal use, so the classic "refresh this fixed schema in place" pattern no longer applies as-is. To clone and confirm it worked:

```bash
python3 clone_schema.py       # prints the actual timestamped destination schema name it used
python3 compare_schemas.py --s2 <the timestamped schema name from the output above>
```

If you need the result to live under a *stable*, predictable name (e.g. because something else — the app, another script — points at `DEST_DB_SCHEMA` as configured in `.env`), rename it after cloning, or point the consumer at the new timestamped schema instead. `clone_schema.py` itself won't do that renaming for you.

If the clone itself failed partway through, there's nothing to restore — step 7's transaction already rolled back automatically, so the destination is untouched (or, for a brand-new timestamped name, simply doesn't exist). Just fix the underlying problem and re-run.

If the clone *succeeded* but something looks wrong with the result, or the live schema gets modified/corrupted later and you want it back the way it was right after cloning, restore from the local `.dump` clone_schema.py made in step 8. `restore_schema.py`'s default file lookup searches `backups/` using `DEST_DB_SCHEMA` from `.env` (the *base* name) with a wildcard suffix, so it *does* match a dump filed under the full timestamped name, and picks the most recent one automatically. You only need `--file` explicitly when you want a *specific* backup for that base name rather than the latest — e.g. an older clone's dump after a newer one has since been made:

```bash
python3 restore_schema.py --target dest --file backups/<the timestamped schema name>_<backup-timestamp>.dump              # dry run
python3 restore_schema.py --target dest --file backups/<the timestamped schema name>_<backup-timestamp>.dump --execute    # actually restore
```

If you'd rather just start over, that's simpler than restoring: drop the bad schema and re-run `clone_schema.py` to get a new timestamped clone.

```bash
psql ... -c 'DROP SCHEMA "<the timestamped schema name>" CASCADE;'
python3 clone_schema.py
```

`clone_schema.py` already verifies row counts internally, but `compare_schemas.py` additionally checks structural details (columns, constraints, indexes, enums) that a row-count check can't catch — e.g. a foreign key or index that failed to apply.

---

## 7. Best practices

- **`DEST_DB_SCHEMA` in `.env` is only a base name** — `clone_schema.py` always appends a timestamp before cloning, so the schema that actually gets created is never exactly what's written in `.env`. Read the actual name from the run's output/log, don't assume it matches `.env` verbatim.
- **Old timestamped clones aren't cleaned up automatically** — both the live schemas in the DB and the `.dump` files each run adds to `backups/`. Since nothing gets overwritten anymore, repeated runs accumulate both — periodically `DROP SCHEMA ... CASCADE` schemas and prune old files you no longer need, or you'll build up clutter (and storage) over time.
- **You don't need to babysit backups or restores for interruptions.** `backup_schema.py` only ever produces a complete, checksummed file at its final name — a killed process or dropped connection leaves nothing usable behind. `restore_schema.py --execute` runs as one PostgreSQL transaction — a failure partway rolls back automatically, and the destination is either fully restored or completely untouched, never in between. Just re-run the command.
- **Always dry-run `restore_schema.py` before `--execute`.** The dry run is free, shows exactly what would be dropped, and catches a blocked prod restore before it matters.
- **Always double-check `.env` before running `clone_schema.py`** — it is destructive to whatever schema `DEST_DB_SCHEMA` points at. Confirm you're not accidentally pointed at someone else's environment.
- **Keep `DB_SCHEMA_PROD` accurate.** It's the only thing standing between an accidental typo and dropping production — for both `clone_schema.py` and `restore_schema.py`.
- **Treat `ALLOW_PROD_DESTINATION` as a momentary flag, not a permanent `.env` setting.** Flip it on for the one run that needs it, then back off — leaving it `true` in a `.env` you keep around (or hand to a teammate) quietly disables the prod-name protection for every run after, not just the one that needed it.
- **Run `compare_schemas.py` after every clone or manual migration**, not just when something looks wrong — it's cheap and catches silent drift (a missing index or FK won't break anything until it does).
- **Never commit `.env`.** Only `.env.example` (placeholder values) belongs in git.
- **Treat `logs/` and `backups/` as local/disposable**, not a durable backup strategy — check `logs/` first when a clone or restore fails, and don't rely on `backups/` as your only copy of anything important.

---

## 8. Logging

Each of the four scripts writes its own timestamped log file, in its own subfolder:

```
logs/
├── clone_schema/clone_schema_20260710_120347.log
├── compare_schemas/compare_schemas_20260710_124406.log
├── backup_schema/backup_schema_20260710_124419.log
└── restore_schema/restore_schema_20260710_124431.log
```

Every log line is also printed to the terminal at the same time — the file is a persistent copy, not a separate/quieter channel. `logs/` (all subfolders) is git-ignored, same as `backups/`.

Two things worth knowing about how logging is wired up, since they affect how clean this folder stays:

- **Importing a script for its functions never creates a log file.** Each script defines its logger at import time but doesn't attach a file handler until `configure_logging()` runs — and that's only called from the script's own `if __name__ == "__main__":` block, after argument parsing. So `python3 -c "import backup_schema"` (e.g. to reuse a helper in another tool, or in a Python shell) touches nothing on disk. This used to be a real bug: earlier versions called `logging.basicConfig()` at the top of the file, so merely importing the module for one function created an empty log — that's exactly how several 0-byte files ended up in the old flat `logs/` folder before this cleanup.
- **`--help` and invalid arguments don't create a log file either** — logging is only configured after `argparse` has successfully parsed the command line, so a typo'd flag or a `--help` check doesn't leave a stray file behind.

If you're debugging a failure, the log file has everything the terminal showed you, in order, with timestamps — there's nothing extra you need to enable.

---

## 9. Troubleshooting

| Symptom | Likely cause |
|---|---|
| `Error: Missing SOURCE DB config: ...` / `Missing DESTINATION DB config: ...` / `SRC_DB_SCHEMA and DEST_DB_SCHEMA must both be set` | A required `SRC_DB_*` or `DEST_DB_*` var isn't set — there's no fallback. Check `.env` against `.env.example`. |
| `Refusing to use destination schema '...' because it matches DB_SCHEMA_PROD` | `DEST_DB_SCHEMA` is the same as `DB_SCHEMA_PROD` — pick a non-prod destination. |
| `Refusing to restore into destination schema '...' because it matches DB_SCHEMA_PROD` / `...because schema names containing 'prod' are protected` | Same protection as `clone_schema.py`, enforced by `restore_schema.py --execute` too — pick a non-prod destination, or set `ALLOW_PROD_DESTINATION=true` in `.env` to proceed anyway. |
| `Refusing to use destination schema '...' because schema names containing 'prod' are protected` | Destination schema name contains `prod` — rename it. |
| Clone fails partway through | Check the matching file in `logs/clone_schema/` for the failing statement; the transaction was rolled back automatically, so the destination schema is unchanged. |
| `compare_schemas.py` reports a schema has "no tables" | Double-check the schema name spelling in `.env` / `--s1` / `--s2` — this usually means a typo, not a real empty schema. |
| `pg_dump: error: aborting because of server version mismatch` | Your `pg_dump`/`pg_restore` client is older than the target server's major version. Install a matching client — see [Backing up](#4-backing-up-a-schema--backup_schemapy). |
| `Required tool 'pg_dump'/'pg_restore' not found on PATH` | Install the PostgreSQL client tools (see [Backing up](#4-backing-up-a-schema--backup_schemapy)). |
| `No backups found for schema '...' in backups/` | Run `backup_schema.py` first, or pass `--file` pointing at an existing `.dump`. |
| `Checksum verification failed — refusing to restore a possibly corrupted backup` | The `.dump` file's contents don't match the checksum recorded in its manifest at backup time (disk corruption, a bad copy between machines, manual editing). Don't use this file — re-run `backup_schema.py` to get a fresh one. |
| `Archive failed integrity check` / `Could not read archive table of contents` | The `.dump` file is truncated or unreadable by `pg_restore`. Because `backup_schema.py` only ever produces complete, verified files at their final name, this should only happen to a file you moved/copied/edited manually — re-run the backup. |
| `Restore FAILED and was rolled back automatically by PostgreSQL` | Something errored partway through `--execute` (bad SQL, permissions, disk full, dropped connection). Thanks to `--single-transaction`, the destination schema is guaranteed unchanged — read the error above it, fix the underlying issue, and just re-run the same command. |
| Restore's row-count verification fails **after** "Restore transaction committed" | This is different from the above: the restore itself succeeded and committed, but the row counts don't match the backup's manifest. That points to the manifest and the dump disagreeing with each other (a bug, not an interruption) — investigate before trusting the restored schema, and consider re-running `backup_schema.py` against the original source if it's still available. |
