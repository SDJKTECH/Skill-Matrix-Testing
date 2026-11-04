# save_employee_skill_v2 Function Documentation

## Overview

`save_employee_skill_v2` is a Google Cloud Function that saves or updates employee skills with an integrated approval workflow. It handles adding new skills, updating existing skills, deleting removed skills, and manages the approval status based on skill levels. The function also sends email notifications to managers when employees request L3 (expert-level) skills that require approval.

**Location**: `backend/skills/saveEmployeeSkill_v2/main.py`

**Trigger**: HTTP POST request

**Port (Local Development)**: 8080 (as per deployment comments)

**Database Library**: SQLAlchemy ORM

## Cloud access and authentication

The deployed function is private behind IAM. Use `{{frontend_base_url}}/save_employee_skill_v2` for cloud tests and optionally send `Authorization: Bearer {{sso_token}}`. The token is required only when `REQUIRE_SSO_JWT=true` is enabled on the frontend proxy. Direct `cloudfunctions.net` calls are admin diagnostics only and require a Google identity token.

---

## Purpose

This function is the core write operation for employee skills in the Skill Matrix application. When an employee updates their skills:

1. The frontend sends the complete list of skills with their levels
2. The function compares with existing skills to determine what changed
3. Performs add/update/delete operations efficiently
4. Sets appropriate approval status based on skill levels:
   - **L3 (Expert)**: Requires manager approval → Status: "Pending"
   - **L1/L2**: Auto-approved → Status: "Pre-Approved"
5. Sends email notifications to managers for pending L3 skills

**Key Features**:
- Efficient add/update/delete operations (only processes changed skills)
- Automatic approval workflow based on skill levels
- Email notifications for pending L3 skill requests
- Manager relationship management (can update manager_id)
- Uses `reviewed_by` (employee_id) instead of email for tracking
- Sets `reviewed_by = NULL` for pending requests
- Transaction-based operations (all-or-nothing)

---

## Function Flow

### Entry Point: `save_employee_skill_v2(request: Request)`

The main Cloud Function handler that processes HTTP requests.

#### 1. CORS Handling
- Handles OPTIONS preflight requests
- Sets CORS headers for all origins (`*`)
- Allows `POST` and `OPTIONS` methods
- Includes `Authorization` header in allowed headers

#### 2. Request Validation
- Validates JSON body is present
- Validates required fields: `email`, `skills`
- Validates `skills` is an array
- Normalizes email to lowercase

#### 3. Core Processing
- Calls `save_employee_skills_v2()` to perform database operations
- Returns result with counts and status

#### 4. Response
- Returns success message with pending count and saved count
- Handles errors with appropriate HTTP status codes

---

## Core Functions

### `get_db_engine()`

Creates and returns a SQLAlchemy engine using environment variables.

**Returns**: SQLAlchemy engine instance

**Database URL Format**: `postgresql+psycopg2://{user}:{pass}@{host}:{port}/{dbname}`

**Environment Variables Used**:
- `DB_USER` - Database username
- `DB_PASS` - Database password
- `DB_HOST` - Database host
- `DB_PORT` - Database port (default: 5432)
- `DB_NAME` - Database name

### `cors_response(data, status=200)`

Helper function to add CORS headers to any response.

**Parameters**:
- `data` - Response data (will be JSON-encoded)
- `status` - HTTP status code (default: 200)

**Returns**: Flask response with CORS headers

