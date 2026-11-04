# get_pending_skill_request_v2 Function Documentation

## Overview

`get_pending_skill_request_v2` is a Google Cloud Function that retrieves all pending expert-level (L3) skill requests for employees managed by a specific manager. It is used by managers to view and approve skill requests from their subordinates.

**Location**: `backend/skills/getPendingSkillRequest_v2/main.py`

**Trigger**: HTTP GET request

**Port (Local Development)**: 8083 (as per `BACKEND_PORTS.md`)

**Database Library**: SQLAlchemy ORM (via `db.database.create_database()`)

## Cloud access and authentication

The deployed function is private behind IAM. Use `{{frontend_base_url}}/get_pending_skill_request_v2` for cloud tests and optionally send `Authorization: Bearer {{sso_token}}`. The token is required only when `REQUIRE_SSO_JWT=true` is enabled on the frontend proxy. Direct `cloudfunctions.net` calls are admin diagnostics only and require a Google identity token.

---

## Purpose

This function enables the manager approval workflow for expert-level skills:

1. When an employee adds an L3 (expert-level) skill, it is saved with `approval_status = 'Pending'` and `approved_by_email = NULL`
2. Managers can view all pending L3 skill requests from their direct and indirect reports
3. The function filters skills by:
   - Manager relationship: Only employees where `employee.manager_id = manager.id`
   - Approval status: Only `'Pending'` requests
   - Skill level: Only `'L3'` (expert-level) skills
4. Returns grouped data by employee with their pending L3 skills

---

## Function Flow

### Entry Point: `get_pending_skill_request_v2(request: Request)`

The main Cloud Function handler that processes HTTP requests.

#### 1. CORS Handling
- Handles OPTIONS preflight requests
- Sets CORS headers for all origins (`*`)
- Allows `GET` and `OPTIONS` methods
- Includes `Content-Type` header in allowed headers

#### 2. Request Validation
- Validates that the request method is GET
- Extracts and validates required query parameters:
  - `managerId` (required) - Database employee ID of the manager (from `user.dbEmployeeId`)
  - `isManager` (required) - Boolean flag indicating if user is a manager (from `user.isManager`)
- Validates `managerId` is a valid integer
- Validates `isManager = true` (returns 403 if false)

#### 3. Data Processing
- Uses `manager_id` directly (no email lookup needed)
- Queries database for pending L3 skills of employees managed by this manager
- Groups results by employee and aggregates their skills

#### 4. Response
- Returns JSON array of employees with their pending L3 skills
- Returns empty array `[]` if no pending requests found
- Handles errors with appropriate HTTP status codes

---

## Core Functions

### `cors_response(data, status=200)`

Helper function to add CORS headers to any response.

**Parameters**:
- `data` - Response data (will be JSON-serialized)
- `status` - HTTP status code (default: 200)

**Returns**: Flask response with CORS headers

### `get_pending_skill_request_v2(request: Request)`

Main Cloud Function entry point.

**Parameters**:
- `request` - Flask Request object

**Query Parameters**:
- `managerId` (required) - Integer, database employee ID of the manager
- `isManager` (required) - String "true" or "false", must be "true"

**Returns**: JSON response with array of employees and their pending L3 skills

---

## Database Operations

### Query Logic

The function performs a single complex query that:

1. **Joins multiple tables**:
   - `employee_skills` (es) - Contains skill requests
   - `employee` (e) - Contains employee and manager relationship
   - `skill_hierarchy_links` (shl) - Links to master skill data
   - `master_domain` (md) - Domain names
   - `master_discipline` (mdisc) - Discipline names
   - `master_skill_area` (msa) - Skill area names
   - `master_framework` (mf) - Framework names

2. **Filters by**:
   - `es.approval_status = 'Pending'` - Only pending requests
   - `es.level_selected = 'L3'` - Only expert-level skills
   - `e.manager_id = :manager_id` - Only employees managed by this manager

3. **Groups and aggregates**:
   - Groups by employee (`e.id`, `e.name`)
   - Aggregates skills as JSON array per employee
   - Orders by employee ID

### SQL Query

```sql
SELECT json_agg(
    json_build_object(
        'id', t.id,
        'employee', t.name,
        'skills', t.skills
    )
) AS result
FROM (
    SELECT e.id,
        e.name,
        json_agg(
            json_build_object(
                'Category', md.domain_name,
                'Sub-Category', mdisc.discipline_name,
                'Sub-Sub-Category', msa.skill_area,
                'Tools', mf.framework_name,
                'Level', es.level_selected,
                'skillhierarchy_id', shl.id,
                'status', es.approval_status,
                'skillId', es.id
            )
        ) AS skills
    FROM "{schema}".employee_skills es
    JOIN "{schema}".employee e ON e.id = es.employee_id
    JOIN "{schema}".skill_hierarchy_links shl ON shl.id = es.skill_hierarchy_id
    LEFT JOIN "{schema}".master_domain md ON md.id = shl.domain_id
    LEFT JOIN "{schema}".master_discipline mdisc ON mdisc.id = shl.discipline_id
    LEFT JOIN "{schema}".master_skill_area msa ON msa.id = shl.skill_area_id
    LEFT JOIN "{schema}".master_framework mf ON mf.id = shl.framework_id
    WHERE es.approval_status = 'Pending'
    AND es.level_selected = 'L3'
    AND e.manager_id = :manager_id
    GROUP BY e.id, e.name
    ORDER BY e.id
) t;
```

