# add_training_v2 Function Documentation

## Overview

`add_training_v2` is a Google Cloud Function that manages employee training records in the Skill Matrix application. Training metadata is split across two tables:

- **`training_batches`** — one row per physical training run/cohort (batch number, schedule, mode, trainer, status, dates, etc.), linked to a training hierarchy (area/subarea/module) via `training_hierarchy_id`.
- **`employee_trainings`** — one row per employee enrolled in a batch, linked to the batch via `batch_id`.

The function supports full CRUD for both employee-training enrollments and training batches themselves, resolves the training hierarchy (area → subarea → module) automatically via a get-or-create pattern, resolves/creates training batches via a similar get-or-create pattern, and provides suggestion endpoints for frontend autocomplete/dropdowns.

**Location**: Entry points are defined in `backend/data/addTraining_v2/main.py`. Supporting methods are available in `backend/data/addTraining_v2/service.py`. Any additional constants are maintained in `backend/data/addTraining_v2/constants.py`.

**Trigger**: HTTP GET, POST, PUT, DELETE request

**Port (Local Development)**: 8080 (via `functions-framework --target=add_training_v2 --debug`)

**Database Library**: SQLAlchemy ORM

---

## Purpose

This function serves as the administrative endpoint for managing employee training enrollments and the training batches they belong to. Administrators (`dept`/`department`/`admin`/`hr` roles) can:

1. **GET** — Retrieve all training records, a specific one by ID, all records for an employee, or all records for a batch
2. **GET (suggestions)** — Autocomplete data for employees, competencies, training hierarchies, and enum values (`employee_type`, `training_status`, `batch_status`, `training_mode`)
3. **POST (single)** — Create a single employee training enrollment (hierarchy + batch auto-resolved/created)
4. **POST (batch)** — Create multiple enrollments in one request using a `trainings` array
5. **POST (bulk upload)** — Bulk-import enrollments from a CSV/Excel file, grouped by batch number, with per-batch and per-row error isolation
6. **PUT** — Update an existing enrollment (partial update — only provided fields are changed)
7. **DELETE** — Remove an enrollment
8. **GET/POST/PUT/DELETE `/training_batch`** — Manage training batch records directly (metadata, schedule, trainer, status, etc.) independent of any specific enrollment

**Key Feature**: Every write operation on employee-training enrollments (POST, PUT, DELETE, bulk upload) triggers a **full re-export** of `employee_trainings` (joined with employee, batch, and hierarchy data) to a CSV file (`employee-training/master_employee_training.csv`) in a GCS bucket, keeping a downloadable master reference always up to date.

**Email Notifications** (`notifications.py`, best-effort on failure — a send failure is caught and logged, never raised to the caller, but the send itself runs synchronously):

