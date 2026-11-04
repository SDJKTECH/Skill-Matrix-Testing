# get_employee_skill_v2 Function Documentation

## Overview

`get_employee_skill_v2` is a Google Cloud Function that retrieves all skills associated with an employee by their email address. It returns a structured list of skills with complete hierarchy information, skill levels, and approval status.

**Location**: `backend/skills/getEmployeeSkill_v2/main.py`

**Trigger**: HTTP GET or POST request

**Port (Local Development)**: 8081 (as per `BACKEND_PORTS.md`)

**Database Library**: SQLAlchemy ORM

## Cloud access and authentication

The deployed function is private behind IAM. Use `{{frontend_base_url}}/get_employee_skill_v2` for cloud tests and optionally send `Authorization: Bearer {{sso_token}}`. The token is required only when `REQUIRE_SSO_JWT=true` is enabled on the frontend proxy. Direct `cloudfunctions.net` calls are admin diagnostics only and require a Google identity token.

---

## Purpose

This function serves as the primary read operation for employee skills in the Skill Matrix application. When an employee views their profile or skill matrix:

1. The frontend calls `get_employee_skill_v2` with the employee's email
2. The function queries the database for all skills linked to that employee
3. Returns complete skill information including hierarchy, levels, and approval status
4. The frontend displays this data in tables and allows editing/updating

---

## Function Flow

### Entry Point: `get_employee_skill_v2(request: Request)`

The main Cloud Function handler that processes HTTP requests.

#### 1. CORS Handling
- Handles OPTIONS preflight requests
- Sets CORS headers for all origins (`*`)
- Allows `GET`, `POST`, and `OPTIONS` methods
- Includes `Authorization` header in allowed headers

#### 2. Request Validation
- Validates that the request method is GET or POST
- Extracts email from:
  - POST: JSON body (`{"email": "..."}`)
  - GET: Query parameter (`?email=...`)
- Normalizes email to lowercase
- Validates that email is provided

#### 3. Data Processing
- Calls `fetch_skills_for_email()` to query the database
- Converts datetime objects to ISO format strings
- Returns structured skill data

#### 4. Response
- Returns JSON response with email and skills array
- Handles errors with appropriate HTTP status codes

---

## Core Functions

### `get_db_engine()`

Creates and returns a SQLAlchemy engine using environment variables.

**Returns**: SQLAlchemy engine instance

**Database URL Format**: `postgresql+psycopg2://{user}:{pass}@{host}:{port}/{dbname}`

### `fetch_skills_for_email(email: str) -> List[Dict[str, str]]`

Performs the database query to fetch all skills for an employee.

**Parameters**:
- `email` - Employee email address (normalized to lowercase)

**Returns**: List of dictionaries containing skill data

**Database Query**:
```sql
SELECT 
    shl.id AS skillhierarchy_id,
    shl.domain_id,
    md.domain_name,
    shl.discipline_id,
    mdisc.discipline_name,
    shl.skill_area_id,
    msa.skill_area,
    shl.framework_id,
    mf.framework_name,
    es.level_selected,
    es.approval_status,
    es.rejection_reason,
    shl.created_at,
    shl.updated_at
FROM "{schema}".skill_hierarchy_links shl
JOIN "{schema}".employee_skills es 
    ON es.skill_hierarchy_id = shl.id
JOIN "{schema}".employee e 
    ON e.id = es.employee_id
LEFT JOIN "{schema}".master_domain md 
    ON md.id = shl.domain_id
LEFT JOIN "{schema}".master_discipline mdisc 
    ON mdisc.id = shl.discipline_id
LEFT JOIN "{schema}".master_skill_area msa 
    ON msa.id = shl.skill_area_id
LEFT JOIN "{schema}".master_framework mf 
    ON mf.id = shl.framework_id
WHERE LOWER(e.email) = LOWER(:email)
```

### `cors_response(data, status=200)`

Helper function to add CORS headers to any response.

