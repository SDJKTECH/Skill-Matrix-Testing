# manageComments_v2 Function Documentation

## Overview

Google Cloud Function that manages employee comments for trainings, skills, certificates, and training batches (V2 Schema). Handles both retrieval of training records with comments (GET) and adding new comments (POST). Uses a normalized comment table with entity-specific foreign keys and role-based comment type assignment.

**Location**: `backend/aggregations/manageComments_v2/main.py`

**Trigger**: HTTP GET/POST request

**Port (Local Development)**: 8111 (as per backend ports documentation)

**Database Library**: SQLAlchemy ORM

---

## Purpose

This function serves as the centralized comment management endpoint for the Skill Matrix application:

1. **Multi-Entity Support**: Manages comments for four entity types:
   - Training records (`employee_trainings`)
   - Skill records (`employee_skills`)
   - Certificate records (`employee_certificates`)
   - Training batch records (`training_batches`) — not owned by a single employee, so no `employeeId` is required/used for this type

2. **Role-Based Authorization**: Automatically determines comment type based on the commenter's role:
   - `employee`/`emp`/`user` → Comment Type: "Employee"
   - `manager`/`mgr` → Comment Type: "Manager"
   - `dept`/`department`/`admin`/`hr` → Comment Type: "Department"

3. **Dual Functionality**:
   - **GET**: Fetch all training records for an employee (`?email=`) with their latest per-enrollment comments, **or** fetch a training batch's own latest comments directly (`?batch_id=`)
   - **POST**: Add new comments to training/skill/certificate/batch records

4. **Normalized Schema**: Uses the unified `comment` table with proper foreign key constraints to maintain data integrity

---

## Function Flow

### Entry Point: `manage_employee_comments_v2(request: Request)`

The main Cloud Function handler that processes HTTP requests.

#### 1. CORS Handling
- Handles OPTIONS preflight requests
- Sets CORS headers for all origins (`*`)
- Allows `GET`, `POST`, and `OPTIONS` methods
- Includes `Authorization` header in allowed headers

#### 2. Request Method Routing
- **GET**: Routes to `fetch_batch_comments()` if `batch_id` is supplied, otherwise to `fetch_training_comments()` (by `email`)
- **POST**: Routes to `save_comment()` to add new comments
- Returns 405 for unsupported methods

#### 3. GET Flow - Fetch Comments
- Reads both `batch_id` (or `batchId`) and `email` query parameters
- **If `batch_id` is provided** (takes precedence over `email` if both are given):
  - Skips employee lookup entirely — a batch isn't owned by one employee
  - Verifies the batch exists in `training_batches`
  - Returns every comment on the batch (`comment.batch_id`), newest first
- **Otherwise, falls back to the original per-employee flow**:
  - Requires `email`; returns 400 if neither `email` nor `batch_id` is supplied
  - Normalizes email to lowercase
  - Verifies employee exists in the database
  - Fetches all training records for the employee
  - Uses LATERAL joins to get each enrollment's latest Employee/Manager/Department comment (`comment.employee_training_id`)

#### 4. POST Flow - Save Comment
- Validates JSON request body
- Extracts required fields: `commentBy`, `entityId`, `entityType`, `comment` (`employeeId` required unless `entityType` is `"batch"`)
- Validates entity type is one of: "training", "skill", "certificate", or "batch"
- Fetches employee details including manager_id (skipped for `entityType: "batch"`)
- **Role-Based Comment Type Assignment**:
  - Queries commenter's role from employee table
  - Maps role to comment_type (Employee/Manager/Department)
  - Rejects if role is invalid or not set
- Verifies entity record exists (and, for employee-owned entities, belongs to the employee; a batch has no owning employee, so only existence is checked)
- Inserts comment into the normalized comment table
- Returns comment details with timestamp

#### 5. Response
- Returns appropriate success/error messages with status codes
- Includes detailed logging for debugging

---

## API

### Endpoint

```
GET /manage_employee_comments_v2?email=<email>
GET /manage_employee_comments_v2?batch_id=<int>
POST /manage_employee_comments_v2
```

### GET Request - Fetch Training Comments (by employee email)

