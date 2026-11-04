# add_skill_v2 Function Documentation

## Overview

`add_skill_v2` is a Google Cloud Function that manages skill hierarchy entries in the Skill Matrix application. It supports full CRUD operations — creating, reading, updating, and deleting skill hierarchy links that connect four master tables: Domain, Discipline, Skill Area, and Framework. It also syncs all write operations to a master CSV file stored in a GCS bucket.

**Location**: `backend/data/addSkill_v2/main.py`

**Trigger**: HTTP GET, POST, PUT, DELETE request

**Port (Local Development)**: 8080 (via `functions-framework --target=add_skill_v2 --debug`)

**Database Library**: SQLAlchemy ORM

---

## Purpose

This function serves as the administrative endpoint for managing the skill hierarchy catalog. Administrators (`dept`/`admin`/`hr` roles) can:

1. **GET** — Retrieve all skill hierarchies or a specific one by ID
2. **POST** — Create a single or batch of skill hierarchy links (with master table get-or-create)
3. **POST /bulk-upload** — Bulk-import skill hierarchies from a CSV/Excel file
4. **PUT** — Update an existing skill hierarchy (names, descriptions, proficiency levels, `is_mandatory` flags)
5. **DELETE** — Remove a skill hierarchy link and automatically clean up orphaned master entries

**Key Feature**: Every write operation (POST, PUT, DELETE) automatically syncs the `skill_hierarchy_links` table to a CSV file (`master-skill-mapping/Master_Skills.csv`) stored in a GCS bucket, keeping a downloadable master reference always up to date.

---

## Function Flow

### Entry Point: `add_skill_v2(request)`

The main Cloud Function handler that routes HTTP requests to the appropriate handler.

#### 1. CORS Handling

- Handles OPTIONS preflight requests (204 No Content)
- Sets CORS headers for all origins (`*`)
- Allows `GET`, `POST`, `PUT`, `DELETE`, and `OPTIONS` methods
- Includes `Authorization` header in allowed headers
- Sets `Access-Control-Max-Age: 3600` for preflight caching

#### 2. Method Routing

| Method | Path                           | Handler                           |
| ------ | ------------------------------ | --------------------------------- |
| GET    | `/` or `/?id=<int>`            | `handle_get()`                    |
| POST   | `/`                            | `handle_post()` (single or batch) |
| POST   | `/bulk-upload`                 | `handle_bulk_upload()`            |
| PUT    | `/`                            | `handle_put()`                    |
| DELETE | `/?id=<int>&employee_id=<int>` | `handle_delete()`                 |
| Other  | —                              | 405 Method Not Allowed            |

#### 3. Centralized Error Handling

- **ValueError** with "Access denied" → 403 Forbidden
- **ValueError** (other) → 400 Bad Request
- **SQLAlchemyError** with foreign key violation → 409 Conflict
- **SQLAlchemyError** (other) → 500 Internal Server Error
- **General Exception** → 500 Internal Server Error

---

## Core Functions

### `get_db_engine()`

Creates and returns a SQLAlchemy engine using environment variables.

**Database URL Format**: `postgresql+psycopg2://{user}:{pass}@{host}:{port}/{dbname}`

### `check_role_authorization(employee_id, connection, schema)`

Validates that the employee has an authorized role to manage skill hierarchies.

**Allowed Roles**: `dept`, `department`, `admin`, `hr`

**Raises**: `ValueError` if employee not found, has no role, or role is unauthorized

### `get_or_create_domain / discipline / skill_area / framework(...)`

Gets an existing master entry by name (case-insensitive) or creates a new one.

- Returns `(id, was_created)` tuple
- `update_existing=True` (PUT) — updates description/proficiency on existing entry
- `update_existing=False` (POST/bulk) — reuses existing entry without overwriting

### `fetch_skill_hierarchies(connection, schema, skill_hierarchy_id=None)`

Fetches skill hierarchy links with full JOIN data from all master tables.

**Returns**: List of dicts with complete hierarchy data (all IDs, names, descriptions, L1/L2/L3, timestamps)

### `create_skill_hierarchy_link(domain_id, discipline_id, skill_area_id, framework_id, connection, schema)`

Creates a new skill hierarchy link or returns the existing one if the combination already exists.

**Returns**: `(link_id, was_created)`

### CSV Sync Functions