---

## API Details

### Request

**Method**: `GET`

**URL**: `/get_pending_skill_request_v2`

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `managerId` | integer | Yes | Database employee ID of the manager (from `user.dbEmployeeId`) |
| `isManager` | string | Yes | Must be `"true"` (from `user.isManager`) |

**Example Request**:
```
GET /get_pending_skill_request_v2?managerId=123&isManager=true
```

### Response

**Success Response (200 OK)**:

Returns an array of employee objects, each containing their pending L3 skills:

```json
[
  {
    "id": 456,
    "employee": "John Doe",
    "skills": [
      {
        "Category": "Technology",
        "Sub-Category": "Software Development",
        "Sub-Sub-Category": "Frontend",
        "Tools": "React",
        "Level": "L3",
        "skillhierarchy_id": 789,
        "status": "Pending",
        "skillId": 101
      },
      {
        "Category": "Technology",
        "Sub-Category": "Software Development",
        "Sub-Sub-Category": "Backend",
        "Tools": "Node.js",
        "Level": "L3",
        "skillhierarchy_id": 790,
        "status": "Pending",
        "skillId": 102
      }
    ]
  },
  {
    "id": 457,
    "employee": "Jane Smith",
    "skills": [
      {
        "Category": "Technology",
        "Sub-Category": "Data Science",
        "Sub-Sub-Category": "Machine Learning",
        "Tools": "TensorFlow",
        "Level": "L3",
        "skillhierarchy_id": 791,
        "status": "Pending",
        "skillId": 103
      }
    ]
  }
]
```

**Empty Response (200 OK)**:
```json
[]
```

**Error Responses**:

| Status Code | Error Message | Description |
|-------------|---------------|-------------|
| 400 | `"Missing required query param: managerId"` | `managerId` parameter not provided |
| 400 | `"Invalid managerId. Must be a valid integer."` | `managerId` is not a valid integer |
| 403 | `"User is not a manager. Only managers can view pending requests."` | `isManager` is not `"true"` |
| 405 | `"Method not allowed"` | Request method is not GET |
| 500 | `"Error message"` | Internal server error |

---

## Manager Relationship Logic

### How Manager Status is Determined

1. **Employee logs in** → `saveEmployee_v2` is called
2. **Backend checks** → Queries if any employee has this employee's `id` as their `manager_id`
3. **Returns** → `isManager: true` if found, `false` otherwise
4. **Frontend stores** → `user.isManager` and `user.dbEmployeeId`

### How Pending Requests are Filtered

1. **Manager opens Approve tab** → Frontend calls `get_pending_skill_request_v2`
2. **Backend receives** → `managerId` (from `user.dbEmployeeId`) and `isManager` (from `user.isManager`)
3. **Backend validates** → Ensures `isManager = true`
4. **Backend queries** → Finds all employees where `employee.manager_id = managerId`
5. **Backend filters** → Gets their skills where `approval_status = 'Pending'` and `level_selected = 'L3'`

---

## Frontend Integration

### Usage in SkillContext

```javascript
const fetchEmployeeRequests = async (user) => {
  if (!user?.dbEmployeeId) {
    toast.error("Employee ID is required");
    return;
  }

  if (!user?.isManager) {
    toast.error("Only managers can view pending requests");
    return;
  }

  const res = await axios.get(`${BASE_URL}get_pending_skill_request_v2`, {
    params: { 
      managerId: user.dbEmployeeId,
      isManager: user.isManager 
    },
  });

  setRequestData(res.data);
};
```

### Component Usage

The `SkillRequestList` component uses this function to display pending requests:

```javascript
useEffect(() => {
  if (user) {
    fetchEmployeeRequests(user);
  }
}, [user]);
```

---

## Key Features

### 1. Direct Manager ID Usage
- **No email lookup**: Uses `manager_id` directly from `user.dbEmployeeId`
- **More efficient**: Eliminates unnecessary database query
- **More reliable**: Uses foreign key relationship instead of string matching

### 2. Manager Validation
- **Security**: Validates `isManager = true` before processing
- **Authorization**: Returns 403 if user is not a manager
- **Prevents unauthorized access**: Only managers can view pending requests

### 3. Filtered Results
- **Only pending requests**: Filters by `approval_status = 'Pending'`
- **Only expert-level**: Filters by `level_selected = 'L3'`
- **Only direct reports**: Filters by `employee.manager_id = manager_id`