**Method:** `GET`

**Query Parameters:**
- `email` (required if `batch_id` is not supplied): Employee email address (case-insensitive)

**Example Request:**
```
GET /manage_employee_comments_v2?email=john.doe@company.com
```

**Response Body:**
```json
{
  "email": "john.doe@company.com",
  "count": 3,
  "results": [
    {
      "trainingId": 101,
      "employeeId": 25,
      "batch": "BATCH-2026-01",
      "competency": "Python Development",
      "module": "Advanced Python",
      "area": "Programming",
      "subArea": "Backend Development",
      "courseLevel": "L3",
      "status": "Completed",
      "type": "Existing Lateral",
      "nominatedBy": "Jane Manager",
      "startDate": "2026-01-15",
      "endDate": "2026-03-15",
      "employeeComment": "Great learning experience",
      "managerComment": "Excellent performance",
      "departmentComment": "Approved for certification"
    }
  ]
}
```

**Response Fields:**
- `email`: Employee email address
- `count`: Total number of training records returned
- `results`: Array of training records with comments
  - `trainingId`: Unique training record ID (`employee_trainings.employee_training_id`)
  - `employeeId`: Employee ID
  - `batch`: Training batch number (`training_batches.batch_num`, joined via `employee_trainings.batch_id`)
  - `competency`: Competency domain
  - `module`: Training module name (from `training_hierarchy_links` via the batch's `training_hierarchy_id`)
  - `area`: Training area from hierarchy
  - `subArea`: Training sub-area from hierarchy
  - `courseLevel`: Course difficulty level
  - `status`: Training status (e.g., "Completed", "In Progress")
  - `type`: Employee type (`employee_type` enum)
  - `nominatedBy`: Who nominated the employee for this training (`nominated_by`)
  - `startDate`: Training start date (ISO format)
  - `endDate`: Training end date (ISO format)
  - `employeeComment`: Latest comment on this specific enrollment (`comment.employee_training_id`) with `comment_type = 'Employee'`
  - `managerComment`: Latest per-enrollment comment with `comment_type = 'Manager'`
  - `departmentComment`: Latest per-enrollment comment with `comment_type = 'Department'`

**Status Codes:**
- `200` - Success
- `400` - Missing required parameter (`email` or `batch_id`)
- `404` - Employee not found
- `500` - Database or server error

---

### GET Request - Fetch Batch Comments (by batch_id)

**Method:** `GET`

**Query Parameters:**
- `batch_id` (required, integer; `batchId` also accepted): ID of the training batch (`training_batches.id`). Takes precedence over `email` if both are supplied — an employee lookup is never performed on this path, since a batch isn't owned by one employee.

**Example Request:**
```
GET /manage_employee_comments_v2?batch_id=12
```

**Response Body:**
```json
{
  "batchId": 12,
  "count": 2,
  "results": [
    {
      "batchId": 12,
      "batch": "BATCH-2026-07",
      "commentId": 458,
      "commentType": "Manager",
      "commentText": "Batch rescheduled due to trainer availability",
      "commentedById": 30,
      "commentedAt": "2026-02-12T09:15:00"
    },
    {
      "batchId": 12,
      "batch": "BATCH-2026-07",
      "commentId": 456,
      "commentType": "Department",
      "commentText": "Approved for the July cohort",
      "commentedById": 12,
      "commentedAt": "2026-02-11T14:30:00"
    }
  ]
}
```

**Response Fields:**
- `batchId`: The requested batch ID
- `count`: Total number of comments returned for the batch
- `results`: Every comment on the batch (`comment.batch_id`), newest first (`commented_at DESC`) — not limited to one per `commentType`
  - `batch`: Batch number (`training_batches.batch_num`)
  - `commentId`: `comment.comment_id`
  - `commentType`: As stored in the DB — `"Employee"`, `"Manager"`, or `"Department"`
  - `commentText`: The comment content
  - `commentedById`: ID of the employee who left the comment
  - `commentedAt`: Timestamp the comment was created (ISO format)

**Status Codes:**
- `200` - Success
- `400` - Missing/invalid `batch_id`
- `404` - Batch not found
- `500` - Database or server error

---

### POST Request - Add Comment

**Method:** `POST`

**Headers:**
- `Content-Type`: `application/json`

**Request Body:**
```json
{
  "employeeId": 25,
  "commentBy": 30,
  "entityId": 101,
  "entityType": "training",
  "comment": "Great progress on this training!"
}
```

**Request Fields:**
- `employeeId` (integer): ID of the employee who owns the record. Required for all entity types **except** `"batch"` — a training batch isn't owned by a single employee, so omit or leave blank
- `commentBy` (required, integer): ID of the person adding the comment
- `entityId` (required, integer): ID of the training/skill/certificate/batch record
- `entityType` (required, string): Type of entity - must be one of:
  - `"training"` - For training records
  - `"skill"` - For skill records
  - `"certificate"` - For certificate records
  - `"batch"` - For training batch records
- `comment` (required, string): The comment text

**Response Body:**
```json
{
  "message": "Training comment added successfully",
  "commentId": 456,
  "employeeId": 25,
  "entityId": 101,
  "entityType": "training",
  "commentBy": 30,
  "commentType": "Manager",
  "commentedAt": "2024-02-11T14:30:00"
}
```

**Response Fields:**
- `message`: Success message indicating entity type
- `commentId`: Unique ID of the newly created comment
- `employeeId`: Employee who owns the record (`null` for `entityType: "batch"`)
- `entityId`: ID of the entity record
- `entityType`: Type of entity (training/skill/certificate/batch)
- `commentBy`: ID of the person who added the comment
- `commentType`: Determined type based on commenter's role (Employee/Manager/Department)
- `commentedAt`: Timestamp when comment was added (ISO format)

**Status Codes:**
- `201` - Comment created successfully
- `400` - Missing required fields, invalid JSON, invalid entity type, or invalid role
- `404` - Employee, commenter, or entity record not found
- `500` - Database or server error

---

## Core Functions

### `get_db_engine()`

Creates and returns a SQLAlchemy engine using environment variables.

**Returns**: SQLAlchemy engine instance with NullPool (for Cloud Functions)

**Database URL Format**: `postgresql+psycopg2://{user}:{pass}@{host}:{port}/{dbname}`

**Environment Variables Used**:
- `DB_USER` - Database username
- `DB_PASS` - Database password
- `DB_HOST` - Database host
- `DB_PORT` - Database port (default: 5432)
- `DB_NAME` - Database name
- `DB_SCHEMA` - Database schema (default: "skill_matrix_v2_dev")

**Configuration**:
- Uses `NullPool` to prevent connection pooling issues in Cloud Functions
- Uses SQLAlchemy 2.0 syntax (`future=True`)
- URL-encodes credentials using `quote_plus()`

### `cors_response(data, status=200)`

Helper function to add CORS headers to any response.

**Parameters**:
- `data` - Response data (dictionary to be JSON-encoded)
- `status` - HTTP status code (default: 200)

**Returns**: Flask response with CORS headers

**CORS Headers**:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization`

### `fetch_training_comments(email: str, connection, schema: str) -> List[Dict]`

Fetches all training records for an employee with their latest comments. Unchanged from the original per-employee behavior — the `batch_id` / `fetch_batch_comments()` dispatch lives in the GET handler (`manage_comments_v2()`), not in this function; it never receives a `batch_id`.

**Parameters**:
- `email` (string): Employee email address (case-insensitive)
- `connection`: SQLAlchemy database connection
- `schema` (string): Database schema name

**Process**:
1. Verifies employee exists using email lookup
2. Fetches employee_id from employee table
3. Executes complex query with LATERAL joins to get:
   - All training records for the employee
   - Latest Employee/Manager/Department comment for each training (`comment.employee_training_id`)
4. Joins with training hierarchy tables to get area/subarea/module names
5. Orders by start_date descending

**Returns**: List of dictionaries containing training records with comments

**Raises**:
- `ValueError` - If employee with given email is not found

### `fetch_batch_comments(batch_id: int, connection, schema: str) -> List[Dict]`

Fetches every comment on a training batch (`comment.batch_id`), independent of any employee or enrollment.

**Parameters**:
- `batch_id` (int): ID of the training batch (`training_batches.id`)
- `connection`: SQLAlchemy database connection
- `schema` (string): Database schema name

**Process**:
1. Verifies the batch exists in `training_batches`
2. Runs a single query against `comment` LEFT JOINed with `employee` on `commented_by_id = employee.id`, filtered on `batch_id` (no per-`comment_type` filtering), ordered by `commented_at DESC` — returns every comment on the batch, newest first, each carrying its own `comment_type` as stored in the DB rather than being split into fixed Employee/Manager/Department fields, plus the commenter's employee details

**Returns**: List of dicts, one per comment: `{batchId, batch, commentId, commentType, commentText, commentedById, commentedByEmpId, commentedByName, commentedByEmail, commentedByDepartment, commentedByRole, commentedAt}` — empty list if the batch has no comments yet. The `commentedBy*` employee fields are `null` if the commenter's `employee` row can't be found (LEFT JOIN, so a missing/deleted commenter never drops the comment itself)

**Raises**:
- `ValueError` - If no batch with the given `batch_id` exists

**Query Details**:
- Uses `LATERAL` subqueries for efficient "latest comment per type" lookup
- Orders comments by `commented_at DESC` and takes `LIMIT 1` per type
- Returns `NULL` for comment types with no comments
- Includes full training hierarchy (area → subarea → module)

### `save_comment(employee_id, comment_by, entity_id, entity_type, comment_text, connection, schema)`

Inserts a new comment into the comment table with role-based authorization.

**Parameters**:
- `employee_id` (integer or `None`): ID of the employee who owns the record. Not applicable for `entity_type="batch"` — pass `None`
- `comment_by` (integer): ID of the person adding the comment
- `entity_id` (integer): ID of the training/skill/certificate/batch record
- `entity_type` (string): Type of entity - "training", "skill", "certificate", or "batch"
- `comment_text` (string): The comment text
- `connection`: SQLAlchemy database connection (in transaction)
- `schema` (string): Database schema name

**Process**:
1. **Validate Entity Type**: Ensures entity_type is "training", "skill", "certificate", or "batch"
2. **Fetch Employee Details**: Gets employee_id, email, name, manager_id from database — **skipped entirely for `entity_type="batch"`**, since a batch isn't owned by one employee
3. **Fetch Commenter Role**: Queries commenter's role from employee table
4. **Determine Comment Type** (role-based):
   - Role in `['employee', 'emp', 'user']` → "Employee"
   - Role in `['manager', 'mgr']` → "Manager"
   - Role in `['dept', 'department', 'admin', 'hr']` → "Department"
   - Invalid or missing role → Error
5. **Verify Entity Record**: 
   - Checks that entity record exists
   - For "training"/"skill"/"certificate", also verifies it belongs to the specified employee
   - For "batch", only existence is checked (`training_batches` has no `employee_id` column)
   - Uses appropriate table based on entity_type:
     - "training" → `employee_trainings` table
     - "skill" → `employee_skills` table
     - "certificate" → `employee_certificates` table
     - "batch" → `training_batches` table
6. **Insert Comment**:
   - Sets only the appropriate FK column based on entity_type
   - Other FK columns remain NULL
   - Records comment_type, comment_text, commented_by_id, timestamp

**Returns**: Dictionary with comment details

**Raises**:
- `ValueError` - If:
  - Invalid entity type
  - Employee not found
  - Commenter not found
  - Commenter has no role or invalid role
  - Entity record not found or doesn't belong to employee
  - Failed to insert comment

**Entity Type Mapping**:
| Entity Type | Table Name | PK Column | FK Column in Comment Table | Employee ownership check |
|------------|------------|-----------|---------------------------|---------------------------|
| training | employee_trainings | employee_training_id | employee_training_id | Yes |
| skill | employee_skills | id | employee_skill_id | Yes |
| certificate | employee_certificates | id | employee_certificate_id | Yes |
| batch | training_batches | id | batch_id | No — batches aren't owned by one employee |

**Authorization Logic**:
- Comment type is determined **solely** by the commenter's `role` column
- No relationship validation (e.g., checking if commenter is actually the manager)
- Role must be set in the database; missing role prevents commenting
- Case-insensitive role matching

---

## Database Schema

### Tables Used

#### `comment` Table
Main table for storing comments across all entity types.

**Columns**:
- `comment_id` (SERIAL PRIMARY KEY): Unique comment identifier
- `employee_training_id` (INTEGER, FK): Foreign key to employee_trainings (NULL for non-training comments)
- `employee_skill_id` (INTEGER, FK): Foreign key to employee_skills (NULL for non-skill comments)
- `employee_certificate_id` (INTEGER, FK): Foreign key to employee_certificates (NULL for non-certificate comments)
- `batch_id` (INTEGER, FK): Foreign key to training_batches (NULL for non-batch comments)
- `comment_type` (VARCHAR): "Employee", "Manager", or "Department"
- `comment_text` (TEXT): The comment content
- `commented_by_id` (INTEGER, FK): Foreign key to employee table (who commented)
- `commented_at` (TIMESTAMP): When the comment was created

**Constraints**:
- All four entity FK columns (`employee_training_id`, `employee_skill_id`, `employee_certificate_id`, `batch_id`) have ON DELETE CASCADE
- `commented_by_id` has ON DELETE SET NULL
- There is no longer a DB-level CHECK constraint enforcing "exactly one FK column set" — it was dropped when `batch_id` was added, so `save_comment()` is solely responsible for only ever populating one FK column per insert

#### `employee_trainings` Table
Employee enrollments in a training batch.

**Used Columns**:
- `employee_training_id`: Primary key
- `employee_id`: Foreign key to employee
- `batch_id`: Foreign key to `training_batches`
- `competency`, `training_status`, `employee_type`, `nominated_by`, `start_date`, `end_date`

#### `training_batches` Table
One row per training batch/cohort; holds the batch number and links to the hierarchy.

**Used Columns**:
- `id`: Primary key
- `batch_num`: Batch identifier (returned as `batch` in the API response)
- `training_hierarchy_id`: Foreign key to training hierarchy

#### `employee_skills` Table
Skill records for employees.

**Used Columns**:
- `id`: Primary key
- `employee_id`: Foreign key to employee
- `skill_hierarchy_id`: Foreign key to skill hierarchy

#### `employee_certificates` Table
Certificate records for employees.

**Used Columns**:
- `id`: Primary key
- `employee_id`: Foreign key to employee
- `certificate_id`: Foreign key to provider_certificate_mapping

#### `employee` Table
Master employee table.

**Used Columns**:
- `id`: Primary key
- `email`: Employee email (unique)
- `name`: Employee name
- `manager_id`: Foreign key to employee (self-referencing)
- `role`: Employee role (employee/manager/dept/admin/hr)

#### `training_hierarchy_links` Table
Linking table for training hierarchy.

**Used Columns**:
- `training_hierarchy_id`: Primary key
- `area_id`, `sub_area_id`, `module_id`: Foreign keys to hierarchy tables

#### `master_area`, `master_subarea`, `master_module` Tables
Training hierarchy master tables.

---

## Authorization & Security

### Role-Based Comment Types

The function uses a **role-based** system where the `comment_type` is automatically determined from the commenter's `role` column in the employee table:

#### Role Mapping:
```
employee, emp, user     → Comment Type: "Employee"
manager, mgr            → Comment Type: "Manager"
dept, department,       → Comment Type: "Department"
admin, hr
```

#### Key Points:
1. **No Relationship Validation**: The function does NOT verify if:
   - A "Manager" commenter is actually the employee's manager
   - A "Department" commenter has department permissions
   - The relationship in the org chart is valid

2. **Role Column Required**: Every user who needs to comment MUST have a role set in the employee table

3. **Case-Insensitive**: Role matching is case-insensitive (`role.lower()`)

4. **Single Source of Truth**: The employee.role column is the only source for authorization

### Security Considerations

1. **Private cloud invocation**: IAM permits only the frontend Cloud Run runtime service account to invoke the deployed function
2. **Trust-Based**: Assumes `commentBy` ID is validated by upstream systems
3. **End-user identity**: Postman may send `Authorization: Bearer {{sso_token}}` from app `localStorage.authToken`; proxy-level JWT enforcement is opt-in with `REQUIRE_SSO_JWT=true`
4. **Database Constraints**: Relies on foreign key constraints to prevent invalid references

### Recommended Enhancements

For production deployments, consider:
1. Adding JWT token validation
2. Verifying commenter's relationship to employee (manager check)
3. Adding audit logging for all comment operations
4. Implementing rate limiting
5. Adding comment edit/delete functionality with proper permissions

---

## Error Handling

### Validation Errors (400)
- Missing required query parameter: `email`
- Missing required POST fields: `commentBy`, `entityId`, `entityType`, `comment` (`employeeId` required unless `entityType` is `"batch"`)
- Invalid field types (non-integer IDs)
- Invalid JSON data
- Invalid `entityType` (not training/skill/certificate/batch)
- Commenter has no role assigned
- Commenter has invalid role for commenting

### Not Found Errors (404/400 with ValueError)
- Employee with email not found (GET)
- Employee with ID not found (POST, not applicable for `entityType: "batch"`)
- Commenter with ID not found
- Entity record not found (or, for training/skill/certificate, doesn't belong to the given employee)

### Method Errors (405)
- Unsupported HTTP method (not GET, POST, or OPTIONS)

### Server Errors (500)
- Database connection failures
- Unexpected SQLAlchemy errors
- Transaction failures
- Unexpected exceptions

### Logging

The function includes comprehensive logging:
- Request method, path, and arguments
- Database operations (queries, inserts)
- Role determination logic
- Comment type assignment
- Success/failure messages
- Error details with stack traces

All logs include contextual information for debugging.

---

## Local Development

### Prerequisites
1. Python 3.11+
2. PostgreSQL database with V2 schema
3. Required environment variables in `backend/.env`:
   ```
   DB_USER=your_db_user
   DB_PASS=your_db_password
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=skill_matrix_v2
   DB_SCHEMA=skill_matrix_v2_dev
   ```

### Running Locally

1. **Install Dependencies**:
   ```bash
   cd backend/aggregations/manageComments_v2
   pip install -r requirements.txt
   ```

2. **Start Local Server**:
   ```bash
   functions-framework --target=manage_employee_comments_v2 --debug
   ```

3. **Test GET Request**:
   ```bash
   curl "http://localhost:8080?email=john.doe@company.com"
   ```

4. **Test POST Request**:
   ```bash
   curl -X POST http://localhost:8080 \
     -H "Content-Type: application/json" \
     -d '{
       "employeeId": 25,
       "commentBy": 30,
       "entityId": 101,
       "entityType": "training",
       "comment": "Great job on this training!"
     }'
   ```

---

## Deployment

Deployment and IAM changes belong in `skill-matrix-deploy`. The function is private; the frontend runtime service account receives `roles/run.invoker`.

### Development Deployment

```bash
gcloud functions deploy dev_manageEmployeeComments_v2 \
  --runtime python311 \
  --trigger-http \
  --entry-point manage_employee_comments_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --no-gen2 \
  --region asia-south1 \
  --set-env-vars ENV=development