| Function                                            | Trigger                | Behavior                                                       |
| --------------------------------------------------- | ---------------------- | -------------------------------------------------------------- |
| `sync_csv_append_row(row_data, engine, schema)`     | POST                   | Appends new row to GCS CSV; full re-export if CSV missing      |
| `sync_csv_update_row(skill_hierarchy_id, row_data)` | PUT                    | Updates matching row in GCS CSV in-place; appends if not found |
| `sync_csv_delete_row(skill_hierarchy_id)`           | DELETE                 | Removes matching row from GCS CSV                              |
| `sync_csv_full_reexport(engine, schema)`            | Bulk upload / fallback | Full re-export of all rows from DB to GCS CSV                  |

CSV location in bucket: `master-skill-mapping/Master_Skills.csv`

CSV columns: `skill_hierarchy_id`, `Discipline`, `Domain`, `Skill Area`, `Framework`, `L1`, `L2`, `L3`

---

## API Specification

### GET — Fetch Skill Hierarchies

#### GET All Hierarchies

```
GET /
```

**Response (200)**:

```json
{
  "count": 2,
  "results": [
    {
      "skillhierarchy_id": 1,
      "domain_id": 1,
      "domain_name": "Cloud",
      "domain_description": "Cloud computing and services",
      "discipline_id": 5,
      "discipline_name": "Engineering",
      "discipline_description": "Software Engineering discipline",
      "skill_area_id": 10,
      "skill_area": "DevOps",
      "skill_area_description": "Development and Operations practices",
      "framework_id": 20,
      "framework_name": "Kubernetes",
      "framework_description": "Container orchestration platform",
      "L1": "Understand pods, deployments, and services",
      "L2": "Manage clusters, configure RBAC, set up ingress",
      "L3": "Architect multi-cluster setups, custom operators, advanced networking",
      "created_at": "2024-01-15T10:30:00",
      "updated_at": "2024-01-20T14:45:00"
    }
  ]
}
```

#### GET Single Hierarchy by ID

```
GET /?id=1
```

**Response (200)**: Returns a single hierarchy object (not wrapped in `results`)

**Response (404)**:

```json
{ "error": "Skill hierarchy with id 999 not found" }
```

---

### POST — Create New Skill Hierarchy

**Authorization Required**: `employee_id` with role `dept`, `admin`, or `hr`

There are three POST modes:

#### Mode 1: Single Skill (flat JSON body)

**Required Fields**:

| Field             | Type    | Description                  |
| ----------------- | ------- | ---------------------------- |
| `employee_id`     | integer | Must have dept/admin/hr role |
| `domain_name`     | string  | Domain name                  |
| `discipline_name` | string  | Discipline/Category name     |
| `skill_area`      | string  | Skill area name              |
| `framework_name`  | string  | Framework/tool name          |

**Optional Fields**: `domain_description`, `discipline_description`, `skill_area_description`, `framework_description`, `basic` (L1), `intermediate` (L2), `expert` (L3)

**Request Body**:

```json
{
  "employee_id": 1,
  "discipline_name": "Engineering",
  "domain_name": "Cloud",
  "skill_area": "DevOps",
  "framework_name": "Kubernetes",
  "basic": "Understand pods, deployments, and services",
  "intermediate": "Manage clusters, configure RBAC, set up ingress",
  "expert": "Architect multi-cluster setups, custom operators, advanced networking"
}
```

**Response (201 Created)**:

```json
{
  "message": "Skill hierarchy added successfully",
  "skill_hierarchy_id": 42,
  "domain_id": 1,
  "discipline_id": 5,
  "skill_area_id": 10,
  "framework_id": 20,
  "created": true,
  "csv_synced": true
}
```

**Response (409 Conflict)** — Duplicate combination:

```json
{
  "error": "Skill hierarchy already exists",
  "skill_hierarchy_id": 42
}
```

#### Mode 2: Batch Skills (skills array)

**Request Body**:

```json
{
  "employee_id": 1,
  "skills": [
    {
      "discipline_name": "Engineering",
      "domain_name": "Cloud",
      "skill_area": "DevOps",
      "framework_name": "Docker",
      "basic": "Build and run containers",
      "intermediate": "Multi-stage Dockerfiles, compose services",
      "expert": "Optimize images, build CI/CD pipelines"
    },
    {
      "discipline_name": "Data Science",
      "domain_name": "Analytics",
      "skill_area": "Machine Learning",
      "framework_name": "PyTorch"
    }
  ]
}
```

**Response (201 Created)**:

