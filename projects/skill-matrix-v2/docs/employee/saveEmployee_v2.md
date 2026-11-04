# save_employee_v2 Function Documentation

## Overview

`save_employee_v2` is a Google Cloud Function that saves or updates employee details in the Employee table. It is automatically called when an employee logs into the Skill Matrix application to ensure their information is up-to-date in the database.

**Location**: `backend/employee/saveEmployee_v2/main.py`

**Trigger**: HTTP POST request

**Port (Local Development)**: 8090 (as per `BACKEND_PORTS.md`)

## Cloud access and authentication

The deployed function is private behind IAM. Use `{{frontend_base_url}}/save_employee_v2` for cloud tests and optionally send `Authorization: Bearer {{sso_token}}`. The token is required only when `REQUIRE_SSO_JWT=true` is enabled on the frontend proxy. Direct `cloudfunctions.net` calls are admin diagnostics only and require a Google identity token.

---

## Purpose

This function serves as a synchronization mechanism between the authentication system (Azure AD/SSO) and the application database. When a user logs in:

1. The frontend receives user profile data from the JWT token
2. The frontend calls `save_employee_v2` to persist this data
3. The function either creates a new employee record or updates an existing one
4. The function returns the employee's manager email, CV URL, role, and manager status

---

## Function Flow

### Entry Point: `save_employee_v2(request: Request)`

The main Cloud Function handler that processes HTTP requests.

#### 1. CORS Handling
- Handles OPTIONS preflight requests
- Sets appropriate CORS headers for local development and production
- Allows localhost:5173, 127.0.0.1:5173, localhost:3000, and 127.0.0.1:3000 for development
- Uses `*` for production origins

#### 2. Request Validation
- Validates that the request method is POST
- Extracts and validates required fields:
  - `employeeId` (required)
  - `userPrincipalName` (required) - This is the email field from Azure AD
  - `displayName` (required)
- Extracts optional fields:
  - `jobTitle` (optional)
  - `department` (optional)

#### 3. Data Processing
- Normalizes email to lowercase
- Calls `save_employee_details()` to perform database operations

#### 4. Response
- Returns JSON response with manager email, CV URL, role, and isManager
- Handles errors with appropriate HTTP status codes

---

## Core Function: `save_employee_details()`

This function performs the actual database operations.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `employee_id` | str | Yes | Employee ID (maps to `empid` column) |
| `email` | str | Yes | Employee email (unique identifier, normalized to lowercase) |
| `name` | str | Yes | Employee display name |
| `job_title` | str | Optional | Job title (maps to `jobtitle` column) |
| `department` | str | Optional | Department name |

### Database Operations

#### 1. Check if Employee Exists
```sql
SELECT *
FROM {schema}.Employee
WHERE LOWER(email) = LOWER(%s)
```

#### 2. Manager Check (isManager)
If the employee exists, the function checks if they are a manager:
- Gets the employee's database `id`
- Checks if any other employee has this `id` as their `manager_id`

```sql
SELECT 1
FROM {schema}.Employee
WHERE manager_id = %s
LIMIT 1
```