```

**Normal cloud URL**: `https://<frontend-service>/manage_employee_comments_v2`. The development browser path stays unprefixed; frontend runtime `FUNCTIONS_BASE_URL` ending in `/dev_` maps it to the development upstream.

### Production Deployment

```bash
gcloud functions deploy manageEmployeeComments_v2 \
  --runtime python311 \
  --trigger-http \
  --entry-point manage_employee_comments_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --no-gen2 \
  --region asia-south1 \
  --set-env-vars ENV=production
```

**Normal cloud URL**: `https://<frontend-service>/manage_employee_comments_v2`

### Environment Variables

Set these as Cloud Function environment variables:
- `DB_USER` - Database username
- `DB_PASS` - Database password
- `DB_HOST` - Cloud SQL instance connection name or IP
- `DB_PORT` - Database port (default: 5432)
- `DB_NAME` - Database name
- `DB_SCHEMA` - Schema name (skill_matrix_v2_dev or skill_matrix_v2_prod)
- `ENV` - Environment identifier (development/production)

### Deployment Notes

1. **Service Account**: Uses `training-project-419308@appspot.gserviceaccount.com`
2. **Region**: Deployed to `asia-south1`
3. **Authentication**: Private IAM; the frontend proxy adds a Google identity token as `X-Serverless-Authorization` while preserving any SSO JWT in `Authorization`
4. **Generation**: Uses Gen1 Cloud Functions (`--no-gen2`)
5. **Runtime**: Python 3.11
6. **Dependencies**: Automatically installs from `requirements.txt`

