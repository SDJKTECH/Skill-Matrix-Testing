# review_skill_request_v2 Function Documentation

## Overview

`review_skill_request_v2` is a Google Cloud Function that allows managers to review (approve or reject) employee skill requests. It updates the approval status, level, and reviewer information for one or more skill requests in a single transaction. This function is part of the manager approval workflow for L3 (expert-level) skill requests.

**Location**: `backend/skills/reviewSkillRequest_v2/main.py`

**Trigger**: HTTP POST request

**Port (Local Development)**: 8084 (as per `vite.config.js`)

**Database Library**: SQLAlchemy ORM

---

## Purpose

This function enables the manager approval workflow for employee skill requests:

1. **Manager Review**: Allows managers to approve or reject pending skill requests from their subordinates
2. **Bulk Operations**: Supports reviewing multiple skills in a single request
3. **Status Updates**: Updates approval status, skill level, and reviewer information
4. **Audit Trail**: Records who reviewed the skill and when (`reviewed_by`, `reviewed_at`)

**Key Features**:
- Uses `reviewed_by` (employee_id) instead of email for reviewer tracking
- No authorization checks (frontend handles manager validation)
- Supports bulk approval/rejection of multiple skills
- Automatically sets skill level based on action (L3 for approve, L2 for reject)
- Requires rejection reason when rejecting skills

---

## Function Flow

### Entry Point: `review_skill_request_v2(request: Request)`

The main Cloud Function handler that processes HTTP requests.

#### 1. CORS Handling
- Handles OPTIONS preflight requests
- Sets CORS headers for all origins (`*`)
- Allows `POST` and `OPTIONS` methods
- Includes `Authorization` header in allowed headers

#### 2. Request Validation
- Validates JSON body is present
- Validates required fields: `reviewedByEmployeeId`, `action`, `skills`
- Validates `reviewedByEmployeeId` is a valid integer
- Validates `action` is either "approve" or "reject"
- Validates `reason` is provided when `action` is "reject"
- Validates at least one skill ID is provided

#### 3. Database Operations
- Fetches existing skill records to verify they exist
- Prepares update data for each skill
- Updates each skill record in a transaction:
  - Sets `approval_status` (Approved/Rejected)
  - Sets `level_selected` (L3 for approve, L2 for reject)
  - Sets `rejection_reason` (if rejecting)
  - Sets `reviewed_by` (employee_id of reviewer)
  - Sets `reviewed_at` (current timestamp)

#### 4. Response
- Returns success message with count of reviewed skills
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

---

## API Specification

### Endpoint

**URL**: `/review_skill_request_v2`

**Method**: `POST`