### 4. Grouped by Employee
- **Organized display**: Groups skills by employee
- **Easy approval**: Managers can see all pending skills per employee
- **Efficient processing**: Allows bulk approval/rejection per employee

---

## Data Flow

### Complete Workflow

1. **Employee adds L3 skill**:
   - `saveEmployeeSkill_v2` is called
   - Skill is saved with `approval_status = 'Pending'` and `approved_by_email = NULL`
   - `level_selected = 'L3'`

2. **Manager views pending requests**:
   - Frontend calls `get_pending_skill_request_v2` with `managerId` and `isManager`
   - Backend queries for pending L3 skills of employees managed by this manager
   - Returns grouped data by employee

3. **Manager approves/rejects**:
   - `reviewSkill_v2` is called
   - Updates `approval_status` to `'Approved'` or `'Rejected'`
   - Sets `approved_by_email` to manager's email
   - Updates `level_selected` (L3 if approved, L2 if rejected)

---

## Environment Variables

The function uses the following environment variables (via `db.database.create_database()`):

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_SCHEMA` | PostgreSQL schema name | `skill_matrix_v2_dev` |
| `ENV` | Environment (development/production) | Used to select config file |

**Note**: Database connection details are loaded from `config.json`, `dev_config.json`, or `prod_config.json` based on `ENV` variable.

---

## Error Handling

### Validation Errors

- **Missing managerId**: Returns 400 with error message
- **Invalid managerId**: Returns 400 if not a valid integer
- **Not a manager**: Returns 403 if `isManager != "true"`
- **Wrong method**: Returns 405 if not GET request

### Database Errors

- **Connection errors**: Logged and returns 500
- **Query errors**: Logged with full exception and returns 500
- **Empty results**: Returns empty array `[]` (not an error)

### Logging

All errors are logged using Python's `logging` module:
```python
logger.exception("❌ Error fetching pending skill requests")
```

---

## Testing

### Local Testing

```bash
functions-framework --target=get_pending_skill_request_v2 --debug --port=8083
```

### Test Request

```bash
curl -X GET "http://localhost:8083/?managerId=123&isManager=true"
```

### Expected Response

```json
[
  {
    "id": 456,
    "employee": "John Doe",
    "skills": [...]
  }
]
```

---

## Deployment

Cloud deployment/IAM belongs in `skill-matrix-deploy`. The function is private and invoked by the frontend Cloud Run runtime service account with `roles/run.invoker`.

### Production Deployment

```bash
gcloud functions deploy get_pending_skill_request_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point get_pending_skill_request_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --no-gen2 \
  --region asia-south1 \
  --set-env-vars ENV=production
```

### Development Deployment

```bash
gcloud functions deploy dev_get_pending_skill_request_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point get_pending_skill_request_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --no-gen2 \
  --region asia-south1 \
  --set-env-vars ENV=development
```

### Cloud Testing

Use `{{frontend_base_url}}/get_pending_skill_request_v2` for browser and normal cloud Postman requests in both environments. Development remains unprefixed in the client; runtime `FUNCTIONS_BASE_URL` ending in `/dev_` selects the `dev_` upstream. Send `Authorization: Bearer {{sso_token}}` from app `localStorage.authToken` when end-user identity is needed. Existing manager checks remain unchanged.

The proxy adds its Google identity token as `X-Serverless-Authorization` and preserves the SSO JWT in `Authorization`. Direct `*.cloudfunctions.net` diagnostics require a Google identity token whose audience is the exact function URL. Localhost needs no GCP identity token.

---

## Related Functions

- **`saveEmployeeSkill_v2`**: Creates pending L3 skill requests
- **`reviewSkill_v2`**: Approves or rejects pending skill requests
- **`saveEmployee_v2`**: Determines manager status and provides `dbEmployeeId` and `isManager`

---

## Notes

1. **Manager ID vs Email**: This function uses `manager_id` (database primary key) directly, not manager email. This is more efficient and reliable than email-based lookups.

2. **Pending Requests Only**: Only returns skills with `approval_status = 'Pending'`. Already approved or rejected skills are not included.

3. **L3 Skills Only**: Only returns expert-level (L3) skills. L1 and L2 skills don't require manager approval.

4. **Manager Relationship**: Uses the `employee.manager_id` foreign key to find direct reports. This ensures data integrity and efficient querying.

5. **Empty Results**: Returns empty array `[]` if no pending requests found. This is not an error condition.

6. **Grouped by Employee**: Results are grouped by employee, making it easy for managers to see all pending requests per employee and process them together.

---

## Changelog

### Version 2 (Current)
- **Changed**: Uses `manager_id` directly instead of email lookup
- **Changed**: Accepts `managerId` and `isManager` query parameters
- **Changed**: Validates manager status before processing
- **Removed**: Email-based manager lookup
- **Improved**: More efficient query using foreign key relationship
- **Improved**: Better security with manager validation

### Version 1 (Legacy)
- Used email-based manager lookup
- Required `email` query parameter
- No manager status validation