**CORS Headers**:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization`

### `get_employee_info(email: str, conn) -> Optional[tuple]`

Gets employee ID, name, and manager_id from email.

**Parameters**:
- `email` - Employee email address
- `conn` - Database connection

**Returns**: Tuple of `(id, name, manager_id)` or `None` if not found

### `get_manager_email(manager_id: int, conn) -> Optional[str]`

Gets manager email from manager_id.

**Parameters**:
- `manager_id` - Manager's employee ID
- `conn` - Database connection

**Returns**: Manager email or `None` if not found

### `get_manager_id(manager_email: str, conn) -> Optional[int]`

Gets manager ID from manager email.

**Parameters**:
- `manager_email` - Manager email address
- `conn` - Database connection

**Returns**: Manager employee ID or `None` if not found

### `get_skill_name(skill_hierarchy_id: int, conn) -> str`

Gets formatted skill name from skill_hierarchy_id for email display.

**Parameters**:
- `skill_hierarchy_id` - Skill hierarchy link ID
- `conn` - Database connection

**Returns**: Formatted skill name (Domain | Discipline | Skill Area | Framework) or fallback string

### `save_employee_skills_v2(email: str, skills: List[Dict], manager_email: str = "") -> Dict`

Main function that saves employee skills with approval workflow.

**Parameters**:
- `email` - Employee email address
- `skills` - List of skill dictionaries with `skillhierarchy_id` and `Level`
- `manager_email` - Optional manager email to update manager relationship

**Returns**: Dictionary with:
- `message` - Success message
- `pending_skills_sent_to` - Manager email (if pending skills exist)
- `pending_count` - Number of pending L3 skills
- `saved_count` - Total number of skills saved/updated

**Process Flow**:

1. **Employee Lookup**
   - Fetches employee ID, name, and current manager_id
   - Raises error if employee not found

2. **Manager Update** (if `manager_email` provided)
   - Looks up manager by email
   - Updates employee's `manager_id` if different from current
   - Logs warning if manager not found

3. **Fetch Existing Skills**
   - Queries all existing skills for the employee
   - Creates map of `skill_hierarchy_id` → `{level_selected, approval_status, reviewed_by}`

4. **Process Skills**
   - Separates skills into: add, update, delete
   - **Delete**: Skills in existing but not in new list
   - **Add**: Skills in new list but not in existing
   - **Update**: Skills in both but with changed level
   - **Skip**: Skills with same level (no change needed)

5. **Approval Status Logic**
   - **New L3 skill**: Status = "Pending", `reviewed_by = NULL`
   - **New L1/L2 skill**: Status = "Pre-Approved"
   - **Existing skill → L3**: Status = "Pending", `reviewed_by = NULL`
   - **Existing skill → L1/L2**: Status = "Pre-Approved"
   - **Approved L3 → downgrade**: Status = "Pre-Approved" (auto-approve at new level)

6. **Database Operations** (in transaction)
   - Delete removed skills
   - Insert new skills
   - Update changed skills
   - All operations use `engine.begin()` for transaction management

7. **Email Notification** (if pending L3 skills exist)
   - Fetches skill names for display
   - Checks email configuration (SEND_EMAIL_URL, EMAIL_TEMPLATE); email link base URL comes from `resolve_app_url()` — the request's `Origin` header first, `APP_URL` as fallback
   - Formats email with skill list (max 5 visible, shows "+X more" if more)
   - Sends email to manager via SEND_EMAIL_URL
   - Logs warnings if email fails (doesn't fail the save operation)

---

## API Specification

### Endpoint

**URL**: `/save_employee_skill_v2`

**Method**: `POST`

**Content-Type**: `application/json`

### Request Body

```json
{
  "email": "employee@example.com",
  "skills": [
    {
      "skillhierarchy_id": 123,
      "Level": "L3"
    },
    {
      "skillhierarchy_id": 456,
      "Level": "L2"
    }
  ],
  "managerEmail": "manager@example.com"  // Optional
}
```

**Fields**:
- `email` (required) - Employee email address
- `skills` (required) - Array of skill objects
  - `skillhierarchy_id` (required) - Skill hierarchy link ID
  - `Level` (required) - Skill level: "L1", "L2", or "L3"
- `managerEmail` (optional) - Manager email to update employee's manager relationship

### Response

#### Success Response (200)

```json
{
  "message": "Skills saved for employee@example.com",
  "pending_skills_sent_to": "manager@example.com",
  "pending_count": 2,
  "saved_count": 5
}
```

**Fields**:
- `message` - Success message
- `pending_skills_sent_to` - Manager email (null if no pending skills)
- `pending_count` - Number of L3 skills requiring approval
- `saved_count` - Total number of skills added/updated

#### Error Responses

**400 Bad Request** - Missing required fields
```json
{
  "error": "Missing required field: email"
}
```

**404 Not Found** - Employee not found
```json
{
  "error": "Employee not found for email: employee@example.com"
}
```

**500 Internal Server Error** - Database or other errors
```json
{
  "error": "Error message"
}
```

---

## Database Interactions

### Tables Used

1. **`employee`**
   - **Read**: Get employee ID, name, manager_id
   - **Update**: Update manager_id if provided

2. **`employee_skills`**
   - **Read**: Fetch existing skills for comparison
   - **Insert**: Add new skills
   - **Update**: Update changed skills (level, approval_status, reviewed_by)
   - **Delete**: Remove skills not in new list

3. **`skill_hierarchy_links`** (via joins)
   - **Read**: Get skill names for email notifications

4. **`master_domain`, `master_discipline`, `master_skill_area`, `master_framework`** (via joins)
   - **Read**: Get skill hierarchy names for email display

### Key Database Operations

#### 1. Employee Lookup
```sql
SELECT id, name, manager_id 
FROM "skill_matrix_v2_dev".employee 
WHERE LOWER(email) = LOWER(:email)
```

#### 2. Fetch Existing Skills
```sql
SELECT skill_hierarchy_id, level_selected, approval_status, reviewed_by
FROM "skill_matrix_v2_dev".employee_skills
WHERE employee_id = :emp_id
```

#### 3. Delete Skills
```sql
DELETE FROM "skill_matrix_v2_dev".employee_skills 
WHERE employee_id = :emp_id 
AND skill_hierarchy_id IN :skill_ids
```

#### 4. Insert New Skills
```sql
INSERT INTO "skill_matrix_v2_dev".employee_skills
(employee_id, skill_hierarchy_id, level_selected, approval_status, reviewed_by, requested_at)
VALUES (:employee_id, :skill_hierarchy_id, :level_selected, :approval_status, :reviewed_by, NOW())
```

#### 5. Update Skills
```sql
UPDATE "skill_matrix_v2_dev".employee_skills
SET 
    level_selected = :level_selected,
    approval_status = :approval_status,
    reviewed_by = :reviewed_by,
    requested_at = NOW(),
    reviewed_at = CASE 
        WHEN :approval_status = 'Pending' THEN NULL 
        ELSE reviewed_at 
    END,
    rejection_reason = CASE 
        WHEN :approval_status = 'Pending' THEN NULL 
        ELSE rejection_reason 
    END,
    updated_at = NOW()