**Parameters**:
- `data` - Response data (dict)
- `status` - HTTP status code (default: 200)

**Returns**: Flask response with CORS headers

---

## Database Operations

### Query Structure

The function performs a complex join across multiple tables:

1. **Core Tables**:
   - `skill_hierarchy_links` (shl) - Defines skill hierarchy combinations
   - `employee_skills` (es) - Links employees to their skills
   - `employee` (e) - Employee lookup

2. **Master Tables** (for names):
   - `master_domain` (md) - Domain names
   - `master_discipline` (mdisc) - Discipline names
   - `master_skill_area` (msa) - Skill area names
   - `master_framework` (mf) - Framework/Tool names

### Data Retrieved

For each skill, the query returns:

| Field | Source | Description |
|-------|--------|-------------|
| `skillhierarchy_id` | `shl.id` | Primary key - unique identifier for the skill hierarchy entry |
| `domain_id` | `shl.domain_id` | Foreign key to master_domain |
| `domain_name` | `md.domain_name` | Domain name (e.g., "Cloud Computing") |
| `discipline_id` | `shl.discipline_id` | Foreign key to master_discipline |
| `discipline_name` | `mdisc.discipline_name` | Discipline name (e.g., "AWS") |
| `skill_area_id` | `shl.skill_area_id` | Foreign key to master_skill_area |
| `skill_area` | `msa.skill_area` | Skill area name (e.g., "EC2") |
| `framework_id` | `shl.framework_id` | Foreign key to master_framework |
| `framework_name` | `mf.framework_name` | Framework/Tool name (e.g., "Lambda") |
| `level_selected` | `es.level_selected` | Employee's skill level (1=Basic, 2=Intermediate, 3=Expert) |
| `approval_status` | `es.approval_status` | Manager approval status (Pending/Approved/Rejected) |
| `rejection_reason` | `es.rejection_reason` | Reason if rejected (nullable) |
| `created_at` | `shl.created_at` | Skill hierarchy creation timestamp |
| `updated_at` | `shl.updated_at` | Last update timestamp |

---

## Request Format

### HTTP Method
`GET` or `POST`

### Headers
```
Content-Type: application/json (for POST)
Authorization: Bearer {{sso_token}} (optional unless proxy SSO enforcement is enabled)
```

### GET Request
```
GET /get_employee_skill_v2?email=employee@example.com
```

### POST Request Body
```json
{
  "email": "employee@example.com"
}
```

### Required Fields
- `email` - Employee email address (will be normalized to lowercase)

---

## Response Format

### Success Response (200 OK)

```json
{
  "email": "employee@example.com",
  "skills": [
    {
      "skillhierarchy_id": 123,
      "domain_id": 1,
      "domain_name": "Cloud Computing",
      "discipline_id": 5,
      "discipline_name": "AWS",
      "skill_area_id": 10,
      "skill_area": "EC2",
      "framework_id": 20,
      "framework_name": "Lambda",
      "level_selected": 2,
      "approval_status": "Approved",
      "rejection_reason": null,
      "created_at": "2024-01-15T10:30:00",
      "updated_at": "2024-01-20T14:45:00"
    },
    {
      "skillhierarchy_id": 124,
      "domain_id": 2,
      "domain_name": "Frontend Development",
      "discipline_id": 8,
      "discipline_name": "UI Frameworks",
      "skill_area_id": 15,
      "skill_area": "Component-based UI",
      "framework_id": 25,
      "framework_name": "React",
      "level_selected": 3,
      "approval_status": "Pending",
      "rejection_reason": null,
      "created_at": "2024-01-16T09:15:00",
      "updated_at": "2024-01-16T09:15:00"
    }
  ]
}
```

**Note**: If employee has no skills, returns empty array:
```json
{
  "email": "employee@example.com",
  "skills": []
}
```

### Error Responses

