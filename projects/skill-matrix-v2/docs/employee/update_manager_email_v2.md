# update_manager_email_v2 Function Documentation

## Overview

`update_manager_email_v2` is a Google Cloud Function that updates the manager relationship for an employee. It converts a manager email to a `manager_id` (foreign key) and updates the employee record. The function also includes intelligent auto-creation of manager records for `@jktech.com` emails and automatically updates the manager's role.

**Location**: `backend/employee/update_manager_email_v2/main.py`

**Trigger**: HTTP POST request

**Port (Local Development)**: 8091 (as per `BACKEND_PORTS.md`)

**Database Library**: SQLAlchemy ORM

## Cloud access and authentication

The deployed function is private behind IAM. Use `{{frontend_base_url}}/update_manager_email_v2` for cloud tests and optionally send `Authorization: Bearer {{sso_token}}`. The token is required only when `REQUIRE_SSO_JWT=true` is enabled on the frontend proxy. Direct `cloudfunctions.net` calls are admin diagnostics only and require a Google identity token.

---

## Purpose

This function manages the manager-employee relationship in the database:

1. **Updates Manager Relationship**: Converts manager email to `manager_id` (foreign key) and updates the employee record
2. **Auto-Creates Managers**: If a manager doesn't exist and their email ends with `@jktech.com`, automatically creates a new employee record for them
3. **Updates Manager Role**: Ensures that when someone is set as a manager, their role is updated to "Manager"
4. **Maintains Data Integrity**: Uses foreign key relationships to ensure referential integrity

---

## Function Flow

### Entry Point: `update_manager_email_v2(request: Request)`

The main Cloud Function handler that processes HTTP requests.

#### 1. CORS Handling
- Handles OPTIONS preflight requests
- Sets CORS headers for all origins (`*`)
- Allows `POST` and `OPTIONS` methods
- Includes `Authorization` header in allowed headers

#### 2. Request Validation
- Validates that the request method is POST
- Extracts and validates required fields:
  - `email` (required) - Employee email
  - `managerEmail` (required) - Manager email to set
- Normalizes emails to lowercase

#### 3. Data Processing
- Calls `_update_manager_email()` to perform database operations

#### 4. Response
- Returns JSON response with managerEmail and managerId
- Handles errors with appropriate HTTP status codes

---

## Core Functions

### `get_db_engine()`

Creates and returns a SQLAlchemy engine using environment variables.

**Returns**: SQLAlchemy engine instance

**Database URL Format**: `postgresql+psycopg2://{user}:{pass}@{host}:{port}/{dbname}`

### `is_jktech_email(email: str) -> bool`

Checks if an email ends with `@jktech.com`.

**Parameters**:
- `email` - Email address to check

**Returns**: `True` if email ends with `@jktech.com`, `False` otherwise

### `get_or_create_manager(manager_email: str, conn) -> Optional[int]`

Gets manager_id from manager_email. If not found and email is `@jktech.com`, creates a new employee record for the manager.

**Parameters**:
- `manager_email` - Manager email address
- `conn` - SQLAlchemy database connection

**Returns**: `manager_id` (int) or `None`

**Logic**:
1. First, tries to find existing manager by email
2. If found, returns their `id`
3. If not found:
   - Checks if email ends with `@jktech.com`
   - If yes, creates new employee record with:
     - `email` = manager email
     - `role` = "Manager"
     - Other fields = NULL (will be updated when they login)
   - Returns the new `id`
   - If not `@jktech.com`, returns `None`

### `_update_manager_email(email: str, manager_email: str) -> Dict[str, Any]`

Main function that performs the manager update operation.

**Parameters**:
- `email` - Employee email (unique identifier)
- `manager_email` - Manager email to set (will be converted to manager_id)

**Returns**: Dictionary with `managerEmail`, `managerId`, and `message`

---

## Database Operations

### 1. Get or Create Manager

**Find Existing Manager**:
```sql
SELECT id 
FROM "{schema}".employee 
WHERE LOWER(email) = LOWER(:email)
```

**Create New Manager** (if not found and `@jktech.com`):
```sql
INSERT INTO "{schema}".employee (email, role, created_at, updated_at)
VALUES (:email, 'Manager', NOW(), NOW())
RETURNING id
```

### 2. Update Manager Role

Ensures the manager's role is set to "Manager":
```sql
UPDATE "{schema}".employee
SET role = 'Manager',
    updated_at = NOW()
WHERE id = :manager_id
  AND (role IS NULL OR role != 'Manager')
```

**Note**: Only updates if role is NULL or not already "Manager" to avoid unnecessary updates.