```json
{
  "message": "Batch skill hierarchy processing completed",
  "summary": {
    "total": 2,
    "created": 2,
    "already_exists": 0,
    "errors": 0,
    "csv_synced": true
  },
  "results": [
    { "index": 1, "status": "created", "skill_hierarchy_id": 43 },
    { "index": 2, "status": "created", "skill_hierarchy_id": 44 }
  ]
}
```

#### Mode 3: Bulk Upload (CSV/Excel file)

```
POST /bulk-upload  (multipart/form-data)
```

**Form Data**:

- `employee_id` (text, required) — must have dept/admin role
- `file` (file, required) — CSV or Excel with columns: `Discipline`, `Domain`, `Skill Area`, `Framework` (required); `L1`, `L2`, `L3` (optional)

**Sample CSV format**:

```
Discipline,Domain,Skill Area,Framework,L1,L2,L3
Engineering,Cloud,DevOps,Terraform,Write HCL,Manage state,Multi-cloud
Data Science,Analytics,ML,Scikit-learn,Use classifiers,Pipelines,Custom estimators
```

**Response (201 Created)**:

```json
{
  "message": "Bulk upload completed",
  "total_rows": 10,
  "valid_rows": 9,
  "created": 7,
  "skipped_existing": 2,
  "faulty_rows_count": 1,
  "csv_synced": true
}
```

---

### PUT — Update Existing Skill Hierarchy

**Authorization Required**: `employee_id` with role `dept`, `admin`, or `hr`

**Required Fields**: `employee_id`, `skill_hierarchy_id`

All other fields are optional — only provided fields are updated.

**Optional Fields**:

| Field                     | Type    | Description                     |
| ------------------------- | ------- | ------------------------------- |
| `domain_name`             | string  | New domain name                 |
| `discipline_name`         | string  | New discipline name             |
| `skill_area`              | string  | New skill area name             |
| `framework_name`          | string  | New framework name              |
| `domain_description`      | string  | Updated domain description      |
| `discipline_description`  | string  | Updated discipline description  |
| `skill_area_description`  | string  | Updated skill area description  |
| `framework_description`   | string  | Updated framework description   |
| `basic`                   | string  | Updated L1 proficiency criteria |
| `intermediate`            | string  | Updated L2 proficiency criteria |
| `expert`                  | string  | Updated L3 proficiency criteria |
| `domain_is_mandatory`     | boolean | Mark domain as mandatory        |
| `discipline_is_mandatory` | boolean | Mark discipline as mandatory    |
| `skill_area_is_mandatory` | boolean | Mark skill area as mandatory    |
| `framework_is_mandatory`  | boolean | Mark framework as mandatory     |

**Request Body Example**:

```json
{
  "employee_id": 1,
  "skill_hierarchy_id": 1,
  "framework_name": "Kubernetes v1.30",
  "basic": "Understand pods, deployments, and services",
  "intermediate": "Manage clusters, configure RBAC, set up ingress, Helm",
  "expert": "Architect multi-cluster setups, custom operators, advanced networking"
}
```

**Response (200 OK)**:

```json
{
  "message": "Skill hierarchy updated successfully",
  "skill_hierarchy_id": 1,
  "domain_id": 1,
  "discipline_id": 5,
  "skill_area_id": 10,
  "framework_id": 21,
  "csv_synced": true,
  "orphaned_masters_deleted": ["framework (id=20)"],
  "warning": "This hierarchy has 3 employee skill rating(s). Modifying it may affect existing employee assessments."
}
```

**Response (409 Conflict)** — New combination already exists in another row:

```json
{
  "error": "Cannot update: this combination of domain, discipline, skill area, and framework already exists",
  "existing_skill_hierarchy_id": 99
}
```

---

### DELETE — Remove Skill Hierarchy

**Authorization Required**: `employee_id` with role `dept`, `admin`, or `hr`

```
DELETE /?id=42&employee_id=1
```

**Required Query Parameters**:

| Parameter     | Type    | Description                  |
| ------------- | ------- | ---------------------------- |
| `id`          | integer | Skill hierarchy ID to delete |
| `employee_id` | integer | Must have dept/admin/hr role |

**DELETE Behavior**:

1. **Foreign key check** — If `employee_skills` reference this hierarchy (ON DELETE RESTRICT), delete is rejected with 409
2. **Link deletion** — Deletes the `skill_hierarchy_links` row
3. **Orphan cleanup** — Automatically removes master table entries (domain, discipline, skill_area, framework) no longer referenced by any link

**Response (200 OK)**:

```json
{
  "message": "Skill hierarchy deleted successfully",
  "skill_hierarchy_id": 42,
  "orphaned_masters_deleted": ["domain (id=1)", "framework (id=20)"],
  "csv_synced": true
}
```