#### 400 Bad Request - Missing Email
```json
{
  "error": "Missing required field: email"
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
   - Includes error message in response

2. **General Exceptions**
   - Logs full exception details
   - Returns 500 Internal Server Error
   - Includes error message in response

### Transaction Management

- Uses SQLAlchemy's `engine.connect()` context manager
- Read-only operation (no transactions needed)
- Connection is automatically closed after query

---

## Database Schema

### Tables Used

#### skill_hierarchy_links
| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Primary key (returned as `skillhierarchy_id`) |
| `domain_id` | INTEGER | Foreign key to master_domain |
| `discipline_id` | INTEGER | Foreign key to master_discipline |
| `skill_area_id` | INTEGER | Foreign key to master_skill_area |
| `framework_id` | INTEGER | Foreign key to master_framework |
| `created_at` | TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |

#### employee_skills
| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Primary key |
| `employee_id` | INTEGER | Foreign key to employee |
| `skill_hierarchy_id` | INTEGER | Foreign key to skill_hierarchy_links |
| `level_selected` | INTEGER | Skill level (1, 2, or 3) |
| `approval_status` | VARCHAR | Status (Pending/Approved/Rejected) |
| `rejection_reason` | TEXT | Rejection reason (nullable) |

#### employee
| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Primary key |
| `email` | VARCHAR(255) | Employee email (unique, lowercase) |

#### Master Tables
- `master_domain` - Domain names
- `master_discipline` - Discipline names
- `master_skill_area` - Skill area names
- `master_framework` - Framework/Tool names

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
- Sets appropriate CORS headers

---

## Usage Examples

### Frontend Call (from SkillContext.jsx)

```javascript
const response = await axios.post(`${BASE_URL}get_employee_skill_v2`, {
  email: "employee@example.com"
});

const skills = response.data.skills || [];
// Transform skills for frontend display
const transformedSkills = skills.map((skill) => {
  const level = mapLevelSelectedToLevel(skill.level_selected);
  return {
    ...skill,
    Level: level,
    Status: skill.approval_status || null,
    RejectReason: skill.rejection_reason || null,
  };
});
setEmployeeSkills(transformedSkills);
```

### cURL Example (POST)

```bash
curl -X POST http://127.0.0.1:8081/ \
  -H "Content-Type: application/json" \
  -d '{"email": "employee@example.com"}'
```

### cURL Example (GET)

```bash
curl -X GET "http://127.0.0.1:8081/?email=employee@example.com"
```

### Python Example

```python
import requests

url = "http://127.0.0.1:8081/"
data = {"email": "employee@example.com"}

response = requests.post(url, json=data)
result = response.json()

if response.status_code == 200:
    print(f"Employee: {result['email']}")
    print(f"Number of skills: {len(result['skills'])}")
    for skill in result['skills']:
        print(f"  - {skill['framework_name']}: Level {skill['level_selected']}, Status: {skill['approval_status']}")
else:
    print(f"Error: {result['error']}")
```

---

## Local Development

### Running Locally

```bash
cd backend/skills/getEmployeeSkill_v2
functions-framework --target=get_employee_skill_v2 --source main.py --debug --port=8081
```

### Testing

The function will be available at: `http://127.0.0.1:8081/`

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
gcloud functions deploy dev_get_employee_skill_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point get_employee_skill_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --no-gen2 \
  --region asia-south1 \
  --set-env-vars ENV=development
```

### Production Deployment

```bash
gcloud functions deploy get_employee_skill_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point get_employee_skill_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --no-gen2 \
  --region asia-south1 \
  --set-env-vars ENV=production