### 3. Update Employee's Manager ID

Updates the employee's `manager_id` foreign key:
```sql
UPDATE "{schema}".employee
SET manager_id = :manager_id,
    updated_at = NOW()
WHERE LOWER(email) = LOWER(:email)
RETURNING manager_id, email
```

### 4. Get Manager Email for Response

Retrieves the manager's email from their ID:
```sql
SELECT email 
FROM "{schema}".employee 
WHERE id = :manager_id
```

---

## Auto-Create Manager Logic

### When Manager is Auto-Created

The function automatically creates a manager employee record when:

1. **Manager Not Found**: The manager email doesn't exist in the database
2. **Email Domain Check**: The manager email ends with `@jktech.com`
3. **New Record Created** with:
   - `email` = manager email (lowercase)
   - `role` = "Manager"
   - `created_at` = NOW()
   - `updated_at` = NOW()
   - All other fields = NULL (will be populated when manager logs in)

### When Manager is NOT Auto-Created

- Manager email doesn't end with `@jktech.com`
- Function returns error: "Manager not found for email: {email} and cannot be auto-created"

### Example Scenarios

**Scenario 1: Manager exists**
```
Input: managerEmail = "john.doe@jktech.com"
Result: Finds existing manager, returns their ID
```

**Scenario 2: Manager doesn't exist, @jktech.com email**
```
Input: managerEmail = "new.manager@jktech.com"
Result: Creates new employee record with role="Manager", returns new ID
```

**Scenario 3: Manager doesn't exist, non-@jktech.com email**
```
Input: managerEmail = "external@company.com"
Result: Returns error - cannot auto-create
```

---

## Manager Role Update Logic

The function ensures that managers have the correct role:

1. **When Creating New Manager**: Sets `role = "Manager"` directly
2. **When Using Existing Manager**: Updates their role to "Manager" if:
   - Role is NULL, OR
   - Role is not already "Manager"

This ensures that:
- All managers have `role = "Manager"` in the database
- Role is automatically updated when someone becomes a manager
- No unnecessary updates if role is already correct

---

## Request Format

### HTTP Method
`POST`

### Headers
```
Content-Type: application/json
Authorization: Bearer {{sso_token}} (optional unless proxy SSO enforcement is enabled)
```

### Request Body
```json
{
  "email": "employee@example.com",
  "managerEmail": "manager@jktech.com"
}
```

### Required Fields
- `email` - Employee email (will be updated)
- `managerEmail` - Manager email (will be converted to manager_id)

---

## Response Format

### Success Response (200 OK)

```json
{
  "managerEmail": "manager@jktech.com",
  "managerId": 123,
  "message": "Manager updated successfully"
}
```

### Error Responses

#### 400 Bad Request - Missing Required Field
```json
{
  "error": "Missing required field: email"
}
```
or
```json
{
  "error": "Missing required field: managerEmail"
}
```

#### 400 Bad Request - Missing JSON Body
```json
{
  "error": "Missing JSON body"
}
```

#### 404 Not Found - Employee Not Found
```json
{
  "error": "Employee not found for email: employee@example.com"
}
```

#### 404 Not Found - Manager Not Found (and cannot be auto-created)
```json
{
  "error": "Manager not found for email: external@company.com and cannot be auto-created"
}
```

#### 405 Method Not Allowed
```json
{
  "error": "Method not allowed"
}
```

#### 500 Internal Server Error - Database Error
```json
{
  "error": "Database error: <error details>"
}
```

#### 500 Internal Server Error - General Error
```json
{
  "error": "<error message>"
}
```

---

## Error Handling

### Database Errors

1. **SQLAlchemyError**
   - Logs full exception details
   - Returns 500 Internal Server Error
   - Transaction is automatically rolled back by `engine.begin()`

2. **ValueError**
   - Validation errors (missing fields, not found)
   - Returns 404 Not Found
   - Transaction is automatically rolled back

3. **General Exceptions**
   - Logs full exception details
   - Returns 500 Internal Server Error
   - Transaction is automatically rolled back

### Transaction Management

- Uses SQLAlchemy's `engine.begin()` context manager
- Automatically commits on success
- Automatically rolls back on any error
- Ensures all operations are atomic

---

## Database Schema