WHERE employee_id = :employee_id AND skill_hierarchy_id = :skill_hierarchy_id
```

### Transaction Management

All database operations are wrapped in `engine.begin()` context manager:
- **Success**: All changes committed automatically
- **Error**: All changes rolled back automatically
- **Isolation**: Ensures data consistency

---

## Environment Variables

### Required Environment Variables

Create a `.env` file in `backend/skills/saveEmployeeSkill_v2/` with:

#### Database Configuration
```env
DB_HOST=your-database-host
DB_USER=your-database-username
DB_PASS=your-database-password
DB_NAME=your-database-name
DB_PORT=5432
DB_SCHEMA=skill_matrix_v2_dev
```

#### Email Configuration
```env
BASE_URL=https://asia-south1-training-project-419308.cloudfunctions.net/
SEND_EMAIL_URL=https://asia-south1-training-project-419308.cloudfunctions.net/send_mail
APP_URL=https://skill-matrix-140475459295.asia-south1.run.app/
EMAIL_TEMPLATE="<!doctypehtml><html lang=en>...</html>"
```

`BASE_URL` and `SEND_EMAIL_URL` are private server-to-server upstream values, not browser or normal
Postman URLs. A direct caller must attach a Google identity token whose audience is the exact
`send_mail` URL; an SSO JWT alone does not authorize direct invocation.

**Note**: `EMAIL_TEMPLATE` should be wrapped in double quotes in the `.env` file due to special characters. The code automatically strips quotes if present.

### Environment Variable Details

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `DB_HOST` | Yes | Database hostname | `localhost` or `db.example.com` |
| `DB_USER` | Yes | Database username | `postgres` |
| `DB_PASS` | Yes | Database password | `password123` |
| `DB_NAME` | Yes | Database name | `skill_matrix_db` |
| `DB_PORT` | No | Database port (default: 5432) | `5432` |
| `DB_SCHEMA` | No | Database schema (default: skill_matrix_v2_dev) | `skill_matrix_v2_dev` |
| `BASE_URL` | No* | Private server-to-server base URL for email service | `https://...cloudfunctions.net/` |
| `SEND_EMAIL_URL` | No* | Private email-service upstream; exact-audience Google identity token required | `https://...cloudfunctions.net/send_mail` |
| `APP_URL` | No* | Fallback email-link base URL, used only when the request has no `Origin` header (see `resolve_app_url()` below) | `https://skill-matrix...run.app/` |
| `EMAIL_TEMPLATE` | No* | HTML email template | `"<!doctypehtml>..."` |

*Required only if email notifications are needed

`resolve_app_url(request)` builds the email deep-link base URL from the request's `Origin` header first (echoing back `scheme://netloc/`), falling back to `APP_URL` only when `Origin` is missing or malformed — so `APP_URL` matters mainly for non-browser callers (Postman, server-to-server) that don't send an `Origin` header.

---

## Approval Workflow

### Skill Level → Approval Status Mapping