---

## Future Enhancements

### Planned Features
1. **Comment History**: GET endpoint to fetch all comments for an entity (not just latest)
2. **Comment Editing**: PUT endpoint to edit existing comments
3. **Comment Deletion**: DELETE endpoint with proper authorization
4. **Pagination**: For training records with large comment histories
5. **Comment Reactions**: Like/acknowledge comments
6. **Notifications**: Email/push notifications for new comments
7. **Comment Mentions**: Tag specific users in comments
8. **Thread Support**: Nested comment threads/replies

### Authorization Improvements
1. **JWT Authentication**: Verify user identity with tokens
2. **Manager Validation**: Check if commenter is actually the employee's manager
3. **Department Role Verification**: Validate department-level permissions
4. **Audit Trail**: Track all comment operations with user details
5. **Comment Visibility**: Control who can see which comments
6. **Read Receipts**: Track when comments are read

### Performance Optimizations
1. **Caching**: Cache frequently accessed training records
2. **Batch Operations**: Support adding multiple comments in one request
3. **Async Processing**: Background jobs for email notifications
4. **Database Indexing**: Add indexes on FK columns in comment table

---

## Postman Examples — Batch Comments

For cloud testing set `{{base_url}}` to `{{frontend_base_url}}` and use the same-origin request paths below. If end-user identity is needed, add `Authorization: Bearer {{sso_token}}`. Direct `*.cloudfunctions.net` access is platform/admin diagnostics only and requires a Google identity token whose audience is the exact function URL. Localhost requests require no GCP identity token.