### Employee Table Structure

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Primary key (auto-increment) |
| `email` | VARCHAR(255) | Employee email (unique, lowercase) |
| `manager_id` | INTEGER | Foreign key to Employee.id (nullable) |
| `role` | VARCHAR(100) | Employee role (nullable, defaults to "User") |
| `emp_id` | VARCHAR(50) | Employee ID (nullable) |
| `name` | VARCHAR(255) | Display name (nullable) |
| `job_title` | VARCHAR(255) | Job title (nullable) |
| `department` | VARCHAR(255) | Department (nullable) |
| `cv_public_url` | TEXT | CV public URL (nullable) |
| `created_at` | TIMESTAMP | Record creation timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |

### Foreign Key Relationship

- `manager_id` → `Employee.id` (self-referencing foreign key)
- `ON UPDATE CASCADE` - If manager's ID changes, all references update
- `ON DELETE SET NULL` - If manager is deleted, manager_id is set to NULL

### Schema Configuration

- Default schema: `skill_matrix_v2_dev` (development)
- Can be overridden via `DB_SCHEMA` environment variable
- Production uses: `skill_matrix_v2_prod` (typically)

---

## CORS Configuration

The function handles CORS for all origins:

### CORS Headers
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization`

### OPTIONS Preflight
- Returns 204 No Content
- Sets `Access-Control-Max-Age: 3600` (1 hour cache)

---

## Usage Examples

### Frontend Call (from AuthContext.jsx)

```javascript
const res = await axios.post(`${BASE_URL}update_manager_email`, {
  email: user.mail || user.userPrincipalName,
  managerEmail: newManagerEmail,
});

if (res.status === 200) {
  toast.success("Manager email updated successfully!");
  // Update local user state
  setUser((prevUser) => ({
    ...prevUser,
    managerEmail: res.data.managerEmail,
  }));
}
```

### cURL Example

```bash
curl -X POST http://127.0.0.1:8091/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -d '{
    "email": "employee@example.com",
    "managerEmail": "manager@jktech.com"
  }'
```

### Python Example

```python
import requests

url = "http://127.0.0.1:8091/"
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer <JWT_TOKEN>"
}
data = {
    "email": "employee@example.com",
    "managerEmail": "manager@jktech.com"
}

response = requests.post(url, json=data, headers=headers)
result = response.json()

if response.status_code == 200:
    print(f"Manager Email: {result['managerEmail']}")
    print(f"Manager ID: {result['managerId']}")
    print(f"Message: {result['message']}")
else:
    print(f"Error: {result['error']}")
```

---

## Local Development

### Running Locally

```bash
cd backend/employee/update_manager_email_v2
functions-framework --target=update_manager_email_v2 --source main.py --debug --port=8091
```

### Testing

The function will be available at: `http://127.0.0.1:8091/`

### Environment Variables Required

```bash
DB_HOST=localhost
DB_USER=your_db_user
DB_PASS=your_db_password
DB_NAME=your_database
DB_PORT=5432
DB_SCHEMA=skill_matrix_v2_dev
```

---

## Deployment

Cloud deployment/IAM belongs in `skill-matrix-deploy`. The function is private and invoked by the frontend Cloud Run runtime service account with `roles/run.invoker`.

### Development Deployment

```bash
gcloud functions deploy dev_update_manager_email_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point update_manager_email_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --no-gen2 \
  --region asia-south1 \
  --set-env-vars ENV=development
```

### Production Deployment

```bash
gcloud functions deploy update_manager_email_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point update_manager_email_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --no-gen2 \
  --region asia-south1 \
  --set-env-vars ENV=production
```

### Cloud Testing

Use the same-origin frontend URL (`{{frontend_base_url}}/update_manager_email_v2` for the v2 route) for browser and normal cloud Postman requests. Send `Authorization: Bearer {{sso_token}}` from app `localStorage.authToken` when end-user identity is needed. Development client paths remain unprefixed; frontend runtime `FUNCTIONS_BASE_URL` ending in `/dev_` performs the upstream mapping.

The proxy adds its Google identity token as `X-Serverless-Authorization` and preserves the SSO JWT in `Authorization`. Direct `*.cloudfunctions.net` diagnostics require a Google identity token whose audience is the exact function URL. Localhost needs no GCP identity token.

---

## Integration Points

### When Called

1. **User Updates Manager Email** - Called from `ProfileModal.jsx` when user edits and saves their manager email
2. **Programmatic Updates** - Can be called from other backend functions if needed

### Dependencies

- **Frontend**: `frontend/src/component/ProfileModal.jsx` - Allows users to update manager email
- **Frontend**: `frontend/src/context/AuthContext.jsx` - Contains `updateManagerEmail()` function
- **Database**: PostgreSQL database with Employee table
- **Utilities**: Uses SQLAlchemy for database operations

### Return Value Usage