**Response (409 Conflict)** — Employee skills reference exists:

```json
{
  "error": "Cannot delete: this skill hierarchy is still referenced by employee skills",
  "details": "..."
}
```

---

## Database Operations

### Tables Used

#### `skill_hierarchy_links`

| Column          | Type      | Description             |
| --------------- | --------- | ----------------------- |
| `id`            | INTEGER   | Primary key             |
| `domain_id`     | INTEGER   | FK to master_domain     |
| `discipline_id` | INTEGER   | FK to master_discipline |
| `skill_area_id` | INTEGER   | FK to master_skill_area |
| `framework_id`  | INTEGER   | FK to master_framework  |
| `created_at`    | TIMESTAMP | Creation timestamp      |
| `updated_at`    | TIMESTAMP | Last update timestamp   |

**Unique Constraint**: `(domain_id, discipline_id, skill_area_id, framework_id)`

#### Master Tables

| Table               | Primary Key | Name Column       | Additional Columns                                               |
| ------------------- | ----------- | ----------------- | ---------------------------------------------------------------- |
| `master_domain`     | `id`        | `domain_name`     | `description`, `is_mandatory`                                    |
| `master_discipline` | `id`        | `discipline_name` | `description`, `is_mandatory`                                    |
| `master_skill_area` | `id`        | `skill_area`      | `description`, `is_mandatory`                                    |
| `master_framework`  | `id`        | `framework_name`  | `description`, `basic`, `intermediate`, `expert`, `is_mandatory` |

#### `employee_skills` (referenced)

| Column               | Type    | Description                                      |
| -------------------- | ------- | ------------------------------------------------ |
| `id`                 | INTEGER | Primary key                                      |
| `employee_id`        | INTEGER | FK to employee                                   |
| `skill_hierarchy_id` | INTEGER | FK to skill_hierarchy_links (ON DELETE RESTRICT) |
| `level_selected`     | INTEGER | Skill level (1, 2, or 3)                         |
| `approval_status`    | VARCHAR | Status (Pending/Approved/Rejected)               |

### Schema Configuration

- Default schema: `skill_matrix_v2_dev`
- Production schema: `skill_matrix_v2_prod`
- Configurable via `DB_SCHEMA` environment variable

### Transaction Management

- **GET**: Uses `engine.connect()` (read-only)
- **POST/PUT/DELETE/Bulk Upload**: Uses `engine.begin()` (atomic, auto-rollback on error)

---

## Authorization

### Role-Based Access Control

| Method            | Authorization      | Required Fields               |
| ----------------- | ------------------ | ----------------------------- |
| GET               | None               | —                             |
| POST              | dept/admin/hr role | `employee_id` in JSON body    |
| POST /bulk-upload | dept/admin/hr role | `employee_id` in form data    |
| PUT               | dept/admin/hr role | `employee_id` in JSON body    |
| DELETE            | dept/admin/hr role | `employee_id` in query params |

**Authorized Roles**: `dept`, `department`, `admin`, `hr`

Unauthorized roles (e.g., `employee`, `manager`) receive a **403 Forbidden** response.

---

## Postman Collection

Collection file: `backend/data/addSkill_v2/postman/Skill_Hierarchy_V2_API.postman_collection.json`

Set the `{{base_url}}` collection variable as follows:

- Local dev: `http://localhost:8080`
- Cloud dev/prod: `{{frontend_base_url}}/add_skill_v2` (same unprefixed client path in both environments)

For cloud requests, send `Authorization: Bearer {{sso_token}}` when end-user identity is needed; acquire `sso_token` from app `localStorage.authToken`. The existing `employee_id` role checks remain the business authorization mechanism.

### Folders in Collection

| Folder                          | Requests                                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------------------- |
| GET — Fetch Skill Hierarchies   | GET All, GET by ID, GET Not Found (404)                                                        |
| POST — Add Single Skill         | Single (201), Minimal Fields, Duplicate (409), Missing Fields (400), Unauthorized (403)        |
| POST — Add Batch Skills         | Batch (201), Partial Errors, Empty Array (400)                                                 |
| POST — Bulk Upload CSV          | CSV File (201), Missing employee_id (400), No File (400)                                       |
| PUT — Update Skill Hierarchy    | Framework+L1/L2/L3 (200), All Fields (200), Not Found (404), Duplicate (409), Missing ID (400) |
| DELETE — Remove Skill Hierarchy | Success (200), Not Found (404), Referenced (409), Missing id (400), Unauthorized (403)         |