**Logic**:
- If any employee has this user's `id` as their `manager_id`, then `isManager = True`
- Otherwise, `isManager = False`
- For new employees (who don't exist yet), `isManager = False`

#### 3. If Employee Exists → UPDATE
Updates the following fields:
- `empid` - Employee ID
- `name` - Display name
- `jobtitle` - Job title
- `department` - Department
- `updated_at` - Timestamp (automatically set to NOW())

```sql
UPDATE {schema}.Employee
SET empid = %s,
    name = %s,
    jobtitle = %s,
    department = %s,
    updated_at = NOW()
WHERE LOWER(email) = LOWER(%s)
```

**Returns**:
- `managerEmail` - Manager's email (from existing record)
- `cvPublicUrl` - CV URL (from existing record)
- `role` - Employee role (from existing record, defaults to "User")
- `isManager` - Boolean indicating if user is a manager
- `message` - "Employee details updated successfully"

#### 4. If Employee Doesn't Exist → INSERT
Creates a new employee record with:
- `empid` - Employee ID
- `email` - Email (lowercase)
- `name` - Display name
- `jobtitle` - Job title (can be NULL)
- `department` - Department (can be NULL)
- `created_at` - Timestamp (automatically set to NOW())
- `updated_at` - Timestamp (automatically set to NOW())

```sql
INSERT INTO {schema}.Employee
    (empid, email, name, jobtitle, department, created_at, updated_at)
VALUES (%s, %s, %s, %s, %s, NOW(), NOW())
```

**Returns**:
- `managerEmail` - Empty string (new employee has no manager yet)
- `cvPublicUrl` - Empty string (new employee has no CV yet)
- `role` - "User" (default role for new employees)
- `isManager` - False (new employees are not managers)
- `message` - "Employee created successfully"

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
  "employeeId": "EMP001",
  "userPrincipalName": "john.doe@company.com",
  "displayName": "John Doe",
  "jobTitle": "Software Engineer",
  "department": "Engineering"
}
```

### Required Fields
- `employeeId` - Employee ID string
- `userPrincipalName` - Employee email (from Azure AD)
- `displayName` - Employee's display name

### Optional Fields
- `jobTitle` - Employee's job title
- `department` - Employee's department

---

## Response Format

### Success Response (200 OK)

**For Existing Employee (Updated)**:
```json
{
  "managerEmail": "manager@company.com",
  "cvPublicUrl": "https://storage.googleapis.com/bucket/cv.pdf",
  "role": "Admin",
  "isManager": true,
  "message": "Employee details updated successfully"
}
```

**For New Employee (Created)**:
```json
{
  "managerEmail": "",
  "cvPublicUrl": "",
  "role": "User",
  "isManager": false,
  "message": "Employee created successfully"
}
```

### Error Responses

#### 400 Bad Request - Missing Required Field
```json
{
  "error": "Missing required field: employeeId"
}
```
or
```json
{
  "error": "Missing required field: userPrincipalName"
}
```
or
```json
{
  "error": "Missing required field: displayName"
}
```

#### 400 Bad Request - Validation Error
```json
{
  "error": "Email test@example.com already exists"
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

1. **IntegrityError** (Unique Constraint Violation)
   - Handles duplicate email violations
   - Returns 400 Bad Request with descriptive error message
   - Rolls back transaction

2. **General Database Errors**
   - Logs exception details
   - Returns 500 Internal Server Error
   - Rolls back transaction

3. **General Exceptions**
   - Logs exception details
   - Returns 500 Internal Server Error

### Transaction Management

- Uses database transactions with `conn.autocommit = False`
- Commits on successful operations
- Rolls back on any error
- Ensures data consistency

---

## Database Schema

### Employee Table Structure

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Primary key (auto-increment) |
| `empid` | VARCHAR | Employee ID |
| `email` | VARCHAR | Employee email (unique, lowercase) |
| `name` | VARCHAR | Display name |
| `jobtitle` | VARCHAR | Job title (nullable) |
| `department` | VARCHAR | Department (nullable) |
| `manager_id` | INTEGER | Foreign key to Employee.id (nullable) |
| `manageremail` | VARCHAR | Manager's email (nullable) |
| `cvpublicurl` | VARCHAR | CV public URL (nullable) |
| `role` | VARCHAR | Employee role (nullable, defaults to "User") |
| `created_at` | TIMESTAMP | Record creation timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |

### Schema Configuration

- Default schema: `skill_matrix_v2_dev` (development)
- Can be overridden via `DB_SCHEMA` environment variable
- Production uses: `skill_matrix_v2_prod` (typically)

---

## Manager Check Logic

The function determines if a user is a manager by checking the database relationship:

1. **For Existing Employees**:
   - Retrieves the employee's database `id` from the existing record
   - Queries if any other employee has this `id` as their `manager_id`
   - Sets `isManager = True` if found, `False` otherwise

2. **For New Employees**:
   - `isManager` is always `False` (they don't have an ID yet and can't be a manager)

**Why use `id` and `manager_id`?**
- Uses proper foreign key relationship
- More efficient (integer comparison vs string comparison)
- More accurate (matches the database schema design)
- Prevents issues with email case sensitivity

---

## CORS Configuration

The function handles CORS for both development and production:

### Development Origins (Allowed)
- `http://localhost:5173`
- `http://127.0.0.1:5173`
- `http://localhost:3000`
- `http://127.0.0.1:3000`

### Production
- Uses `Access-Control-Allow-Origin: *` for all other origins

### CORS Headers
- `Access-Control-Allow-Origin`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization`
- `Access-Control-Allow-Credentials: true` (development only)

---

## Usage Examples

### Frontend Call (from AuthContext.jsx)

```javascript
const managerResponse = await axios.post(
  `${BASE_URL}save_employee_v2`,
  {
    employeeId: profile.employeeId,
    userPrincipalName: profile.userPrincipalName,
    displayName: profile.displayName,
    jobTitle: profile.jobTitle,
    department: profile.department
  },
  {
    headers: { "Content-Type": "application/json" },
    timeout: 10000
  }
);

if (managerResponse.data) {
  mappedProfile.managerEmail = managerResponse.data.managerEmail;
  mappedProfile.cvUrl = managerResponse.data.cvPublicUrl;
  mappedProfile.role = managerResponse.data.role;
  mappedProfile.isManager = managerResponse.data.isManager;
}
```

### cURL Example

```bash
curl -X POST http://127.0.0.1:8090/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -d '{
    "employeeId": "EMP001",
    "userPrincipalName": "test@example.com",
    "displayName": "Test User",
    "jobTitle": "Software Engineer",
    "department": "Engineering"
  }'
```

### Python Example

```python
import requests