| Skill Level | Approval Status | Reviewed By | Notes |
|-------------|----------------|-------------|-------|
| L1 (New) | Pre-Approved | NULL | Auto-approved |
| L2 (New) | Pre-Approved | NULL | Auto-approved |
| L3 (New) | Pending | NULL | Requires manager approval |
| L1/L2 → L3 | Pending | NULL | Requires manager approval |
| L3 → L1/L2 | Pre-Approved | NULL | Auto-approved (downgrade) |
| Approved L3 → L1/L2 | Pre-Approved | NULL | Auto-approved (downgrade) |

### Approval Status Values

- **Pending**: Skill requires manager approval (L3 only)
- **Pre-Approved**: Skill is auto-approved (L1/L2)
- **Approved**: Skill has been approved by manager (set by `reviewSkillRequest_v2`)
- **Rejected**: Skill has been rejected by manager (set by `reviewSkillRequest_v2`)

### Email Notification Flow

1. **Trigger**: When L3 skills are saved with "Pending" status
2. **Recipient**: Manager email (from `employee.manager_id`)
3. **Content**: 
   - Employee name
   - List of requested skills (max 5 visible, shows "+X more")
   - Link to Skill Matrix app
4. **Service**: Calls `SEND_EMAIL_URL` with JSON payload
5. **Error Handling**: Logs warnings but doesn't fail the save operation

---

## Usage Examples

### Example 1: Save New Skills

**Request**:
```json
POST /save_employee_skill_v2
Content-Type: application/json

{
  "email": "john.doe@jktech.com",
  "skills": [
    {
      "skillhierarchy_id": 101,
      "Level": "L2"
    },
    {
      "skillhierarchy_id": 102,
      "Level": "L3"
    }
  ]
}
```

**Response**:
```json
{
  "message": "Skills saved for john.doe@jktech.com",
  "pending_skills_sent_to": "manager@jktech.com",
  "pending_count": 1,
  "saved_count": 2
}
```

**What Happened**:
- Added 2 new skills
- Skill 101 (L2) → Status: "Pre-Approved"
- Skill 102 (L3) → Status: "Pending", email sent to manager

### Example 2: Update Existing Skills

**Request**:
```json
{
  "email": "john.doe@jktech.com",
  "skills": [
    {
      "skillhierarchy_id": 101,
      "Level": "L3"  // Changed from L2 to L3
    },
    {
      "skillhierarchy_id": 102,
      "Level": "L3"  // Already L3, no change
    }
  ]
}
```

**Response**:
```json
{
  "message": "Skills saved for john.doe@jktech.com",
  "pending_skills_sent_to": "manager@jktech.com",
  "pending_count": 1,
  "saved_count": 1
}
```

**What Happened**:
- Updated skill 101: L2 → L3 → Status: "Pending", email sent
- Skill 102: No change (skipped)
- Only 1 skill was updated

### Example 3: Remove Skills

**Request**:
```json
{
  "email": "john.doe@jktech.com",
  "skills": [
    {
      "skillhierarchy_id": 101,
      "Level": "L2"
    }
    // Skill 102 removed from list
  ]
}
```

**Response**:
```json
{
  "message": "Skills saved for john.doe@jktech.com",
  "pending_skills_sent_to": null,
  "pending_count": 0,
  "saved_count": 0
}
```

**What Happened**:
- Skill 101: No change (skipped)
- Skill 102: Deleted (not in new list)

### Example 4: Update Manager

**Request**:
```json
{
  "email": "john.doe@jktech.com",
  "skills": [...],
  "managerEmail": "new.manager@jktech.com"
}
```

**What Happened**:
- Updated `employee.manager_id` to new manager's ID
- Future email notifications will go to new manager

---

## Error Handling

### Validation Errors

- **Missing email**: Returns 400 with error message
- **Missing skills**: Returns 400 with error message
- **Employee not found**: Returns 404 with error message

### Database Errors

- **SQLAlchemyError**: Caught and logged, returns 500
- **Transaction rollback**: Automatic on any error
- **Connection errors**: Handled by SQLAlchemy pool

### Email Notification Errors