The frontend uses the returned values to:
- **managerEmail**: Update the user's manager email in the local state
- **managerId**: Can be used for additional operations if needed

---

## Security Considerations

1. **Email Normalization**: All emails are converted to lowercase to prevent duplicate entries
2. **SQL Injection Prevention**: Uses SQLAlchemy's `text()` with parameterized queries
3. **Transaction Safety**: Uses database transactions to ensure data consistency
4. **Error Handling**: Comprehensive error handling prevents information leakage
5. **CORS**: Properly configured CORS headers for security
6. **Domain Validation**: Only auto-creates managers for `@jktech.com` emails to prevent unauthorized account creation

---

## Logging

The function logs:
- Manager creation: `"Created new manager employee with id={id} and role=Manager for {email}"`
- Manager role update: `"Updated role to 'Manager' for manager_id={id} if needed"`
- Manager update: `"Updated manager_id for {email} to manager_id={id} ({manager_email})"`
- Errors: Full exception stack traces for debugging
- Warnings: When manager not found and cannot be auto-created

---

## Notes

1. **Foreign Key Relationship**: Uses `manager_id` (foreign key) instead of storing manager email as a string, ensuring referential integrity
2. **Auto-Creation**: Only works for `@jktech.com` emails to prevent unauthorized account creation
3. **Role Management**: Automatically sets/updates manager role to "Manager" when they are assigned
4. **Idempotent Operation**: Calling this function multiple times with the same values will update the same record
5. **Email Normalization**: All emails are normalized to lowercase before database operations
6. **Transaction Safety**: All operations are wrapped in a transaction for atomicity

---

## Troubleshooting

### Common Issues

1. **"Manager not found and cannot be auto-created" error**
   - Manager email doesn't exist in database
   - Manager email doesn't end with `@jktech.com`
   - Solution: Ensure manager email is `@jktech.com` or create manager manually first

2. **"Employee not found" error**
   - Employee email doesn't exist in database
   - Solution: Ensure employee exists (they should have logged in at least once)

3. **Database connection errors**
   - Verify database credentials in environment variables
   - Check database server is running and accessible
   - Verify network connectivity

4. **Role not updating**
   - Check if manager_id is being set correctly
   - Verify the UPDATE query is executing (check logs)
   - Ensure role column exists in database

5. **Auto-creation not working**
   - Verify email ends with `@jktech.com` (case-insensitive)
   - Check database permissions for INSERT operations
   - Review logs for any SQL errors

---

## Related Functions

- `save_employee_v2` - Saves/updates employee data (called on login)
- `get_employee_skill_v2` - Retrieves employee skills (uses employee email)

---

## Version History

- **v2**: Current version with SQLAlchemy, auto-create manager, and role update features
- **v1**: Original version (deprecated)

---

## Future Enhancements

Potential improvements:
1. Add validation to prevent circular manager relationships
2. Add support for bulk manager updates
3. Add audit logging for manager relationship changes
4. Add notification system when manager is auto-created
5. Add support for manager hierarchy (multiple levels)
6. Add validation to prevent setting yourself as your own manager (currently handled in frontend)

---

## Example Scenarios

### Scenario 1: Update Manager (Manager Exists)

**Request**:
```json
{
  "email": "employee@jktech.com",
  "managerEmail": "existing.manager@jktech.com"
}
```

**Process**:
1. Finds existing manager → gets their ID
2. Updates manager's role to "Manager" (if needed)
3. Updates employee's manager_id
4. Returns success

**Response**:
```json
{
  "managerEmail": "existing.manager@jktech.com",
  "managerId": 45,
  "message": "Manager updated successfully"
}
```

### Scenario 2: Update Manager (Auto-Create)

**Request**:
```json
{
  "email": "employee@jktech.com",
  "managerEmail": "new.manager@jktech.com"
}
```

**Process**:
1. Manager not found → checks `@jktech.com` → yes
2. Creates new employee record:
   - email = "new.manager@jktech.com"
   - role = "Manager"
   - Other fields = NULL
3. Gets new manager ID
4. Updates employee's manager_id
5. Returns success

**Response**:
```json
{
  "managerEmail": "new.manager@jktech.com",
  "managerId": 123,
  "message": "Manager updated successfully"
}
```

### Scenario 3: Update Manager (Cannot Auto-Create)

**Request**:
```json
{
  "email": "employee@jktech.com",
  "managerEmail": "external@company.com"
}
```

**Process**:
1. Manager not found → checks `@jktech.com` → no
2. Returns error

**Response** (404):
```json
{
  "error": "Manager not found for email: external@company.com and cannot be auto-created"
}
```