### GET — Fetch batch comments

```
GET {{base_url}}/manage_employee_comments_v2?batch_id=12
```

No body is required. `batchId` is also accepted as the parameter name. The SSO header is optional when proxy JWT enforcement is unset.

**Response (200):**
```json
{
  "batchId": 12,
  "count": 2,
  "results": [
    {
      "batchId": 12,
      "batch": "BATCH-2026-07",
      "commentId": 458,
      "commentType": "Manager",
      "commentText": "Batch rescheduled due to trainer availability",
      "commentedById": 30,
      "commentedByEmpId": "005491",
      "commentedByName": "Jane Manager",
      "commentedByEmail": "jane.manager@jktech.com",
      "commentedByDepartment": "Delivery > IFS",
      "commentedByRole": "Manager",
      "commentedAt": "2026-02-12T09:15:00"
    },
    {
      "batchId": 12,
      "batch": "BATCH-2026-07",
      "commentId": 456,
      "commentType": "Department",
      "commentText": "Approved for the July cohort",
      "commentedById": 12,
      "commentedByEmpId": "007327",
      "commentedByName": "Chandrakant Majumdar",
      "commentedByEmail": "chandrakant.majumdar@jktech.com",
      "commentedByDepartment": null,
      "commentedByRole": "Dept",
      "commentedAt": "2026-02-11T14:30:00"
    }
  ]
}
```