- **Missing configuration**: Logs warning, continues (doesn't fail save)
- **Email service error**: Logs warning, continues (doesn't fail save)
- **Network timeout**: Logs warning, continues (doesn't fail save)

**Important**: Email notification failures do not prevent skills from being saved. The function prioritizes data persistence over notifications.

---

## Performance Considerations

### Optimization Strategies

1. **Skip Unchanged Skills**: Only processes skills with changed levels
2. **Bulk Operations**: Groups operations by type (add/update/delete)
3. **Transaction Management**: Single transaction for all operations
4. **Connection Pooling**: Uses NullPool for Cloud Functions (stateless)

### Efficiency

- **Best Case**: Only new/changed skills processed
- **Worst Case**: All skills compared (still efficient with set operations)
- **Database Queries**: 
  - 1 query to fetch employee info
  - 1 query to fetch existing skills
  - N queries for inserts (N = new skills)
  - M queries for updates (M = changed skills)
  - 1 query for deletes (if any)
  - Additional queries for email (only if pending L3 skills)

---

## Testing

### Local Testing

```bash
cd backend/skills/saveEmployeeSkill_v2
functions-framework --target=save_employee_skill_v2 --source main.py --debug --port=8080
```

### Test Request (using curl)

```bash
curl -X POST http://localhost:8080 \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "skills": [
      {
        "skillhierarchy_id": 1,
        "Level": "L3"
      }
    ]
  }'
```

### Test Scenarios

1. **New Employee Skills**: Add skills for new employee
2. **Update Skill Levels**: Change L2 → L3, L3 → L2
3. **Remove Skills**: Remove skills from list
4. **Mixed Operations**: Add, update, and delete in single request
5. **Manager Update**: Update manager relationship
6. **Email Notification**: Verify email sent for L3 skills

---

## Deployment

Cloud deployment/IAM belongs in `skill-matrix-deploy`. The function is private and invoked by the frontend Cloud Run runtime service account with `roles/run.invoker`.

### Production Deployment

```bash
gcloud functions deploy save_employee_skill_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point save_employee_skill_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --no-gen2 \
  --region asia-south1 \
  --set-env-vars ENV=production
```

### Development Deployment

```bash
gcloud functions deploy dev_save_employee_skill_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point save_employee_skill_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --no-gen2 \
  --region asia-south1 \
  --set-env-vars ENV=development
```

### Environment Variables in Deployment

For browser and normal cloud Postman testing, use `{{frontend_base_url}}/save_employee_skill_v2` in both environments. Development remains unprefixed in the client; runtime `FUNCTIONS_BASE_URL` ending in `/dev_` selects `dev_save_employee_skill_v2`. Send `Authorization: Bearer {{sso_token}}` from app `localStorage.authToken` when end-user identity is needed.

The frontend proxy adds its Google identity token as `X-Serverless-Authorization` and preserves the SSO JWT in `Authorization`. Direct `*.cloudfunctions.net` diagnostics require a Google identity token whose audience is the exact function URL. Localhost needs no GCP identity token.

Set environment variables using `--set-env-vars`:

```bash
--set-env-vars \
  DB_HOST=your-host, \
  DB_USER=your-user, \
  DB_PASS=your-pass, \
  DB_NAME=your-db, \
  DB_SCHEMA=skill_matrix_v2_dev, \
  SEND_EMAIL_URL=https://..., \
  APP_URL=https://..., \
  EMAIL_TEMPLATE="..."
```

---

## Dependencies

### Python Packages

See `requirements.txt`:

```
python-dotenv==1.0.0
flask==3.0.0
functions-framework==3.5.0
sqlalchemy==2.0.23
psycopg2-binary==2.9.9
requests==2.31.0
```

### External Services

- **PostgreSQL Database**: For skill data storage
- **Email Service** (optional): For manager notifications (`SEND_EMAIL_URL`)

---

## Related Functions

- **`get_employee_skill_v2`**: Retrieves employee skills (read operation)
- **`review_skill_request_v2`**: Manager approval/rejection of pending skills
- **`get_pending_skill_request_v2`**: Gets pending skills for manager review
- **`get_skill_hierarchy_link_v2`**: Gets master skill catalog

---

## Notes

1. **Idempotency**: The function is idempotent - calling it multiple times with the same data produces the same result.

2. **Transaction Safety**: All operations are wrapped in a transaction. If any operation fails, all changes are rolled back.

3. **Email Notifications**: Email notifications are sent asynchronously and failures don't affect the save operation.

4. **Manager Relationship**: The function can update the employee's manager relationship if `managerEmail` is provided.

5. **Approval Workflow**: Only L3 skills require manager approval. L1/L2 skills are auto-approved with "Pre-Approved" status.

6. **Reviewed By**: The `reviewed_by` field is set to `NULL` for pending requests. It's only set when a manager reviews the skill using `review_skill_request_v2`.

7. **Skill Comparison**: The function compares existing skills with new skills to determine what changed, ensuring only necessary operations are performed.

---

## Changelog

- **v2**: Migrated to SQLAlchemy ORM, added email notifications, improved approval workflow
- **v2.1**: Added manager relationship update capability
- **v2.2**: Moved all configuration to environment variables, improved error handling