- **Nomination submitted** (POST with `nomination_request` truthy) → emails the employee's manager (`employee.reports_to`, resolved by `get_manager_info()`) via `nomination_submitted.html`.
- **Nomination decision** (PUT, only when the record's *previous* `training_status` was `Pending Approval` and it's being explicitly changed to `Not Started` or `Not Completed`) → emails the employee: `training_approved.html` for `Not Started`, `training_rejected.html` (with `status_remarks` as the reason) for `Not Completed`. An unrelated status edit elsewhere (e.g. `EnrollmentTable.jsx`) doesn't trigger this.
- Transport: POST `{to, subject, body}` to `SEND_EMAIL_URL` (same pattern as `saveEmployeeSkill_v2`'s L3 review email); needs `SEND_EMAIL_URL` — missing config or recipient just logs a warning and skips. The deep link's base URL comes from `resolve_app_url()` (`notifications.py`): the request's `Origin` header first, falling back to `APP_URL` only when `Origin` is absent or malformed.
- Every attempt is logged with a `[training-email]` tag plus `event=<nomination_submitted|approved|rejected> employee_training_id=<id>` for tracing.

---

## Function Flow

### Entry Point: `add_training_v2(request)`

The main Cloud Function handler routes HTTP requests to the appropriate handler.

#### 1. CORS Handling

- Handles `OPTIONS` preflight requests (204 No Content)
- Sets CORS headers for all origins (`*`)
- Allows `GET`, `POST`, `PUT`, `DELETE`, and `OPTIONS` methods
- Includes `Authorization` header in allowed headers
- Sets `Access-Control-Max-Age: 3600` for preflight caching

#### 2. Path-Based Routing

The handler first checks whether `/training_batch` appears anywhere in the (lower-cased, trailing-slash-stripped) request path. If so, it routes to the **training batch** handlers; otherwise it falls back to the original employee-training routes.

| Method | Path                                          | Handler                             |
| ------ | ---------------------------------------------- | ------------------------------------ |
| GET    | `/training_batch` (`?batch_id=` / `?batch_num=`) | `handle_get_training_batch()`       |
| POST   | `/training_batch`                              | `handle_post_training_batch()`      |
| PUT    | `/training_batch`                              | `handle_put_training_batch()`       |
| DELETE | `/training_batch?batch_id=<int>&admin_id=<int>` | `handle_delete_training_batch()`   |
| GET    | `/?suggest=<type>[&q=<search>]`                | `handle_suggestions()`               |
| GET    | `/?download_report=<any>&admin_id=<int>`       | `handle_report_download()`           |
| GET    | `/` or `/?id=` or `/?employee_id=` or `/?batch_id=` | `handle_get()`                  |
| POST   | `/bulk-upload`                                 | `handle_bulk_upload()`               |
| POST   | `/`                                             | `handle_post()` (single or batch)   |
| PUT    | `/`                                             | `handle_put()`                       |
| DELETE | `/?id=<int>&admin_id=<int>`                    | `handle_delete()`                    |
| Other  | —                                               | 405 Method Not Allowed               |

Note: suggestion routing (`?suggest=`) is only checked for the non-`/training_batch` path, and only for GET requests. It runs *before* the report-download / bulk-upload / plain-GET checks.

#### 3. Centralized Error Handling (top-level `add_training_v2` try/except)

- **ValueError** with `"Access denied"` in the message → 403 Forbidden
- **ValueError** (any other message) → 400 Bad Request
- **SQLAlchemyError** with `"violates foreign key constraint"` or `"IntegrityError"` in the message → 409 Conflict
- **SQLAlchemyError** with `"violates check constraint"` in the message → 400 Bad Request (e.g. a batch's `end_date >= start_date` check)
- **SQLAlchemyError** (any other) → 500 Internal Server Error
- **General Exception** → 500 Internal Server Error

`ConflictError` (raised by `resolve_training_batch` when a `batch_num` already exists under a *different* training hierarchy) is now also caught here, mirroring the dedicated `/training_batch` handlers: returns 409, with `employee_training_count` included in the body if the error carries one. This covers `handle_post`/`handle_put`/`handle_bulk_upload` (the employee-training handlers), which have no local try/except of their own and rely on this top-level catch.

The dedicated training-batch handlers (`handle_get_training_batch`, `handle_post_training_batch`, `handle_put_training_batch`, `handle_delete_training_batch`) each wrap their call to the corresponding `service.py` function in their own try/except:

- **ValueError** → 403 if `"Access denied"` in message, else 400
- **ConflictError** → 409 (with `employee_training_count` in the body for delete, if present)
- **Exception** → 500

---

## Core Functions (`service.py`, imported by `main.py`)

### `get_db_engine()`

Creates a SQLAlchemy engine (`NullPool`) from `DB_USER`, `DB_PASS`, `DB_NAME`, `DB_HOST`, `DB_PORT` env vars. Identical copy exists in both `main.py` and `service.py`.

**Database URL Format**: `postgresql+psycopg2://{user}:{pass}@{host}:{port}/{dbname}`

### `check_role_authorization(admin_id, connection, schema)`

Validates that the employee (`admin_id`) has an authorized role. Looks up `employee.role` for the given id.

**Allowed roles** (case-insensitive): `dept`, `department`, `admin`, `hr`

**Raises** `ValueError` if the employee is not found, has no role, or has an unauthorized role (e.g. `Manager`, `User`).

**Note**: `admin_id` is the person *performing* the action, never the target employee.

### `get_enum(enum_name)` / `load_training_enums()`

Loads and caches (`ENUM_CACHE`, process-lifetime — loaded once per warm Cloud Function instance) the live PostgreSQL enum values for `training_status` (`training_status_enum`), `employee_type` (`employee_type_enum`), `batch_status` (`training_batch_status_enum`), and `training_mode` (`training_mode_enum`) by querying `enum_range()` against the configured schema. Used both for validation and for the static suggestion endpoints. Because the cache never expires, a new enum value added to the DB won't be recognized by an already-warm instance until it cold-starts.

Current enum members, queried live from DB (informational — the code always fetches these live rather than hardcoding them):

| Enum | Values |
| --- | --- |
| `training_status_enum` | `Not Started`, `In Progress`, `Completed`, `Not Completed` |
| `employee_type_enum` | `New Lateral`, `Existing Lateral`, `Freshers`, `Customer`, `Interns` |
| `training_batch_status_enum` | `Planned`, `Open`, `In Progress`, `Completed`, `Cancelled`, `Archived` |
| `training_mode_enum` | `Internal Videos`, `External Platforms`, `Hybrid`, `Internal Instructor-led`, `External Instructor-led` |

### Normalization helpers

| Function | Purpose |
| --- | --- |
| `normalize_date(val)` | Accepts a string / `date` / `datetime` / `pandas.Timestamp` and returns `YYYY-MM-DD`, trying `_DATE_FORMATS` (12 formats) then a locale-independent `DD-Mon-YY(YY)` fallback (also normalizes non-ASCII dash characters). Returns the raw string unmodified if nothing matches. |
| `normalize_training_status(raw)` | Maps free-text status values (e.g. `"done"`, `"in-progress"`) to canonical `training_status` enum values via `STATUS_NORMALIZATION`; returns `(canonical_or_None, warning_or_error)`. |
| `normalize_employee_type(raw)` | Case-insensitive match against `employee_type` enum, also tolerating singular/plural (`Intern` → `Interns`). |
| `normalize_training_Batch_status(raw)` | Same pattern as training-status normalization but against `batch_status`, via `BATCH_STATUS_NORMALIZATION`. |
| `normalize_training_mode(raw)` | Same pattern against `training_mode`, via `TRAINING_MODE_NORMALIZATION`. |
| `_safe_value(field_value)` | Normalizes a pandas cell: `NaN`/`None`/empty → `None`, integer-valued floats (`1234.0`) → `"1234"`, dates → `YYYY-MM-DD`, otherwise trimmed string. Used during bulk-upload batch resolution. |

Batch numbers are free-form `varchar(255)` (validated for non-empty and ≤255 chars in `validate_training_batch`), not `YYYY-MM` — the old `normalize_batch()` helper that enforced a 7-char `YYYY-MM` batch-code format has been removed; it was dead code with no call sites.

### `resolve_training_hierarchy(area_name, sub_area_name, module_name, connection, schema, ...)`

Resolves or creates rows in `master_area`, `master_subarea`, `master_module`, then resolves or creates the linking row in `training_hierarchy_links`, returning `training_hierarchy_id`. Each step: SELECT case-insensitively → INSERT if missing → on INSERT failure (race), roll back and SELECT again. Optional description/course-level fields are used only on first-time INSERT.

### `resolve_training_batch(connection, schema, training_hierarchy_id, batch_num, batch_description, start_date, end_date, batch_status="Planned", training_mode=None, training_quarter=None, batch_status_remarks=None, duration=None, trainer=None, batch_size=None, prerequisite=None, training_content=None, resources=None, bulk_insert=False)`

Looks up `training_batches` by `batch_num` (case-insensitive, trimmed):

- **Not found** → INSERT a new batch with the supplied fields, return the new `id`.
- **Found, same `training_hierarchy_id`** → return the existing `id` unchanged (none of the other passed-in fields are applied to an existing batch).
- **Found, different `training_hierarchy_id`**:
  - `bulk_insert=False` → raises `ConflictError` ("A batch number cannot belong to multiple trainings.")
  - `bulk_insert=True` → the mismatch is **tolerated**; the existing batch's `id` is returned as-is (used by bulk upload to avoid aborting a whole file over one inconsistent row).

### `determine_training_status(data)` (main.py)

Determines `training_status` for a new enrollment:
- If `data["training_status"]` is provided and valid → used as-is.
- Else, derived from `data["start_date"]`: `start_date <= today` → `"In Progress"`; `start_date > today` or absent → `"Not Started"`.
- Raises `ValueError` for an invalid explicit status or an unparseable `start_date`.

### `determine_batch_status(training_status)` (service.py)

Used when a *new* batch is being created as a side effect of an employee-training POST/PUT (not when using the dedicated `/training_batch` endpoints, which accept `batch_status` directly):
- `training_status == "In Progress"` → `"In Progress"`
- `training_status == "Completed"` → `"Completed"`
- anything else (including `None`) → `"Planned"`

### `validate_training_batch(batch_num=None, start_date=None, end_date=None, batch_size=None)`

Raises `ValueError` if: `batch_num` is empty/whitespace or longer than 255 characters, `batch_size` is not a positive integer, or `end_date < start_date`. The same `batch_num` length check is also applied inside `resolve_training_batch` (the path used when a batch is created as a side effect of an employee-training POST/PUT), since that path doesn't call `validate_training_batch`.

### `fetch_employee_trainings(connection, schema, training_id=None, employee_id=None, batch_id=None)` (main.py)

Fetches enrollment rows joined against `employee`, `training_batches` (INNER JOIN — an enrollment always has a batch), `training_hierarchy_links`, and the three master tables. Filterable by `training_id`, `employee_id`, or `batch_id` (mutually exclusive priority in that order); with none supplied, returns all rows ordered by `created_at DESC`.

**Returned fields per row**: `employee_training_id`, `employee_id`, `emp_id`, `employee_name`, `email`, `department`, `batch_id`, `batch_num`, `competency`, `training_hierarchy_id`, `area_id`, `area_name`, `area_description`, `sub_area_id`, `sub_area_name`, `sub_area_description`, `module_id`, `module_name`, `course_level`, `module_description`, `training_status`, `status_remarks`, `employee_type`, `nominated_by`, `start_date`, `end_date`, `created_at`, `updated_at`.

### CSV Sync Functions (main.py)

| Function | Trigger | Behavior |
| --- | --- | --- |
| `sync_csv_after_write(engine, schema)` | POST, PUT, DELETE (single/batch) | Calls `sync_csv_full_reexport` |
| `sync_csv_full_reexport(engine, schema)` | Also used by bulk upload | Wraps `export_trainings_csv_to_gcs` in a try/except (non-critical failure) |
| `export_trainings_csv_to_gcs(engine, schema)` | Internal | Re-queries the full `employee_trainings ⋈ employee ⋈ training_batches ⋈ training_hierarchy_links ⋈ master_*` join and uploads to GCS |

CSV location in bucket: `employee-training/master_employee_training.csv` (rolling single backup kept under the `employee-training/master_employee_training_<timestamp>_backup.csv` prefix — older backups are deleted before each new one is written).

CSV columns (31, from `constants._CSV_COLUMNS`): `emp_id`, `employee_name`, `email`, `department`, `Area`, `Area Description`, `Sub Area`, `Sub Area Description`, `Module`, `Module Course Level`, `Module Description`, `Batch_num`, `Batch Description`, `training_status`, `Status Remarks`, `employee_type`, `nominated_by`, `start_date`, `end_date`, `created_at`, `updated_at`, `Training Quarter`, `Batch Status`, `Batch Status Remarks`, `Training Mode`, `Trainer`, `Duration`, `Batch Size`, `Prerequisite`, `Training Content`, `Resources`.

### Suggestion Functions (main.py)

| Function | Endpoint | Description |
| --- | --- | --- |
| `suggest_employees(q, connection, schema)` | `?suggest=employees&q=<str>` | ILIKE search on `emp_id`/`name`/`email`, max 20 results |
| `suggest_competencies(connection, schema)` | `?suggest=competency` | Distinct non-empty `employee_trainings.competency` values |
| `suggest_training_hierarchies(connection, schema)` | `?suggest=training_hierarchy` | All `training_hierarchy_links` rows joined with area/subarea/module names & descriptions |

Static enum suggestions (no DB row query, but `get_enum` may hit the DB on first call): `?suggest=employee_type`, `?suggest=training_status`, `?suggest=batch_status`, `?suggest=training_mode`.

**Valid `suggest` types** (from the actual error message in `handle_suggestions`): `employees`, `competency`, `training_hierarchy`, `employee_type`, `training_status`, `batch_status`, `training_mode`. Anything else → 400.

---

## Training Batch Core Functions (`service.py`)

### `get_training_batch(batch_id=None, batch_num=None)`

Standalone helper (opens its own engine/connection) that SELECTs `training_batches` joined with the hierarchy/master tables (for `area_name`/`sub_area_name`/`module_name`) and a subquery over `employee_trainings` for `employee_count` / `completed_count` (count of enrollments whose `training_status` is `'completed'`, case-insensitive). If neither `batch_id` nor `batch_num` is given, returns **all** batches, ordered by `start_date DESC NULLS LAST, id`. Returns a list of dicts either way — see the API section below for how the handler wraps this.

### `add_training_batch(data)`

Required: `admin_id`, `area`, `subarea`, `module`, `batch_num`. Validates `admin_id` is an int, `batch_status`/`training_mode` enums if provided, normalizes `start_date`/`end_date` (defaults `start_date` to today if not given), runs `validate_training_batch`, authorizes, resolves the hierarchy (creating master rows if needed), rejects if a batch with the same `batch_num` already exists (`ConflictError`), then INSERTs into `training_batches` and returns `{message, batch_id, training_hierarchy_id, created_by, created: true}`.

Note: the payload key for the batch's content field is `content`, but the DB column is `training_content` — the function maps `data.get("content")` into the `training_content` column.

### `update_training_batch(data)`

Required: `admin_id`, plus either `batch_num` or `batch_id` to locate the row. Validates enums/dates as above. If `area`/`subarea`/`module` are supplied, re-resolves the hierarchy and updates `training_hierarchy_id`. Only fields actually present in the request body are updated (with the payload key `content` mapped to the `training_content` column). A set of fields (`batch_desc`, `training_quarter`, `batch_status_remarks`, `start_date`, `end_date`, `duration`, `training_mode`, `trainer`, `batch_size`, `prerequisite`, `training_content`, `resources`) can be explicitly cleared to `NULL` by sending `null`; `batch_status` and `training_hierarchy_id` cannot be nulled this way. If the request changes `batch_num` to a value already used by another batch, raises `ConflictError`. Always bumps `updated_at`. Returns `{message, batch_id, batch_num, updated_by, updated: true}`.

### `delete_training_batch(data)`

Required: `admin_id`, `batch_id`. Verifies the batch exists, then checks `COUNT(*) FROM employee_trainings WHERE batch_id = :batch_id`. If any enrollments still reference the batch, raises `ConflictError` with an `employee_training_count` attribute attached (surfaced in the JSON body by `handle_delete_training_batch`) — enrollments must be reassigned/removed first, even though the DB's `employee_trainings.batch_id` FK is itself `ON DELETE CASCADE` (the application enforces a stricter guard than the schema does). Otherwise deletes the batch and returns `{message, batch_id, deleted: true}`.

---

## API Specification

### GET — Fetch Employee Training Records

```
GET /                     → all records
GET /?id=<int>            → single record
GET /?employee_id=<int>   → all records for an employee, newest first
GET /?batch_id=<int>      → all records enrolled in a batch, newest first
```

**Response (200, single)** — one training object (not wrapped):

```json
{
  "employee_training_id": 101,
  "employee_id": 1,
  "emp_id": "005491",
  "employee_name": "Ravi Kumar",
  "email": "ravi.kumar@company.com",
  "department": "Engineering",
  "batch_id": 12,
  "batch_num": "BATCH-2026-07",
  "competency": "Cloud Architecture",
  "training_hierarchy_id": 10,
  "area_id": 1,
  "area_name": "Cloud Computing",
  "area_description": null,
  "sub_area_id": 3,
  "sub_area_name": "AWS Services",
  "sub_area_description": null,
  "module_id": 7,
  "module_name": "Lambda Functions",
  "course_level": "Intermediate",
  "module_description": null,
  "training_status": "In Progress",
  "status_remarks": null,
  "employee_type": "Existing Lateral",
  "nominated_by": "Preethi TS",
  "start_date": "2026-07-01",
  "end_date": "2026-07-15",
  "created_at": "2026-07-01T10:00:00",
  "updated_at": "2026-07-01T10:00:00"
}
```

**Response (200, list)**: `{ "count": <int>, "results": [ ...same shape... ] }`

**Response (404)**: `{ "error": "Employee training with id 999 not found" }` (only when `id` is passed and no match is found)

---

### GET — Suggestion Endpoints

```
GET /?suggest=employees&q=<search>
GET /?suggest=competency
GET /?suggest=training_hierarchy
GET /?suggest=employee_type
GET /?suggest=training_status
GET /?suggest=batch_status
GET /?suggest=training_mode
```

All respond `{ "results": [...] }`. An unrecognized `suggest` value returns 400:

```json
{ "error": "Unknown suggestion type: 'xyz'. Valid types: employees, competency, training_hierarchy, employee_type, training_status, batch_status, training_mode" }
```

---

### GET — Download Bulk Upload Report

```
GET /?download_report=latest&admin_id=2
```

Any value works for `download_report` — the handler only checks that the parameter is present. `admin_id` is required and is authorized via `check_role_authorization` before anything else; failure to authorize returns **403** (not 401, despite the missing-`admin_id` branch itself returning 401 — see below).

- Missing `admin_id` → 401 `{ "error": "admin_id is required for report download" }`
- Authorization failure → 403 `{ "error": "Unauthorized to download report" }`
- Fetches `bulk-upload-reports/bulk_upload_report_latest.xlsx` from GCS; if it doesn't exist → 404 `{ "error": "Report not found or has not been generated yet" }`
- Otherwise streams the file via Flask `send_file` with `mimetype=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `as_attachment=True`, and a freshly timestamped `download_name` (`training_bulk_upload_report_<YYYYMMDD_HHMMSS>.xlsx`); sets `Access-Control-Expose-Headers: Content-Disposition` so the browser can read the filename.
- Any other failure while fetching → 500 `{ "error": "Failed to retrieve report from storage" }`

---

### POST — Create Employee Training Enrollment

**Authorization**: `admin_id` with role `dept`/`department`/`admin`/`hr`

#### Mode 1: Single enrollment

**Required**: `admin_id`, `employee_id`, `area`, `subarea`, `module`, `batch_num`

**Optional**: `area_description`, `subarea_description`, `module_course_level`, `module_description`, `competency`, `employee_type` (enum), `training_status` (enum — overrides the auto-computed value), `status_remarks` (free-text note explaining `training_status`), `nominated_by`, `start_date` (`YYYY-MM-DD`), `end_date` (`YYYY-MM-DD`)

**Optional, batch-metadata pass-through** (only applied if `batch_num` doesn't already exist and a new batch row gets created — note these are Title-Case keys, unlike the rest of the snake_case body): `"Batch Description"`, `"Training Mode"`, `"Training Quarter"`, `"Batch Status Remarks"`, `"Duration"`, `"Trainer"`, `"Batch Size"`, `"Prerequisite"`, `"Training Content"`, `"Resources"`

**Request Body**:

```json
{
  "admin_id": 2,
  "employee_id": 1,
  "area": "Cloud Computing",
  "subarea": "AWS Services",
  "module": "Lambda Functions",
  "batch_num": "BATCH-2026-07",
  "competency": "Cloud Architecture",
  "employee_type": "Existing Lateral",
  "nominated_by": "Preethi TS",
  "start_date": "2026-07-01",
  "end_date": "2026-07-15",
  "Training Mode": "External Instructor-led",
  "Trainer": "Anita Rao"
}
```

**Response (201 Created)**:

```json
{
  "message": "Employee training added successfully",
  "employee_training_id": 101,
  "employee_id": 1,
  "training_hierarchy_id": 10,
  "training_status": "In Progress",
  "created_by": 2,
  "created": true,
  "csv_synced": true
}
```

(Note: `batch_id` is *not* included in this response, only `training_hierarchy_id`.)

**Response (409 Conflict)** — same employee already enrolled in that batch (`UNIQUE(employee_id, batch_id)`):

```json
{
  "error": "Duplicate record. This employee already has a training entry for the same area/subarea/module.",
  "existing_employee_training_id": 101
}
```

> **"Not Completed" reopen exception**: if the existing row's `training_status` is exactly `"Not Completed"` (a prior rejection), this is *not* a 409 — it's treated as "Request Again" and the existing row is `UPDATE`d in place (same `employee_training_id`, fields overwritten from the new request) instead of inserting a new one, since `UNIQUE(employee_id, batch_id)` rules out a second row for the same pair. The response is still a normal 201 with `"created": true` and `employee_training_id` set to the *existing* id — nothing in the response shape distinguishes a reopen from a fresh insert.

**Response (404)** — target `employee_id` doesn't exist: `{ "error": "Target employee with id <id> not found" }`

> If `batch_num` already exists but is tied to a *different* `training_hierarchy_id`, `resolve_training_batch` raises `ConflictError`, which the top-level handler catches and returns as 409 (see Error Handling above).

#### Mode 2: Batch enrollments (`trainings` array)

Detected when the body contains a `trainings` key. `admin_id` authorizes the whole request once; each item needs its own `employee_id`, `area`, `subarea`, `module`, `batch_num`.

**Request Body**:

```json
{
  "admin_id": 2,
  "trainings": [
    {
      "employee_id": 1,
      "area": "Cloud Computing",
      "subarea": "AWS Services",
      "module": "S3 & Storage",
      "batch_num": "BATCH-2026-07",
      "employee_type": "Existing Lateral",
      "start_date": "2026-07-01"
    },
    {
      "employee_id": 2,
      "area": "DevOps",
      "subarea": "CI/CD",
      "module": "GitHub Actions",
      "batch_num": "BATCH-2026-08",
      "employee_type": "Freshers"
    }
  ]
}
```

**Response (201 Created, or 200 if nothing was created)**:

```json
{
  "message": "Batch training processing completed",
  "summary": { "total": 2, "created": 2, "already_exists": 0, "errors": 0, "csv_synced": true },
  "results": [
    { "index": 1, "status": "created", "employee_training_id": 102, "employee_id": 1, "batch_id": 12, "training_status": "In Progress" },
    { "index": 2, "status": "created", "employee_training_id": 103, "employee_id": 2, "batch_id": 13, "training_status": "Not Started" }
  ]
}
```

Per-item `status` values: `created`, `already_exists` (includes `existing_employee_training_id`), `error` (includes `error` message — e.g. missing fields, invalid `employee_id`, invalid `employee_type`, employee not found, or any exception raised while resolving hierarchy/batch/inserting).

---

### POST — Bulk Upload Employee Trainings (CSV/Excel)

```
POST /bulk-upload
Content-Type: multipart/form-data
```

**Form fields**: `admin_id` (text, required), `file` (`.csv`/`.xlsx`/`.xls`, required)

**Header normalization**: Column headers first have any `(Optional)`/` (Optional)` suffix stripped, then are renamed via `constants.header_map`, which maps several variant spellings to internal names — currently: `Batch (YYYY-MM)` / `Batch YYYY-MM` / `batch-YYYY-MM` / `Batch Number` / `Batch Num` / `Batch` → `batch_num`; `Batch Description` / `batch description` / `Batch Desc` / `batch desc` → `Batch Description`; `Training Status (Auto-set if blank)` / `Training Status Auto-set if blank` → `Training Status`; `Status Remarks (Optional)` / `Status Remark` / `Status Remark (Optional)` → `Status Remarks`; `Training Schedule` / `Training Schedule (Optional)` / `Training Quarter (Optional)` → `Training Quarter` (the legacy `Training Schedule` header is still accepted on upload and mapped onto the new column); `Batch Status Remarks (Optional)` / `Batch Status Remark` → `Batch Status Remarks`; `Start Date (YYYY-MM-DD[, Optional])` variants → `Start Date`; `End Date (YYYY-MM-DD[, Optional])` variants → `End Date`.

**Required columns** (after normalization): `batch_num`, `Employee ID`, `Area`, `Sub Area`, `Module` — missing any → 400.

**Recognized optional columns**: `Batch Description`, `Area Description`, `Sub Area Description`, `Module Course Level`, `Module Description`, `Employee Type`, `Start Date`, `End Date`, `Competency`, `Training Status`, `Status Remarks`, `Nominated By`, `Training Mode`, `Training Quarter`, `Batch Status`, `Batch Status Remarks`, `Duration`, `Trainer`, `Batch Size`, `Prerequisite`, `Training Content`, `Resources`. Any other column is ignored and listed in a `warnings` array in the response (not an error).

**Processing pipeline**:

1. **In-file validation**: rows missing any required column value, or duplicating another row's `Employee ID + Area + Sub Area + Module` (case-insensitive, trimmed), are pulled out as "faulty" up front and recorded directly as `error` results — they never reach DB processing.
2. **One transaction** (`engine.begin()`) for the whole file:
   - Authorize `admin_id` once.
   - Pre-load caches: all employees (keyed by raw / zero-padded / de-padded `emp_id` — see `find_employee_by_emp_id`/`normalize_emp_id_raw` below), all existing `employee_trainings` keyed by `(employee_id, batch_id)`, and one `resolve_training_hierarchy` call per distinct `Area/Sub Area/Module` combination in the file.
   - **Batch grouping**: valid rows are grouped by `batch_num` (`groupby("batch_num")`). For each group, inside a `SAVEPOINT batch_sp`, the *first row* of the group supplies the batch's metadata (dates, mode, schedule, trainer, size, prerequisite, content, resources, status) to `resolve_training_batch(..., bulk_insert=True)`. Validation performed per batch: `start_date` required, valid date format for start/end, `end_date >= start_date`, valid `Training Mode` enum, integer `Batch Size`. On any failure the savepoint is rolled back and the batch_num is recorded in `failed_batches[batch_num]` — **every row belonging to that batch_num is then failed** with the same error message, without individual retry. On success the resolved `batch_id` is cached in `batch_cache`.
   - **Row processing**: each remaining row runs inside its own `SAVEPOINT row_sp`. Steps: skip if its `batch_num` is in `failed_batches`; look up the employee (cached); validate `employee_type`; normalize `Start Date`/`End Date`; normalize or auto-derive `Training Status`; look up the pre-resolved hierarchy id; check `(employee_id, batch_id)` against the pre-loaded `existing_trainings` map:
     - exists, same status → `already_exists` (skipped)
     - exists, different status → `UPDATE` the row's `training_status`/`updated_at` → `updated`
     - doesn't exist → `INSERT` a new `employee_trainings` row → `created`
   - Any exception during a row's processing rolls back only that row's savepoint; the error is cleaned up via `clean_error_message()` (maps date-overflow / FK-violation / duplicate-key / aborted-transaction messages to friendlier text, else a generic message) and recorded.
3. **Employee ID fuzzy matching** (`find_employee_by_emp_id` / `normalize_emp_id_raw`): strips Excel's `.0` float suffix, then tries the raw value, a zero-padded-to-6-digits value, and a leading-zero-stripped numeric value against `employee.emp_id`.
4. **Excel upload report** (`build_upload_report`, via `openpyxl`): a two-sheet workbook —
   - `✅ Successfully Processed`: `Row #`, `Employee ID`, `Employee Name`, `Area`, `Sub Area`, `Module`, `Module Course Level`, `Batch Number`, `Employee Type`, `Training Status`, `Start Date`, `End Date`, `Competency`, `employee_training_id`, `training_hierarchy_id`, `Status`, `Warnings` — alternating row shading, warnings highlighted yellow, frozen header row, autofilter, auto-sized columns, wrapped/top-aligned cells.
   - `❌ Failed Records`: `Row #`, `Employee ID`, `Employee Name`, `Email`, `Area`, `Sub Area`, `Module`, `Batch Number`, `Employee Type`, `Training Status (Original/Normalized)`, `Start Date (Original/Normalized)`, `End Date (Original/Normalized)`, `Error(s)`, `Warnings` — errors highlighted red, normalized values highlighted green, warnings yellow.
   - Uploaded to GCS as `bulk-upload-reports/bulk_upload_report_latest.xlsx`, first copying any existing `latest` to `bulk-upload-reports/bulk_upload_report_previous.xlsx`. A v4 signed URL (7-day expiry, `Content-Disposition: attachment; filename=training_bulk_upload_report_<timestamp>.xlsx`) is attempted; if signing fails (e.g. local dev without a signing-capable service account), falls back to a relative, backend-proxied URL: `/add_training_v2?download_report=latest&admin_id=<admin_id>`.
5. **Full CSV re-export** to GCS after all DB writes.
6. Publishes `EMPLOYEE_TRAINING_UPDATED` (+ `TRAINING_MAPPING_CREATED`/`TRAINING_MAPPING_UPDATED` as applicable) events if `created_count > 0` or `updated_count > 0`.

**Response (201 if `created_count > 0`, else 200)**:

```json
{
  "message": "Bulk upload completed",
  "summary": { "total_rows": 5, "created": 3, "updated": 1, "already_exists": 1, "errors": 0 },
  "results": [
    { "row": 2, "status": "created", "employee_training_id": 201, "employee_id": 1, "batch_id": 12, "training_hierarchy_id": 10, "training_status": "In Progress" },
    { "row": 3, "status": "updated", "employee_id": 2, "batch_id": 12, "training_hierarchy_id": 10, "employee_training_id": 150, "old_status": "In Progress", "new_status": "Completed" }
  ],
  "report_url": "https://storage.googleapis.com/...&response-disposition=attachment%3B%20filename%3D...",
  "warnings": ["Ignored unknown columns: My Extra Column"]
}
```

`warnings` is only present if there were ignored columns; `report_url` is only present if the report upload succeeded.

---

### PUT — Update Existing Employee Training Enrollment

**Authorization**: `admin_id` with role `dept`/`department`/`admin`/`hr`

**Required**: `employee_training_id`, `admin_id`, and `batch_num` — but `batch_num` falls back to the record's *current* batch number if not explicitly present in the body, so in practice it only needs to be sent if you're changing it.

**Optional**: `training_hierarchy_id` (int — reassign to a different existing hierarchy; validated against `training_hierarchy_links`), `competency`, `employee_type` (enum), `nominated_by`, `start_date`, `end_date`, `training_status` (enum override), `status_remarks` (free-text note explaining `training_status`), plus the same Title-Case batch pass-through fields as POST (`"Batch Description"`, `"Training Mode"`, `"Training Quarter"`, `"Batch Status Remarks"`, etc.) — used only if a *new* batch ends up being created.

**Batch reassignment logic**: `resolve_training_batch` is only invoked (and `employee_trainings.batch_id` only updated) if the request body actually contains `batch_num` or `training_hierarchy_id` — otherwise the enrollment's existing batch link is left untouched even if other fields change.

**Auto-status logic**: if `training_status` is explicitly provided (and valid) it's used as-is. Otherwise, if `start_date` is present in the body (even if being cleared), the status is re-derived: non-empty new `start_date <= today` → `In Progress`; otherwise (future date, unparseable, or cleared) → `Not Started`. If neither `training_status` nor `start_date` is in the body, `training_status` is left untouched.

**`nominated_by` overwrite on approve/reject decision**: when this PUT is a nomination decision (`training_status` set to `"Not Started"`/approved or `"Not Completed"`/rejected, i.e. `is_nomination_decision`) and the request body doesn't already send its own `nominated_by`, the column is overwritten with the reviewing `admin_id`'s own name instead of being left as the original nominator. This is an intentional product decision, not a bug — there's no separate "Reviewed By" column, so `nominated_by` is reused to show who actually acted on the request. One consequence: the original nominator's identity is not preserved anywhere once a decision is made (no history/audit trail of the original value). If the reviewer's own `employee.name` is empty/NULL, the record falls back to `"Employee #<admin_id>"` rather than silently skipping the overwrite.

**Request Body Example**:

```json
{
  "employee_training_id": 101,
  "admin_id": 2,
  "training_status": "Completed",
  "end_date": "2026-07-20"
}
```

**Response (200 OK)**:

```json
{
  "message": "Employee training updated successfully",
  "employee_training_id": 101,
  "csv_synced": true,
  "record": { "...full record from fetch_employee_trainings..." }
}
```

**Response (404)**: enrollment not found, or the requested `training_hierarchy_id` doesn't exist.

**Response (400)**: `employee_training_id`/`admin_id` missing or non-integer, invalid `employee_type`/`training_status` enum value, missing `batch_num` (only possible if the existing record's batch number is somehow empty), or no updatable fields supplied at all.

---

### DELETE — Remove Employee Training Enrollment

**Authorization**: `admin_id` (query param) with role `dept`/`department`/`admin`/`hr`

```
DELETE /?id=101&admin_id=2
```

- Verifies the record exists (404 if not).
- Counts associated `comment` rows (informational only — the `comment.employee_training_id` FK is `ON DELETE CASCADE`, so they're removed automatically by the DB).
- Deletes the `employee_trainings` row, then full-re-syncs the CSV.

**Response (200 OK)**:

```json
{
  "message": "Employee training deleted successfully",
  "employee_training_id": 101,
  "csv_synced": true,
  "comments_deleted": 3
}
```

(`comments_deleted` only present if `> 0`.)

---

### GET — Fetch Training Batch(es)

```
GET /training_batch                    → all batches
GET /training_batch?batch_id=<int>     → single batch, filtered
GET /training_batch?batch_num=<str>    → single batch, filtered
```

No authorization required. Calls `service.get_training_batch(batch_id, batch_num)`, which returns a **list** either way.

**Response shape** depends only on whether `batch_id` was supplied (note: `batch_num`-only requests still get the "list" shape below, even though only one batch matches):

- `batch_id` given → `{ "batch": [ {...} ] }` (still a list under the `"batch"` key)
- otherwise → `{ "batches": [ {...}, ... ], "count": <int> }`

**Per-batch fields**: `batch_id`, `batch_num`, `batch_desc`, `training_hierarchy_id`, `training_quarter`, `batch_status`, `batch_status_remarks`, `start_date`, `end_date`, `duration`, `training_mode`, `trainer`, `batch_size`, `prerequisite`, `content` (aliased from `training_content`), `resources`, `created_at`, `updated_at`, `area_name`, `sub_area_name`, `module_name`, `employee_count`, `completed_count`.

```json
{
  "batches": [
    {
      "batch_id": 12,
      "batch_num": "BATCH-2026-07",
      "batch_desc": "July cohort",
      "training_hierarchy_id": 10,
      "training_quarter": "Q3 2026",
      "batch_status": "In Progress",
      "batch_status_remarks": null,
      "start_date": "2026-07-01",
      "end_date": "2026-07-15",
      "duration": "2 weeks",
      "training_mode": "Hybrid",
      "trainer": "Anita Rao",
      "batch_size": 20,
      "prerequisite": null,
      "content": null,
      "resources": null,
      "created_at": "2026-06-20T09:00:00",
      "updated_at": "2026-07-01T10:00:00",
      "area_name": "Cloud Computing",
      "sub_area_name": "AWS Services",
      "module_name": "Lambda Functions",
      "employee_count": 18,
      "completed_count": 4
    }
  ],
  "count": 1
}
```

---

### POST — Create Training Batch

```
POST /training_batch
```

**Required**: `admin_id`, `area`, `subarea`, `module`, `batch_num`

**Optional**: `area_description`, `subarea_description`, `module_course_level`, `module_description`, `batch_desc`, `training_quarter`, `batch_status` (enum, defaults `"Planned"`), `batch_status_remarks`, `start_date` (defaults to today if omitted), `end_date`, `duration`, `training_mode` (enum), `trainer`, `batch_size`, `prerequisite`, `content` (stored as `training_content`), `resources`

**Request Body**:

```json
{
  "admin_id": 365,
  "area": "Python",
  "subarea": "Backend",
  "module": "FastAPI",
  "batch_num": "2026-07",
  "batch_status": "Planned",
  "start_date": "2026-07-01",
  "end_date": "2026-07-15"
}
```

**Response (201 Created)**:

```json
{
  "message": "Training batch added successfully",
  "batch_id": 14,
  "training_hierarchy_id": 22,
  "created_by": 365,
  "created": true
}
```

**Response (409)**: `{ "error": "Training batch '2026-07' already exists." }`

---

### PUT — Update Training Batch

```
PUT /training_batch
```

**Required**: `admin_id`, plus one of `batch_num` or `batch_id` to locate the row.

**Optional**: `area`/`subarea`/`module` (re-resolves and reassigns `training_hierarchy_id` if any is given), `batch_desc`, `training_quarter`, `batch_status`, `batch_status_remarks`, `start_date`, `end_date`, `duration`, `training_mode`, `trainer`, `batch_size`, `prerequisite`, `content` (→ `training_content`), `resources`. A new `batch_num` value (when the row was located by `batch_id`) renames the batch, rejected with 409 if another batch already owns that number.

**Request Body**:

```json
{
  "admin_id": 365,
  "batch_id": 14,
  "batch_status": "Completed",
  "end_date": "2026-07-20"
}
```

**Response (200 OK)**:

```json
{
  "message": "Training batch updated successfully",
  "batch_id": 14,
  "batch_num": "2026-07",
  "updated_by": 365,
  "updated": true
}
```

**Response (409)**: batch doesn't exist, or renamed `batch_num` collides with another batch.

**Response (400)**: missing `admin_id`/locator, invalid enum, or no fields supplied to update.

---

### DELETE — Remove Training Batch

```
DELETE /training_batch?batch_id=<int>&admin_id=<int>
```

Refuses (409) if any `employee_trainings` rows still reference the batch:

```json
{
  "error": "Training batch 'BATCH-2026-07' cannot be deleted because 3 employee training record(s) are associated with it.",
  "employee_training_count": 3
}
```

**Response (200 OK)**: `{ "message": "Training batch deleted successfully", "batch_id": 14, "deleted": true }`

---

## Database Operations

### `training_batches`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | serial4 (PK) | |
| `batch_num` | varchar(255) | `UNIQUE`, not null |
| `training_hierarchy_id` | int4 (FK → `training_hierarchy_links`, `ON DELETE RESTRICT`) | not null |
| `batch_desc` | text | |
| `training_quarter` | text | (replaces the old `training_schedule` column — not a 1:1 rename, different meaning) |
| `batch_status` | `training_batch_status_enum` | default `'Planned'` |
| `batch_status_remarks` | text | free-text note explaining `batch_status` |
| `start_date` | date | |
| `end_date` | date | CHECK: `end_date IS NULL OR start_date IS NULL OR end_date >= start_date` |
| `duration` | text | |
| `training_mode` | `training_mode_enum` | |
| `trainer` | text | |
| `batch_size` | int4 | CHECK: `batch_size IS NULL OR batch_size > 0` |
| `prerequisite` | text | |
| `training_content` | text | app-facing key is `content` |
| `resources` | text | |
| `created_at` / `updated_at` | timestamp | auto-managed via trigger |

Indexes on `batch_num`, `batch_status`, `training_hierarchy_id`.

### `employee_trainings`

| Column | Type | Notes |
| --- | --- | --- |
| `employee_training_id` | serial4 (PK) | |
| `employee_id` | int4 (FK → `employee`, `ON DELETE CASCADE`) | not null |
| `batch_id` | int4 (FK → `training_batches`, `ON DELETE CASCADE`) | not null |
| `competency` | text | |
| `training_status` | `training_status_enum` | |
| `status_remarks` | text | free-text note explaining `training_status` |
| `employee_type` | `employee_type_enum` | |
| `nominated_by` | text | |
| `start_date` | date | |
| `end_date` | date | (no DB-level `end_date >= start_date` check on this table — that constraint lives on `training_batches` instead) |
| `created_at` / `updated_at` | timestamp | auto-managed via trigger |

**Unique constraint**: `(employee_id, batch_id)` — this, not a hierarchy comparison, is what the app's duplicate-enrollment checks are ultimately backed by.

### Master Tables

| Table | PK | Name column | Extra columns |
| --- | --- | --- | --- |
| `master_area` | `area_id` | `area_name` | `description` |
| `master_subarea` | `sub_area_id` | `sub_area_name` | `description` |
| `master_module` | `module_id` | `module_name` | `course_level`, `description` |

### `training_hierarchy_links`

`training_hierarchy_id` (PK), `area_id`/`sub_area_id`/`module_id` (FKs, `ON DELETE RESTRICT`), unique on `(area_id, sub_area_id, module_id)`. Sits above `training_batches`, which references it via `training_hierarchy_id`; `employee_trainings` does not reference it directly, only via `batch_id` → `training_batches`.

### `comment` (referenced)

`employee_training_id` FK → `employee_trainings`, `ON DELETE CASCADE`.

### Schema Configuration

- Default schema: `skill_matrix_v2_dev`
- Production schema: `skill_matrix_v2_prod`
- Configurable via `DB_SCHEMA` env var

### Transaction Management

- GET / suggestions / `get_training_batch`: `engine.connect()` (read-only)
- POST / PUT / DELETE (both employee-training and training-batch): `engine.begin()` (atomic; bulk upload additionally uses per-batch and per-row `SAVEPOINT`s inside that one outer transaction)

---

## Authorization

| Method | Authorization | Required field |
| --- | --- | --- |
| GET (employee trainings, suggestions, training batches) | None | — |
| POST /, PUT / (employee training) | dept/department/admin/hr | `admin_id` in JSON body |
| DELETE / (employee training) | dept/department/admin/hr | `admin_id` in query params |
| GET `?download_report=` | dept/department/admin/hr | `admin_id` in query params |
| POST/PUT `/training_batch` | dept/department/admin/hr | `admin_id` in JSON body |
| DELETE `/training_batch` | dept/department/admin/hr | `admin_id` in query params |

Unauthorized roles (`Manager`, `User`, or no role) receive **403 Forbidden**.

---

## Postman Collection

Collection file: `postman/data/addTraining_v2.postman_collection.json`

Covers employee-training enrollments (GET, suggestions, report download, POST single/batch/bulk-upload, PUT, DELETE) and the new training-batch CRUD surface (GET/POST/PUT/DELETE `/training_batch`), matching the current schema described above.

Set the collection variables as follows:

- Local dev: `http://localhost:8080`
- Cloud dev/prod: `{{frontend_base_url}}/addTraining_v2` (same unprefixed path in both environments)

For cloud requests, send `Authorization: Bearer {{sso_token}}` when end-user identity is needed; acquire `sso_token` from app `localStorage.authToken`. The frontend proxy can enforce it with `REQUIRE_SSO_JWT=true`; leave that unset for legacy-compatible pre-login reads.

### Collection Variables

| Variable | Default | Description |
| --- | --- | --- |
| `base_url` | `http://localhost:8080` | Local function URL, or `{{frontend_base_url}}/addTraining_v2` for cloud |
| `admin_id` | `2` | Admin employee ID for authorization |
| `employee_id` | `1` | Target employee ID to enroll |
| `created_employee_training_id` | (empty) | Auto-set by the POST Single Enrollment test; used by PUT/DELETE |
| `created_batch_id` | (empty) | Auto-set by the POST Training Batch test; used by GET/PUT/DELETE `/training_batch` |

### Folders in Collection

| Folder | Requests |
| --- | --- |
| GET — Fetch Employee Training Records | All, by id, by employee_id, by batch_id, Not Found (404), Invalid id (400) |
| GET — Suggestion Endpoints | Employees, Competency, Training Hierarchy, Employee Type, Training Status, Batch Status, Training Mode, Unknown (400) |
| GET — Download Bulk Upload Report | Latest (200), Missing admin_id (401), Unauthorized (403) |
| POST — Create Single Enrollment | Full Fields (201), Minimal Fields, Duplicate (409), Batch/Hierarchy Mismatch (409), Missing Fields (400), Invalid Employee Type (400), Employee Not Found (404), Unauthorized (403) |
| POST — Create Batch Enrollments | Success (201), Partial Errors, Empty Array (400), Missing admin_id (400) |
| POST — Bulk Upload Enrollments | CSV File (201), Missing admin_id (400), No File (400), Missing Columns (400) |
| PUT — Update Employee Training Enrollment | Status + End Date (200), Reassign Batch (200), Not Found (404), Invalid Status (400), No Fields (400), Unauthorized (403) |
| DELETE — Remove Employee Training Enrollment | Success (200), Not Found (404), Missing id (400), Unauthorized (403) |
| GET — Fetch Training Batch(es) | All, by batch_id, by batch_num, Invalid batch_id (400) |
| POST — Create Training Batch | Success (201), Duplicate batch_num (409), Missing Fields (400), Unauthorized (403) |
| PUT — Update Training Batch | Status + End Date (200), Rename Conflict (409), No Fields (400), Not Found (409) |
| DELETE — Remove Training Batch | Blocked by Enrollments (409), Success (200), Unauthorized (403) |

---

## Error Handling

| Code | Meaning | Triggered by |
| --- | --- | --- |
| 200 | Success | GET, PUT, DELETE, batch/bulk POST with nothing created |
| 201 | Created | POST that created at least one record (single, batch, bulk, or training batch) |
| 204 | No Content | OPTIONS preflight |
| 400 | Bad Request | Missing/invalid fields, invalid JSON, invalid id, invalid enum value, no fields to update, missing bulk-upload columns, SQL check-constraint violation |
| 401 | Unauthorized | Missing `admin_id` on report download only |
| 403 | Forbidden | `admin_id`'s role is not dept/department/admin/hr (`"Access denied"` in message) |
| 404 | Not Found | Training/employee/batch/hierarchy id doesn't exist, or report file missing |
| 405 | Method Not Allowed | Unsupported HTTP method, or unsupported method under `/training_batch` |
| 409 | Conflict | Duplicate enrollment (`employee_id` + `batch_id`), FK violation, duplicate `batch_num`, batch still referenced by enrollments (delete), batch/hierarchy mismatch (`ConflictError`) — from either the dedicated `/training_batch` endpoints or the plain employee-training POST/PUT/bulk-upload path |
| 500 | Server Error | Database error, unexpected exception |

---

## Local Development

### Running Locally

```bash
cd backend/data/addTraining_v2
functions-framework --target=add_training_v2 --debug
```

Available at `http://127.0.0.1:8080/`.

### Environment Variables Required

`backend/.env`:

```env
DB_HOST=localhost
DB_USER=your_db_user
DB_PASS=your_db_password
DB_NAME=your_database
DB_PORT=5432
DB_SCHEMA=skill_matrix_v2_dev
BUCKET_NAME=skill-matrix-dev-v2
GCP_PROJECT=your_gcp_project_id
SEND_EMAIL_URL=your_send_email_function_url
APP_URL=your_app_url
```

`SEND_EMAIL_URL` is optional — email notifications (nomination submitted/approved/rejected) are skipped with a logged warning if unset, everything else in the function works normally. `APP_URL` is now only a fallback: `resolve_app_url()` (`notifications.py`) builds the email deep-link base URL from the request's `Origin` header first, and falls back to `APP_URL` only when `Origin` is missing or malformed — so `APP_URL` mainly matters for non-browser callers (Postman, server-to-server) that don't send an `Origin` header.

Loaded from `Path(__file__).parent.parent.parent / ".env"` (i.e. `backend/.env`) for local dev only; deployed Cloud Functions use environment variables set at deploy time. (`GOOGLE_CLOUD_PROJECT` is also accepted as a fallback for `GCP_PROJECT` in the GCS helpers.)

---

## Deployment

Deployment and IAM changes belong in `skill-matrix-deploy`. The function is private, and the frontend Cloud Run runtime service account receives `roles/run.invoker`.

### Development

```bash
gcloud functions deploy dev_addTraining_v2 \
  --runtime python311 \
  --trigger-http \
  --entry-point add_training_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=development
```

### Production

```bash
gcloud functions deploy addTraining_v2 \
  --runtime python311 \
  --trigger-http \
  --entry-point add_training_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=production
```

(Confirmed against the docstring at the bottom of `main.py`, and against `get_db_engine()`'s env var names.)

The snippets above only show `ENV` — the rest (DB, `SEND_EMAIL_URL`, `APP_URL`) is set automatically per environment by the deployment pipeline.

The cloud-development browser path stays `/addTraining_v2`; frontend runtime `FUNCTIONS_BASE_URL` ending in `/dev_` maps it to `dev_addTraining_v2`. The proxy adds its Google identity token server-side as `X-Serverless-Authorization` and preserves an SSO JWT in `Authorization`. Direct `*.cloudfunctions.net` diagnostics are platform/admin-only and require a Google identity token whose audience is the exact function URL. Localhost needs no GCP identity token.

---

## Key Design Decisions

1. **`training_batches` as a first-class table** — a batch is its own row with schedule/trainer/mode/status/dates, has its own CRUD surface, and is shared by every enrollment that references it via `batch_id`.
2. **`batch_num` is globally unique**, not scoped per hierarchy — `resolve_training_batch` enforces that a batch number can't be reused under a different area/subarea/module (except during bulk upload, where a mismatch is tolerated to avoid aborting the whole file).
3. **Two batch-creation paths** — batches can be managed directly via `/training_batch` (full control over every field, explicit `batch_status`), or created lazily as a side effect of enrolling someone via the employee-training endpoints (status auto-derived by `determine_batch_status`, and existing batches are never mutated by that path).
4. **`admin_id` vs `employee_id`/enrollee separation** — `admin_id` authorizes and is never stored; `employee_id` is the training target.
5. **Auto-status on create, explicit-or-derived on update** — `training_status` is auto-set from `start_date` on POST; on PUT it only changes if `training_status` or `start_date` is explicitly present in the request.
6. **Get-or-create everywhere** — hierarchy (area/subarea/module) and batches are both resolved case-insensitively and reused; new rows are only created when nothing matches.
7. **Duplicate guard is now `(employee_id, batch_id)`**, not `(employee_id, training_hierarchy_id)` — since multiple batches can share a hierarchy, the same employee can be enrolled once per batch.
8. **SAVEPOINT-based two-level isolation in bulk upload** — one savepoint per batch group (a bad batch fails every row that depends on it, without touching other batches) and one savepoint per row inside a good batch (a bad row doesn't stop the rest of the file).
9. **`ConflictError` handling is consistent across both paths** — the dedicated `/training_batch` handlers catch it locally and return 409; the employee-training POST/PUT/bulk-upload path relies on the same catch at the top-level `add_training_v2` handler, so both surfaces return 409 for the same underlying conflict.
10. **Delete guard stricter than the schema** — `training_batches.id` cascades on delete at the DB level, but `delete_training_batch` refuses (409) if any enrollments still reference the batch, so a batch delete can never silently wipe out enrollments.
11. **GCS CSV sync** — every write to `employee_trainings` triggers a full re-export joined against the new `training_batches` columns.
12. **Employee ID fuzzy matching + Excel artifact cleanup** — bulk upload tolerates raw, zero-padded, and de-padded `emp_id` formats, and strips Excel's `.0` float suffix from numeric IDs.

---

## Related Functions

- **`getEmployeeSkill_v2`** — Retrieves employee skills (read operation)
- **`saveEmployeeSkill_v2`** — Saves/updates employee skill ratings (employee-facing)
- **`addSkill_v2`** — Manages the skill hierarchy catalog (similar admin pattern)
- **`reviewSkillRequest_v2`** — Manager approval/rejection of skill requests

---

## Data Flow Diagram

```
Administrator (dept/department/admin/hr)
    │
    ├─ GET/POST/PUT/DELETE /add_training_v2                 (employee-training enrollments)
    └─ GET/POST/PUT/DELETE /add_training_v2/training_batch   (training batch metadata)
    │
    ▼
Backend (add_training_v2 → main.py handlers → service.py)
    │
    ├─ employee                     (role authorization + target employee lookup)
    ├─ master_area / master_subarea / master_module   (get-or-create)
    ├─ training_hierarchy_links     (get-or-create link)
    ├─ training_batches             (get-or-create when enrolling; direct CRUD via /training_batch)
    ├─ employee_trainings           (CRUD, keyed by batch_id)
    └─ comment                      (ON DELETE CASCADE when an enrollment is deleted)
    │
    ▼
GCS Bucket
    ├─ employee-training/master_employee_training.csv   (full re-export after every write)
    └─ bulk-upload-reports/bulk_upload_report_latest.xlsx (+ _previous.xlsx rotation)
    │
    ▼
JSON Response
```