**Response (404) — batch doesn't exist:**
```json
{ "error": "Batch with id 999999999 not found" }
```

### POST — Add a batch comment

```
POST {{base_url}}/manage_employee_comments_v2
Content-Type: application/json
```

```json
{
  "commentBy": 30,
  "entityId": 12,
  "entityType": "batch",
  "comment": "Batch rescheduled due to trainer availability"
}
```

Note: `employeeId` is omitted — it's not required (and ignored if sent) for `entityType: "batch"`, since a batch isn't owned by one employee. `commentBy`'s role in the `employee` table determines whether the resulting `commentType` is `"Employee"`, `"Manager"`, or `"Department"`.

**Response (201):**
```json
{
  "message": "Batch comment added successfully",
  "commentId": 459,
  "employeeId": null,
  "entityId": 12,
  "entityType": "batch",
  "commentBy": 30,
  "commentType": "Manager",
  "commentedAt": "2026-02-12T10:05:00"
}
```

**Error examples:**
```json
// missing commentBy → 400
{ "error": "Missing required field: commentBy" }

// entityId doesn't exist as a batch → 400 (ValueError)
{ "error": "Batch record 999999999 not found" }

// commentBy has no role assigned → 400
{ "error": "User 30 has no role assigned and cannot comment" }
```