```

### Cloud Testing

Use the same-origin frontend URL (`{{frontend_base_url}}/get_employee_skill_v2` for the v2 route) for browser and normal cloud Postman requests. Development client paths remain unprefixed; runtime `FUNCTIONS_BASE_URL` ending in `/dev_` performs the upstream mapping. Send `Authorization: Bearer {{sso_token}}` from app `localStorage.authToken` when end-user identity is needed.

The proxy adds its Google identity token as `X-Serverless-Authorization` and preserves the SSO JWT in `Authorization`. Direct `*.cloudfunctions.net` diagnostics require a Google identity token whose audience is the exact function URL. Localhost needs no GCP identity token.

---

## Integration Points

### When Called

1. **Employee Views Skills** - Called from `EmployeeSkillTable.jsx` when component loads
2. **After Saving Skills** - Called to refresh the skill list after saving
3. **Profile View** - Called to display employee's current skills

### Dependencies

- **Frontend**: `frontend/src/context/SkillContext.jsx` - Contains `fetchEmployeeSkills()` function
- **Frontend**: `frontend/src/component/EmployeeSkillTable.jsx` - Displays employee skills
- **Frontend**: `frontend/src/component/skillDataTable.jsx` - Uses skill data for selection
- **Database**: PostgreSQL database with v2 schema
- **Utilities**: Uses SQLAlchemy for database operations

### Return Value Usage

The frontend uses the returned values to:
- **skillhierarchy_id**: Primary identifier for matching with master skills
- **level_selected**: Converted to L1/L2/L3 format for display
- **approval_status**: Displayed as status badges (Pending/Approved/Rejected)
- **rejection_reason**: Shown when status is Rejected
- **Hierarchy fields**: Displayed in skill tables (Domain → Discipline → Skill Area → Framework)

---

## Security Considerations

1. **Email Normalization**: All emails are converted to lowercase to prevent duplicate entries
2. **SQL Injection Prevention**: Uses SQLAlchemy's `text()` with parameterized queries
3. **Error Handling**: Comprehensive error handling prevents information leakage
4. **CORS**: Properly configured CORS headers for security
5. **Case-Insensitive Matching**: Uses `LOWER()` for email matching to handle case variations

---

## Logging

The function logs:
- Success: `"✅ Loaded {count} skills for employee {email}"`
- Errors: Full exception stack traces for debugging
- Database errors: Specific SQLAlchemy error details

---

## Notes

1. **Empty Results**: Returns empty array if employee has no skills (not an error)
2. **Case-Insensitive**: Email matching is case-insensitive
3. **DateTime Serialization**: All datetime objects are converted to ISO format strings
4. **No hashId**: This function does NOT generate `hashId` - uses `skillhierarchy_id` as the primary identifier
5. **Read-Only**: This is a read-only operation - no data is modified
6. **Multiple Skills**: Returns all skills for an employee, not just one

---

## Troubleshooting

### Common Issues

1. **Empty skills array returned**
   - Employee has no skills in the database
   - Solution: This is normal - employee needs to add skills first

2. **"Missing required field: email" error**
   - Email not provided in request
   - Solution: Ensure email is included in POST body or GET query parameter

3. **Database connection errors**
   - Verify database credentials in environment variables
   - Check database server is running and accessible
   - Verify network connectivity

4. **No data returned but employee exists**
   - Check if employee has any skills in `employee_skills` table
   - Verify `skill_hierarchy_id` foreign key relationships are correct
   - Check if skills are linked to the correct employee_id

5. **Missing hierarchy names**
   - Master tables might not have corresponding records
   - Solution: Ensure master_domain, master_discipline, master_skill_area, and master_framework have the required entries

---

## Related Functions

- `save_employee_skill_v2` - Saves/updates employee skills (write operation)
- `get_skill_hierarchy_link_v2` - Retrieves master skill hierarchy (for skill selection)
- `review_skill` - Manager approval/rejection of skill requests
- `get_pending_skill_request` - Gets pending skill requests for managers

---

## Version History

- **v2**: Current version with SQLAlchemy, environment variables, and snake_case column names
- **v1**: Original version (deprecated)

---

## Future Enhancements

Potential improvements:
1. Add filtering by approval status
2. Add filtering by skill level
3. Add pagination for employees with many skills
4. Add caching for frequently accessed employee skills
5. Add support for skill history/versioning
6. Add support for skill expiration dates
7. Add support for skill certifications linked to skills

---

## Example Scenarios

### Scenario 1: Employee with Multiple Skills

**Request**:
```json
POST /get_employee_skill_v2
{
  "email": "john.doe@jktech.com"
}
```

**Response**:
```json
{
  "email": "john.doe@jktech.com",
  "skills": [
    {
      "skillhierarchy_id": 1,
      "domain_name": "Cloud Computing",
      "discipline_name": "AWS",
      "skill_area": "EC2",
      "framework_name": "Lambda",
      "level_selected": 3,
      "approval_status": "Approved",
      "rejection_reason": null
    },
    {
      "skillhierarchy_id": 2,
      "domain_name": "Frontend Development",
      "discipline_name": "UI Frameworks",
      "skill_area": "Component-based UI",
      "framework_name": "React",
      "level_selected": 2,
      "approval_status": "Pending",
      "rejection_reason": null
    }
  ]
}
```

### Scenario 2: Employee with No Skills

**Request**:
```json
POST /get_employee_skill_v2
{
  "email": "new.employee@jktech.com"
}
```

**Response**:
```json
{
  "email": "new.employee@jktech.com",
  "skills": []
}
```

### Scenario 3: Employee with Rejected Skill

**Request**:
```json
POST /get_employee_skill_v2
{
  "email": "employee@jktech.com"
}
```

**Response**:
```json
{
  "email": "employee@jktech.com",
  "skills": [
    {
      "skillhierarchy_id": 5,
      "domain_name": "Backend Development",
      "discipline_name": "JavaScript Runtime",
      "skill_area": "Server-side development",
      "framework_name": "Node.js",
      "level_selected": 3,
      "approval_status": "Rejected",
      "rejection_reason": "Insufficient evidence of expert-level knowledge"
    }
  ]
}
```

---

## Data Flow Diagram

```
Frontend (EmployeeSkillTable)
    ↓
    POST /get_employee_skill_v2
    ↓