url = "http://127.0.0.1:8090/"
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer <JWT_TOKEN>"
}
data = {
    "employeeId": "EMP001",
    "userPrincipalName": "test@example.com",
    "displayName": "Test User",
    "jobTitle": "Software Engineer",
    "department": "Engineering"
}

response = requests.post(url, json=data, headers=headers)
result = response.json()
print(f"Manager: {result['managerEmail']}")
print(f"Role: {result['role']}")
print(f"Is Manager: {result['isManager']}")
```

---

## Local Development

### Running Locally

```bash
cd backend/employee/saveEmployee_v2
functions-framework --target=save_employee_v2 --source main.py --debug --port=8090
```

### Testing

The function will be available at: `http://127.0.0.1:8090/`

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
gcloud functions deploy dev_save_employee_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point save_employee_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --no-gen2 \
  --region asia-south1 \
  --set-env-vars ENV=development
```

### Production Deployment

```bash
gcloud functions deploy save_employee_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point save_employee_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --no-gen2 \
  --region asia-south1 \
  --set-env-vars ENV=production
```

### Cloud Testing

Use the same-origin frontend URL (`{{frontend_base_url}}/save_employee_v2` for the v2 route) for browser and normal cloud Postman requests. Send `Authorization: Bearer {{sso_token}}` using the Microsoft SSO token from app `localStorage.authToken`. Development client paths stay unprefixed; frontend runtime `FUNCTIONS_BASE_URL` ending in `/dev_` performs the upstream mapping.

The proxy adds its Google identity token as `X-Serverless-Authorization` and preserves the SSO JWT in `Authorization`. Direct `*.cloudfunctions.net` diagnostics require a Google identity token whose audience is the exact function URL. Localhost needs no GCP identity token.

---

## Integration Points

### When Called

1. **On User Login** - Automatically called by `AuthContext.jsx` after successful SSO authentication
2. **On Token Refresh** - Called when app detects existing token in localStorage

### Dependencies

- **Frontend**: `frontend/src/context/AuthContext.jsx` - Calls this function after login
- **Database**: PostgreSQL database with Employee table
- **Utilities**: `db_utils.py` - Database connection management

### Return Value Usage

The frontend uses the returned values to:
- **managerEmail**: Populate the user profile with manager information, used for skill/certificate approval workflows
- **cvPublicUrl**: Display CV link in the profile modal
- **role**: Determine user permissions and access levels
- **isManager**: Identify if user can approve/review employee requests

---

## Security Considerations

1. **Email Normalization**: All emails are converted to lowercase to prevent duplicate entries
2. **SQL Injection Prevention**: Uses parameterized queries with `psycopg2.sql.SQL`
3. **Transaction Safety**: Uses database transactions to ensure data consistency
4. **Error Handling**: Comprehensive error handling prevents information leakage
5. **CORS**: Properly configured CORS headers for security

---

## Logging

The function logs:
- Employee creation: `"Created new employee {email}"`
- Employee updates: `"Updated employee {email}"`
- Errors: Full exception stack traces for debugging

---

## Notes

1. **Idempotent Operation**: Calling this function multiple times with the same email will update the existing record, not create duplicates
2. **Email as Unique Identifier**: Email is used as the primary lookup key (case-insensitive)
3. **Manager Email & CV URL**: These fields are not updated by this function - they are only returned if they exist
4. **Role Field**: Retrieved from database, defaults to "User" if not set
5. **Manager Check**: Only performed for existing employees (new employees can't be managers)
6. **Optional Fields**: `jobTitle` and `department` can be NULL in the database
7. **Timestamp Management**: `created_at` and `updated_at` are automatically managed by the database

---

## Troubleshooting

### Common Issues

1. **"Missing required field" error**
   - Ensure all required fields (`employeeId`, `userPrincipalName`, `displayName`) are provided
   - Check that the request body is valid JSON

2. **"Email already exists" error**
   - This should not occur in normal operation (function updates existing records)
   - May indicate a database constraint issue

3. **Database connection errors**
   - Verify database credentials in environment variables
   - Check database server is running and accessible
   - Verify network connectivity

4. **CORS errors**
   - Ensure the origin is in the allowed list for development
   - Check that CORS headers are being set correctly

5. **isManager always returns false**
   - Verify that the employee has a valid `id` in the database
   - Check that other employees have this user's `id` as their `manager_id`
   - Ensure the database schema has the `manager_id` foreign key relationship

---

## Related Functions

- `update_manager_email_v2` - Updates manager email for an employee
- `get_employee_skill_v2` - Retrieves employee skills (uses employee email)

---

## Version History

- **v2**: Current version with manager check (isManager), role field, and improved error handling
- **v1**: Original version (deprecated)

---

## Future Enhancements

Potential improvements:
1. Add support for updating manager email and CV URL from Azure AD
2. Add validation for email format
3. Add support for additional employee fields from Azure AD
4. Add audit logging for employee data changes
5. Add support for bulk employee updates
6. Add caching for manager check to improve performance