---

## Error Handling

| Code | Meaning            | Triggered By                                                               |
| ---- | ------------------ | -------------------------------------------------------------------------- |
| 200  | Success            | GET, PUT, DELETE                                                           |
| 201  | Created            | POST (new hierarchy created or bulk with new rows)                         |
| 204  | No Content         | OPTIONS preflight                                                          |
| 400  | Bad Request        | Missing fields, invalid JSON, invalid ID, empty file                       |
| 403  | Forbidden          | Unauthorized role                                                          |
| 404  | Not Found          | Hierarchy ID doesn't exist                                                 |
| 405  | Method Not Allowed | Unsupported HTTP method (e.g., PATCH)                                      |
| 409  | Conflict           | Duplicate link (POST), duplicate combination (PUT), FK constraint (DELETE) |
| 500  | Server Error       | Database error, unexpected exception                                       |

---

## Local Development

### Running Locally

```bash
cd backend/data/addSkill_v2
functions-framework --target=add_skill_v2 --debug
```

The function will be available at: `http://127.0.0.1:8080/`

### Environment Variables Required

Create a `.env` file in `backend/` with:

```env
DB_HOST=localhost
DB_USER=your_db_user
DB_PASS=your_db_password
DB_NAME=your_database
DB_PORT=5432
DB_SCHEMA=skill_matrix_v2_dev
BUCKET_NAME=your_gcs_bucket_name
GCP_PROJECT=your_gcp_project_id
```

**Note**: The `.env` file is loaded from `Path(__file__).parent.parent.parent / ".env"` (resolves to `backend/.env`). Cloud Functions use environment variables set at deploy time.

---

## Deployment

Deployment and IAM changes belong in `skill-matrix-deploy`. The function is private, and the frontend Cloud Run runtime service account receives `roles/run.invoker`.

### Development Deployment

```bash
gcloud functions deploy dev_add_skill_v2 \
  --runtime python311 \
  --trigger-http \
  --entry-point add_skill_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=development
```

### Production Deployment

```bash
gcloud functions deploy add_skill_v2 \
  --runtime python311 \
  --trigger-http \
  --entry-point add_skill_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=production
```

The cloud-development browser path stays `/add_skill_v2`; frontend runtime `FUNCTIONS_BASE_URL` ending in `/dev_` maps it to `dev_add_skill_v2`. The proxy adds its Google identity token as `X-Serverless-Authorization` and preserves any SSO JWT in `Authorization`. Direct `*.cloudfunctions.net` diagnostics require a Google identity token whose audience is the exact function URL. Localhost needs no GCP identity token.

---

## Key Design Decisions

1. **POST vs PUT separation** — POST strictly creates (no updates to existing master entries), PUT allows updates via `update_existing=True`
2. **Get-or-create pattern** — Master entries are reused by case-insensitive name to avoid duplicates
3. **Orphan cleanup on DELETE/PUT** — Master entries with no remaining references are automatically removed
4. **Partial updates in PUT** — Only fields provided in the request body are updated
5. **`is_mandatory` support** — PUT can set mandatory flags on master entries for UI validation
6. **Employee skills warning** — PUT warns administrators when modifying hierarchies that have active employee ratings
7. **GCS CSV sync** — Every write operation keeps `Master_Skills.csv` in the GCS bucket in sync with the DB; a rolling backup is kept before each write

---

## Related Functions

- **`get_employee_skill_v2`** — Retrieves employee skills (read operation)
- **`save_employee_skill_v2`** — Saves/updates employee skill ratings (employee-facing)
- **`get_skill_hierarchy_link_v2`** — Retrieves the master skill hierarchy catalog
- **`review_skill_request_v2`** — Manager approval/rejection of skill requests
- **`get_pending_skill_request_v2`** — Gets pending skill requests for managers

---

## Data Flow Diagram

```
Administrator (dept/admin/hr)
    ↓
    GET/POST/PUT/DELETE /add_skill_v2
    ↓
Backend (add_skill_v2)
    ↓
    Database Operations
    ├─ employee (role authorization check)
    ├─ master_domain (get-or-create)
    ├─ master_discipline (get-or-create)
    ├─ master_skill_area (get-or-create)
    ├─ master_framework (get-or-create)
    ├─ skill_hierarchy_links (CRUD)
    └─ employee_skills (reference check for PUT/DELETE)
    ↓
    GCS Bucket CSV Sync (Master_Skills.csv)
    ↓
    Return JSON Response
```