Backend (get_employee_skill_v2)
    ↓
    Query Database
    ├─ employee (find by email)
    ├─ employee_skills (get all skills)
    ├─ skill_hierarchy_links (get hierarchy)
    └─ master_* tables (get names)
    ↓
    Return JSON Response
    ↓
Frontend (Display Skills)
    ├─ Show in table
    ├─ Show approval status
    └─ Allow editing
```

---

## Key Design Decisions

1. **Why skillhierarchy_id instead of hashId?**
   - `skillhierarchy_id` is the database primary key, more efficient
   - Direct foreign key reference
   - Both master and employee skills have it
   - `hashId` was legacy code from old schema

2. **Why return all fields?**
   - Frontend needs complete information for display
   - Includes both IDs (for relationships) and names (for display)
   - Includes approval workflow data

3. **Why support both GET and POST?**
   - GET: Simple query parameter access
   - POST: Consistent with other v2 endpoints
   - Flexibility for different use cases

4. **Why case-insensitive email matching?**
   - Handles email variations (user@example.com vs User@Example.com)
   - Prevents duplicate entries
   - More user-friendly

---

## Performance Considerations

1. **Query Optimization**: Uses JOINs instead of multiple queries
2. **Index Usage**: Relies on database indexes for email lookup
3. **Connection Pooling**: Uses NullPool for Cloud Functions (stateless)
4. **No Caching**: Each request queries database (acceptable for read operations)
5. **Result Size**: Returns all skills at once (consider pagination for large datasets)

---

## Testing Checklist

- [ ] Employee with multiple skills
- [ ] Employee with no skills (empty array)
- [ ] Employee with pending skills
- [ ] Employee with approved skills
- [ ] Employee with rejected skills
- [ ] Case-insensitive email matching
- [ ] Invalid email format
- [ ] Missing email parameter
- [ ] Database connection failure
- [ ] Employee not found (returns empty array, not error)