---

## Related Documentation

- [getCombinedHierarchy_v2](./getCombinedHierarchy_v2.md) - Aggregation function for manager hierarchy view
- [saveEmployeeSkill_v2](../skills/saveEmployeeSkill_v2.md) - Skill save function with approval workflow
- [saveEmployeeCertificate_v2](../certificates/saveEmployeeCertificate_v2.md) - Certificate save function
- [Database Schema](../../database/ER_DIAGRAM.md) - Complete V2 database schema
- [Backend Function Sequence](../../BACKEND_FUNCTION_SEQUENCE.md) - Function call order

---

## Changelog

### Version 2.1.0 (Current)
- Added `"batch"` as a fourth entity type, backed by the new `comment.batch_id` FK to `training_batches`
- `employeeId` is no longer required when `entityType` is `"batch"` (batches aren't owned by one employee)
- Noted that the DB no longer enforces "exactly one FK set" via a CHECK constraint (dropped when `batch_id` was added) — this is now solely enforced in application code
- GET now accepts a `batch_id` query parameter: the handler (`manage_comments_v2()`) branches directly to a new `fetch_batch_comments()` when it's supplied, returning every comment on that batch (newest first, each with its own `commentType` from the DB) and skipping employee lookup/validation entirely. `fetch_training_comments()` itself is untouched — the `email`-based path calls it exactly as before when `batch_id` is omitted.
- `fetch_batch_comments()` now LEFT JOINs `employee` on `commented_by_id` and includes the commenter's `emp_id`, `name`, `email`, `department`, and `role` in each comment (`commentedByEmpId`/`commentedByName`/`commentedByEmail`/`commentedByDepartment`/`commentedByRole`)

### Version 2.0.0
- Multi-entity support (training, skill, certificate)
- Normalized comment table with entity-specific FKs
- Role-based comment type assignment
- LATERAL joins for efficient latest comment retrieval
- Comprehensive error handling and logging
- Transaction-based comment insertion

### Version 1.0.0 (Deprecated)
- Training comments only
- Comment fields directly in employee_trainings table
- No role-based authorization
- Limited comment tracking

---

## Support & Troubleshooting

### Common Issues

#### "Employee with email X not found"
- **Cause**: Email doesn't exist in employee table or case mismatch
- **Solution**: Verify email exists, check for typos, ensure lowercase

#### "User X has no role assigned and cannot comment"
- **Cause**: Commenter's `role` column is NULL in employee table
- **Solution**: Update employee table with valid role value

#### "User X has invalid role 'Y' for commenting"
- **Cause**: Role value doesn't match expected values
- **Solution**: Set role to one of: employee/emp/user/manager/mgr/dept/department/admin/hr

#### "Training/Skill/Certificate record X not found for employee Y"
- **Cause**: Entity doesn't exist or belongs to different employee
- **Solution**: Verify entityId and employeeId are correct

#### No comments showing in GET response
- **Cause**: No comments added yet or different entity type
- **Solution**: Currently GET only returns training comments; use POST to add comments

### Debug Mode

Enable detailed logging in local development:
```bash
functions-framework --target=manage_employee_comments_v2 --debug
```

Check logs for:
- SQL query execution
- Role determination logic
- Comment type assignment
- Error stack traces

### Contact

For issues or questions, contact the backend development team or create an issue in the project repository.