**Authentication**: Optional (JWT token in Authorization header, but function doesn't validate it - frontend handles authorization)

### Request

**Headers**:
- `Content-Type`: `application/json`
- `Authorization`: `Bearer <token>` (optional, for frontend consistency)

**Request Body**:
```json
{
  "reviewedByEmployeeId": 123,
  "action": "approve",
  "reason": null,
  "skills": [
    {"empSkillId": 456},
    {"empSkillId": 789}
  ]
}
```

**Request Fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `reviewedByEmployeeId` | integer | Yes | Employee ID of the manager reviewing the skills |
| `action` | string | Yes | Action to take: `"approve"` or `"reject"` |
| `reason` | string | Yes (if reject) | Rejection reason (required when `action` is `"reject"`) |
| `skills` | array | Yes | Array of skill objects, each containing `empSkillId` |

**Skill Object Structure**:
```json
{
  "empSkillId": <integer>  // ID from employee_skills table
}
```

### Response

#### Success Response (200 OK)

**Content-Type**: `application/json`

```json
{
  "message": "2 skills approved successfully"
}
```

**Response Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `message` | string | Success message indicating how many skills were reviewed |

#### Error Responses

**400 Bad Request** - Missing or invalid fields:
```json
{
  "error": "Missing required fields: reviewedByEmployeeId, action, or skills"
}
```

**400 Bad Request** - Invalid action:
```json
{
  "error": "Invalid action. Must be 'approve' or 'reject'."
}
```

**400 Bad Request** - Missing rejection reason:
```json
{
  "error": "Rejection reason required for rejection"
}
```

**404 Not Found** - No matching skills:
```json
{
  "error": "No matching skills found"
}
```

**405 Method Not Allowed** - Wrong HTTP method:
```json
{
  "error": "Method not allowed"
}
```

**500 Internal Server Error** - Database or unexpected error:
```json
{
  "error": "Error message describing what went wrong"
}
```

---

## Database Schema

### Tables Used

#### `employee_skills`
Main table that stores employee skill records.

**Key Columns Updated**:
- `id` - Primary key (used to identify skills to update)
- `approval_status` - Updated to "Approved" or "Rejected"
- `level_selected` - Updated to "L3" (approve) or "L2" (reject)
- `rejection_reason` - Set when rejecting (NULL when approving)
- `reviewed_by` - Employee ID of the reviewer (foreign key to `employee.id`)
- `reviewed_at` - Timestamp when review was completed

**Database Query**:
```sql
-- Fetch existing skills
SELECT id, approval_status 
FROM "{schema}".employee_skills 
WHERE id = ANY(:ids)

-- Update skills
UPDATE "{schema}".employee_skills
SET 
    approval_status = :status,
    rejection_reason = :reason,
    level_selected = :level,
    reviewed_by = :reviewed_by,
    reviewed_at = NOW()
WHERE id = :skillId
```

### Relationships

```
employee_skills
├── employee_id → employee.id (employee who owns the skill)
└── reviewed_by → employee.id (manager who reviewed the skill)
```

---

## Business Logic

### Approval Flow

1. **Employee Submits Skill**: Employee adds a skill with level L3, status becomes "Pending"
2. **Manager Reviews**: Manager views pending requests via `getPendingSkillRequest_v2`
3. **Manager Approves/Rejects**: Manager calls `review_skill_request_v2` with action
4. **Status Updated**: 
   - If approved: `approval_status = "Approved"`, `level_selected = "L3"`, `reviewed_by` set
   - If rejected: `approval_status = "Rejected"`, `level_selected = "L2"`, `rejection_reason` set, `reviewed_by` set

### Level Logic

- **Approve**: Sets `level_selected = "L3"` (expert level confirmed)
- **Reject**: Sets `level_selected = "L2"` (downgrades from L3 to L2)

### Authorization

**Important**: This function does NOT perform authorization checks. The frontend is responsible for:
- Verifying the user is a manager (`isManager = true`)
- Verifying the manager is authorized to review the specific employees' skills
- Only showing pending requests for the manager's subordinates

The backend simply records the `reviewed_by` employee_id without validation.

---

## Frontend Integration

### Usage in Frontend

This function is called from `SkillContext.jsx` when a manager reviews skill requests:

```javascript
// frontend/src/context/SkillContext.jsx
const reviewSkill = async (skillIds, reviewedByEmployeeId, action, reason) => {
  const payload = {
    reviewedByEmployeeId,
    action,
    reason: action === "reject" ? reason || "No reason provided" : null,
    skills: skillIds.map((id) => ({ empSkillId: id })),
  };

  const res = await axios.post(`${BASE_URL}review_skill_request_v2`, payload);
  
  // Optimistic UI update
  setRequestData((prev) =>
    prev.map((emp) => ({
      ...emp,
      skills: emp.skills?.map((sk) =>
        skillIds.includes(sk.skillId)
          ? {
              ...sk,
              Status: action === "approve" ? "Approved" : "Rejected",
              RejectReason: action === "reject" ? reason : null,
              Level: action === "approve" ? "L3" : "L2",
            }
          : sk
      ),
    }))
  );
};
```

### Frontend Components Using This Function

1. **SkillRequestList**: Displays pending skill requests and allows managers to approve/reject
2. **SkillContext**: Provides the `reviewSkill` function to components

### Data Flow

```
Frontend (SkillRequestList)
  ↓ User clicks Approve/Reject
Frontend (SkillContext.reviewSkill)
  ↓ POST /review_skill_request_v2
Backend (review_skill_request_v2)
  ↓ Update Database
Database (employee_skills)
  ↓ Return Success
Backend (JSON response)
  ↓ Response
Frontend (Optimistic UI update)
  ↓ Display Updated Status
UI (SkillRequestList)
```

---

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DB_HOST` | Database host address | `localhost` or `10.0.0.1` |
| `DB_USER` | Database username | `postgres` |
| `DB_PASS` | Database password | `your_password` |
| `DB_NAME` | Database name | `skill_matrix_db` |
| `DB_PORT` | Database port (optional, default: 5432) | `5432` |
| `DB_SCHEMA` | Database schema name (optional, default: `skill_matrix_v2_dev`) | `skill_matrix_v2_prod` |

### Environment-Specific Values

**Development**:
- `DB_SCHEMA`: `skill_matrix_v2_dev`
- `ENV`: `development`

**Production**:
- `DB_SCHEMA`: `skill_matrix_v2_prod` (or your production schema)
- `ENV`: `production`

---

## Error Handling

### Error Types

1. **ValueError**: Invalid `reviewedByEmployeeId` (not an integer)
   - **Status**: 400
   - **Message**: "Invalid reviewedByEmployeeId. Must be a valid integer."

2. **Missing Fields**: Required fields not provided
   - **Status**: 400
   - **Message**: "Missing required fields: reviewedByEmployeeId, action, or skills"

3. **Invalid Action**: Action is not "approve" or "reject"
   - **Status**: 400
   - **Message**: "Invalid action. Must be 'approve' or 'reject'."

4. **Missing Rejection Reason**: Rejecting without reason
   - **Status**: 400
   - **Message**: "Rejection reason required for rejection"

5. **No Skills Found**: Skill IDs don't exist in database
   - **Status**: 404
   - **Message**: "No matching skills found"

6. **SQLAlchemyError**: Database connection or query errors
   - **Status**: 500
   - **Message**: SQLAlchemy error message

7. **Exception**: Unexpected errors
   - **Status**: 500
   - **Message**: Exception error message

### Error Response Format

All errors return:
```json
{
  "error": "Error message"
}
```

### Logging

- All errors are logged using `logger.exception()` with context
- Success operations are logged with `logger.info()` including action, reviewer, and count
- Logs include full stack traces for debugging

---

## Deployment

Cloud deployment/IAM belongs in `skill-matrix-deploy`. The function is private and invoked by the frontend Cloud Run runtime service account with `roles/run.invoker`.

### Production Deployment

```bash
gcloud functions deploy review_skill_request_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point review_skill_request_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --no-gen2 \
  --region asia-south1 \
  --set-env-vars ENV=production
```

### Development Deployment

```bash
gcloud functions deploy dev_review_skill_request_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point review_skill_request_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --no-gen2 \
  --region asia-south1 \
  --set-env-vars ENV=development
```

### Local Testing

1. **Create `.env` file** in `backend/skills/reviewSkillRequest_v2/`:
   ```env
   DB_HOST=your-database-host
   DB_USER=your-database-username
   DB_PASS=your-database-password
   DB_NAME=your-database-name
   DB_PORT=5432
   DB_SCHEMA=your-schema-name
   ```

2. **Run the function**:
   ```bash
   functions-framework --target=review_skill_request_v2 --source main.py --debug --port=8084
   ```

3. **Test the endpoint**:
   ```bash
   curl -X POST http://127.0.0.1:8084/ \
     -H "Content-Type: application/json" \
     -d '{
       "reviewedByEmployeeId": 123,
       "action": "approve",
       "skills": [{"empSkillId": 456}]
     }'
   ```

---

## Dependencies

### Python Packages

| Package | Version | Purpose |
|---------|---------|---------|
| `sqlalchemy` | 2.0.23 | ORM for database operations |
| `psycopg2-binary` | 2.9.9 | PostgreSQL database driver |
| `flask` | 3.0.0 | Web framework for HTTP handling |
| `functions-framework` | 3.5.0 | Google Cloud Functions framework |
| `python-dotenv` | 1.0.0 | Environment variable management |

### Installation

```bash
pip install -r requirements.txt
```

---

## Testing

### Manual Testing

1. **Test approval**:
   ```bash
   curl -X POST http://localhost:8084/ \
     -H "Content-Type: application/json" \
     -d '{
       "reviewedByEmployeeId": 1,
       "action": "approve",
       "skills": [{"empSkillId": 10}, {"empSkillId": 11}]
     }'
   ```

2. **Test rejection**:
   ```bash
   curl -X POST http://localhost:8084/ \
     -H "Content-Type: application/json" \
     -d '{
       "reviewedByEmployeeId": 1,
       "action": "reject",
       "reason": "Insufficient evidence of expertise",
       "skills": [{"empSkillId": 10}]
     }'
   ```

3. **Test validation errors**:
   ```bash
   # Missing required field
   curl -X POST http://localhost:8084/ \
     -H "Content-Type: application/json" \
     -d '{"action": "approve"}'
   
   # Invalid action
   curl -X POST http://localhost:8084/ \
     -H "Content-Type: application/json" \
     -d '{
       "reviewedByEmployeeId": 1,
       "action": "invalid",
       "skills": [{"empSkillId": 10}]
     }'
   ```

### Expected Behavior

- Updates all specified skills in a single transaction
- Sets appropriate approval status and level based on action
- Records reviewer information and timestamp
- Returns success message with count of reviewed skills
- Handles errors gracefully with appropriate status codes
- All database operations are atomic (all succeed or all fail)

---

## Performance Considerations

### Transaction Management

- Uses `engine.begin()` for automatic transaction management
- All updates are executed within a single transaction
- If any update fails, entire transaction is rolled back
- Ensures data consistency

### Bulk Operations

- Updates are performed individually in a loop (SQLAlchemy limitation)
- All updates are within the same transaction
- Suitable for reviewing multiple skills at once (typically 1-10 skills)

### Scalability

- Function is stateless and can scale horizontally
- Database operations are write-only (no complex queries)
- Suitable for moderate review traffic

---

## Security Considerations

### Authorization

- **No Backend Authorization**: Function does not validate that the reviewer is authorized
- **Frontend Responsibility**: Frontend must ensure only managers can call this function
- **Trust Model**: Backend trusts frontend to send correct `reviewedByEmployeeId`

### Input Validation

- Validates all required fields are present
- Validates `reviewedByEmployeeId` is an integer
- Validates `action` is a valid value
- Validates `reason` is provided for rejections
- Validates skill IDs exist in database

### SQL Injection Prevention

- Uses SQLAlchemy `text()` with parameterized queries
- All user input is passed as parameters, not concatenated into SQL
- Schema name is from environment variable (validated)

### CORS

- Allows all origins (`*`) for CORS
- Includes `Authorization` header in allowed headers
- Cloud invocation is private; business authorization remains handled by the existing frontend/function behavior described above

### Cloud Testing

Use `{{frontend_base_url}}/review_skill_request_v2` for browser and normal cloud Postman requests in both environments. Development remains unprefixed in the client; runtime `FUNCTIONS_BASE_URL` ending in `/dev_` selects the `dev_` upstream. Send `Authorization: Bearer {{sso_token}}` from app `localStorage.authToken` when end-user identity is needed.

The proxy adds its Google identity token as `X-Serverless-Authorization` and preserves the SSO JWT in `Authorization`. Direct `*.cloudfunctions.net` diagnostics require a Google identity token whose audience is the exact function URL. Localhost needs no GCP identity token.

---

## Related Functions

### Related Backend Functions

- **`getPendingSkillRequest_v2`**: Fetches pending skill requests for managers to review
- **`saveEmployeeSkill_v2`**: Creates skill requests (sets status to "Pending" for L3)
- **`getEmployeeSkill_v2`**: Retrieves employee skills (includes approval status)

### Related Frontend Components

- **`SkillRequestList`**: Displays pending requests and triggers reviews
- **`SkillContext`**: Provides `reviewSkill` function to components

---

## Changelog

### Version 2 (Current)

- **Renamed from `review_skill`**: Function and folder renamed to `review_skill_request_v2`
- **Changed to `reviewed_by`**: Uses employee_id instead of email for reviewer tracking
- **Removed Authorization Checks**: Frontend now handles all authorization
- **Migration to SQLAlchemy**: Converted from `psycopg2` to SQLAlchemy ORM
- **Removed Config Files**: Uses environment variables directly
- **Updated CORS**: Added `Authorization` header support
- **Improved Error Handling**: Specific error types and better logging

### Version 1 (Legacy)

- Used `approved_by_email` (varchar) for reviewer tracking
- Performed authorization checks in backend
- Used `psycopg2` directly
- Used config files for database configuration

---

## Troubleshooting

### Common Issues

1. **"No matching skills found"**
   - **Cause**: Skill IDs don't exist in database
   - **Solution**: Verify skill IDs are correct and exist in `employee_skills` table

2. **"Missing required fields"**
   - **Cause**: Request body is missing required fields
   - **Solution**: Ensure `reviewedByEmployeeId`, `action`, and `skills` are all provided

3. **"Invalid reviewedByEmployeeId"**
   - **Cause**: `reviewedByEmployeeId` is not an integer
   - **Solution**: Ensure frontend sends integer value, not string

4. **"Rejection reason required"**
   - **Cause**: Rejecting without providing reason
   - **Solution**: Always provide `reason` field when `action` is "reject"

5. **Database connection errors**
   - **Cause**: Incorrect database credentials or network issues
   - **Solution**: Verify environment variables are set correctly

### Debugging

1. **Check logs**: Cloud Function logs show detailed error messages
2. **Test locally**: Use local testing to debug before deploying
3. **Verify database**: Ensure skills exist and have correct status
4. **Check frontend**: Verify frontend is sending correct data format

---

## Future Enhancements

### Potential Improvements

1. **Email Notifications**: Send email to employee when skill is approved/rejected
2. **Audit Log**: Create separate audit table for review history
3. **Batch Processing**: Optimize bulk updates for large numbers of skills
4. **Partial Updates**: Support updating only specific fields
5. **Review Comments**: Add optional comments field for reviewers
6. **Review History**: Track review history (who reviewed, when, previous status)

---

## Summary

`review_skill_request_v2` is a critical function that enables the manager approval workflow for employee skill requests. It:

- ✅ Updates approval status and skill level based on manager action
- ✅ Records reviewer information using employee_id
- ✅ Supports bulk operations for reviewing multiple skills
- ✅ Uses SQLAlchemy ORM for database operations
- ✅ Handles CORS properly for frontend integration
- ✅ Provides comprehensive error handling
- ✅ Follows v2 function patterns and conventions
- ✅ Relies on frontend for authorization (trust model)

This function is called when managers approve or reject skill requests from the `SkillRequestList` component, completing the skill request workflow.
