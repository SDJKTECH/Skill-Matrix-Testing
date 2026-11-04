# getCombinedHierarchy_v2 Function Documentation

## Overview

Google Cloud Function that fetches a complete organizational hierarchy for a manager, including all subordinates (multi-level) with their skills, certificates, and trainings. This aggregation function combines data from employee hierarchy, skill hierarchy, certifications, and training records into a single unified tree structure with comprehensive competency summaries.

**Location**: `backend/aggregations/getCombinedHierarchy_v2/main.py`

**Trigger**: HTTP POST request

**Port (Local Development)**: 8110

**Database Library**: SQLAlchemy ORM

---

## Purpose

This function serves as a comprehensive aggregation endpoint for managers to view their entire team's competency data:

1. **Hierarchical View**: Returns a recursive tree structure showing all reportees at all levels
2. **Complete Data**: For each employee (including the manager), includes:
   - Skills organized in a 4-level hierarchy (Domain → Discipline → Skill Area → Framework)
   - All certifications with provider, level, validity, and dates
   - All trainings with modules, batch, status, and comments
3. **Manager Dashboard**: Powers the manager view in the frontend where they can see and manage team competencies
4. **Multi-Level Support**: Handles managers who manage other managers (recursive hierarchy)

---

## Function Flow

### Entry Point: `get_combined_hierarchy_v2(request: Request)`

The main Cloud Function handler that processes HTTP requests.

#### 1. CORS Handling

- Handles OPTIONS preflight requests
- Sets CORS headers for all origins (`*`)
- Allows `GET`, `POST`, and `OPTIONS` methods
- Includes `Authorization` header in allowed headers

#### 2. Request Validation

- Validates that the request method is POST
- Extracts `employeeId` from JSON body
- Validates that employeeId is provided and is a valid integer

#### 3. Manager Data Retrieval

- Fetches manager's basic information (`id`, `emp_id`, `name`, `email`) from the employee table
- Returns 404 if manager not found
- Initializes manager node with empty skills, certifications, trainings, and associates objects
- Initializes `reportee_summary` for unique counts across the team

#### 4. Recursive Hierarchy Building

- Uses PostgreSQL recursive CTE to fetch all reportees at all levels
- Builds a dictionary (`reportee_dict`) of all employees in the hierarchy keyed by `id`
- For each employee via `populate_employee_data()`:
  - Fetches skills hierarchy (4-level nested structure via CTEs)
  - Counts skills at each hierarchy level (domain, discipline, skillArea, framework)
  - Fetches skill proficiency level counts (L1, L2, L3) and approval status (active, pending)
  - Fetches all certifications with provider and date details
  - Fetches most recent certificate for the employee
  - Fetches all trainings with latest comments (Employee, Manager, Department) and completed status
- Recursively builds tree structure via `build_tree()` preserving reporting relationships

#### 5. Role Assignment

- Assigns `"Manager"` role to employees who have direct reports
- Assigns `"Employee"` role to leaf nodes (no direct reports)
- If the requested employee has no reportees, their role is set to `"Employee"` and returned directly

#### 7. Summary Calculation

- Calculates `reportee_summary` containing unique counts of skills, trainings, and certifications across all subordinates
- Dynamic associate arrays are named based on hierarchy level: `associateArray1`, `associateArray2`, etc.
- Manager's direct reportees are in `associateArray1`
- Each subsequent level increments the array number

#### 7. Response

- Returns complete hierarchy tree with manager as root
- Includes counts for skills, certificates, and trainings at each level
- Returns appropriate error messages with status codes for failures

---

## API

### Endpoint

```
POST /get_combined_hierarchy_v2
```

### Request

**Method:** `POST`

**Headers:**

- `Content-Type`: `application/json`
- `Authorization`: (optional, for authenticated requests)

**Request Body:**

```json
{
  "employeeId": 123
}
```

Or, for the Manager Dashboard's Admin-only "View Entire Organization" view:

```json
{
  "root": "organization"
}
```

**Request Fields:**

- `employeeId` (required, integer, unless `root` is `"organization"`): ID of the manager/employee
  whose hierarchy should be fetched
- `root` (optional, string): when set to `"organization"`, `employeeId` is ignored (may be omitted
  entirely) and the root is resolved dynamically instead — `resolve_org_root_id()` picks the
  employee with no manager (`reports_to IS NULL`), tie-broken by direct-report count if more than
  one such row exists (the `reports_to` FK is `ON DELETE SET NULL`, so a deleted manager's orphaned
  reports could otherwise register as additional "roots"). Not a hardcoded id — this keeps
  resolving correctly with zero code changes whenever the real org root changes. Named `root`, not
  `scope` — this app already has an unrelated `scope` concept (Direct Reports vs Entire Team, see
  `ManagerDashboard.jsx`); this flag is a different axis (which employee roots the WHOLE tree, not
  how much of it to include). Frontend gate: `helper/accessRoles.js`'s
  `hasOrgWideViewAccess(role)` (Admin only) — this endpoint itself has no server-side role check on
  either request shape (see Known limitation below).

### Response

**Success (200) - Manager with Reportees:**

```json
{
  "id": 123,
  "empId": "EMP001",
  "name": "John Manager",
  "role": "Manager",
  "email": "john.manager@company.com",
  "skills": {
    "domainCount": 2,
    "disciplineCount": 3,
    "skillAreaCount": 5,
    "frameworkCount": 8,
    "l1Count": 2,
    "l2Count": 4,
    "l3Count": 2,
    "activeSkillsCount": 8,
    "pendingApprovalCount": 1,
    "skillArray": [
      {
        "id": 1,
        "domainName": "Technology",
        "type": "domain",
        "disciplines": [
          {
            "id": 10,
            "disciplineName": "Cloud Computing",
            "type": "discipline",
            "skillAreas": [
              {
                "id": 100,
                "skillArea": "AWS",
                "type": "skillArea",
                "frameworks": [
                  {
                    "id": 1000,
                    "frameworkName": "EC2",
                    "type": "framework",
                    "levelSelected": "Expert",
                    "approvalStatus": "Approved"
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  },
  "certifications": {
    "certificationCount": 2,
    "certificationArray": [
      {
        "mappingId": 50,
        "employeeCertificateId": 501,
        "certName": "AWS Solutions Architect",
        "certProvider": "AWS",
        "certLevel": "Associate",
        "validYears": 3,
        "issuedDate": "2023-01-15",
        "expiryDate": "2026-01-15"
      }
    ],
    "recentCertificateName": "AWS Solutions Architect"
  },
  "trainings": {
    "trainingCount": 1,
    "completedTrainingCount": 1,
    "trainingArray": [
      {
        "employeeTrainingId": 301,
        "employeeId": 123,
        "moduleId": 7,
        "batch": "BATCH-2026-Q1",
        "moduleName": "Cloud Architecture",
        "areaName": "Technology",
        "subAreaName": "Cloud",
        "courseLevel": "Advanced",
        "trainingStatus": "Completed",
        "employeeType": "Existing Lateral",
        "nominatedBy": "Jane Doe",
        "startDate": "2026-01-10",
        "endDate": "2026-03-15",
        "competency": "Cloud",
        "createdAt": "2026-01-02T10:15:00",
        "employeeComment": "Great learning experience",
        "managerComment": "Excellent participation",
        "departmentComment": null
      }
    ]
  },
  "reportee_summary": {
    "totalUniqueSkills": 15,
    "totalUniqueTrainings": 5,
    "totalUniqueCertifications": 3
  },
  "associates": {
    "associateCount": 2,
    "associateArray1": [
      {
        "id": 124,
        "empId": "EMP002",
        "name": "Jane Employee",
        "role": "Employee",
        "email": "jane.employee@company.com",
        "managerEmail": "john.manager@company.com",
        "managerId": 123,
        "level": 1,
        "skills": { "...": "same structure as above" },
        "certifications": { "...": "same structure as above" },
        "trainings": { "...": "same structure as above" },
        "associates": {
          "associateCount": 0,
          "associateArray2": []
        }
      }
    ]
  }
}
```

**Success (200) - Employee with No Reportees:**

```json
{
  "id": 456,
  "empId": "EMP010",
  "name": "Solo Contributor",
  "role": "Employee",
  "email": "solo@company.com",
  "skills": {
    "domainCount": 1,
    "disciplineCount": 2,
    "skillAreaCount": 3,
    "frameworkCount": 5,
    "l1Count": 1,
    "l2Count": 2,
    "l3Count": 2,
    "activeSkillsCount": 5,
    "pendingApprovalCount": 0,
    "skillArray": []
  },
  "certifications": {
    "certificationCount": 1,
    "certificationArray": [],
    "recentCertificateName": "Google Cloud Professional Architect"
  },
  "trainings": {
    "trainingCount": 0,
    "completedTrainingCount": 0,
    "trainingArray": []
  },
  "associates": {
    "associateCount": 0,
    "associateArray1": []
  },
  "reportee_summary": {
    "totalUniqueSkills": 0,
    "totalUniqueTrainings": 0,
    "totalUniqueCertifications": 0
  }
}
```

**Error Responses:**

**Missing JSON Body (400):**

```json
{
  "error": "Missing JSON body"
}
```

**Missing employeeId (400):**

```json
{
  "error": "Missing required field: employeeId"
}
```

**Invalid employeeId Format (400):**

```json
{
  "error": "Invalid employeeId. Must be a valid integer."
}
```

**Manager Not Found (404):**

```json
{
  "error": "Manager not found"
}
```

**Database Error (500):**

```json
{
  "error": "Database error",
  "details": "Error message details"
}
```

**Unexpected Error (500):**

```json
{
  "error": "Error message"
}
```

**Status Codes:**

- `200` - Success
- `400` - Missing required fields or invalid input
- `404` - Employee not found
- `405` - Method not allowed (non-POST request)
- `500` - Database or server error

### CORS Headers

All responses include:

- `Access-Control-Allow-Origin`: `*`
- `Access-Control-Allow-Methods`: `GET, POST, OPTIONS`
- `Access-Control-Allow-Headers`: `Content-Type, Authorization`

### Known limitation: no server-side role/permission check

This endpoint has no authorization check on `employeeId` (or `root`) at all — it returns whatever
hierarchy is rooted at the given id (or the resolved org root) to any authenticated caller,
regardless of role or their actual position in the org chart. The frontend's Admin-only gate on
`root: "organization"` (`hasOrgWideViewAccess`) is convenience UI, not enforcement — same as the rest of
this app's role checks generally, except here the backend currently has no rule to fall back on at
all. Noted during the "View Entire Organization" feature's design review; not fixed as part of
that (frontend UX) task — a real gap worth a future backend authorization pass.

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

**Configuration**:

- Uses `NullPool` to prevent connection pooling issues in Cloud Functions
- Uses SQLAlchemy 2.0 syntax (`future=True`)
- URL-encodes credentials using `quote_plus()`

### `resolve_org_root_id(conn, schema)`

Resolves the employee at the top of the entire organization, for the Admin "View Entire
Organization" view (`{"root": "organization"}`) — dynamically, not a hardcoded id.

**Parameters**:

- `conn` - SQLAlchemy database connection (within the active transaction)
- `schema` - DB schema name

**Query**: `employee WHERE reports_to IS NULL`, `GROUP BY` with a `LEFT JOIN` count of each
candidate's own direct reports, `ORDER BY` that count descending, `LIMIT 1`.

**Returns**: the resolved employee `id`, or `None` if no such row exists (the `get_combined_hierarchy_v2`
caller returns a 404 in that case).

**Why the tie-break**: the schema's `reports_to` FK is `ON DELETE SET NULL` — deleting a manager
without reassigning their reports first leaves those reports with `reports_to IS NULL` too,
alongside the real root. Picking whichever `NULL`-`reports_to` row has the most direct reports is a
cheap (one indexed query, not a recursive walk per candidate), reliable way to still pick correctly
even if such orphaned rows exist.

### `_cors_response(data, status=200)`

Helper function to add CORS headers to any response (private function).

**Parameters**:

- `data` - Response data (dictionary to be JSON-encoded)
- `status` - HTTP status code (default: 200)

**Returns**: Flask response with CORS headers

**Note**: Uses `json.dumps(data, sort_keys=False)` to preserve insertion order in the response.

**CORS Headers**:

- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization`

### `populate_employee_data(conn, reportee_node, is_reportee=False)`

Core inner function that fetches and structures all data for a single employee node.

**Parameters**:

- `conn` - SQLAlchemy database connection (within active transaction)
- `reportee_node` - Dictionary representing the employee node to populate
- `is_reportee` - Boolean flag; if `True`, it contributes to the manager's `reportee_summary`

**Process**:

1. **Fetch Skills Hierarchy**: Executes complex CTE query to get 4-level hierarchy (Domain → Discipline → Skill Area → Framework)
2. **Count Skills by Level**: Uses recursive `count_hierarchy()` helper to count nodes at each level
3. **Fetch Proficiency Counts**: Queries `employee_skills` for L1, L2, L3 and approval status counts
4. **Update Node Counts**: Sets `domainCount`, `disciplineCount`, `skillAreaCount`, `frameworkCount`, `l1Count`, `l2Count`, `l3Count`, `activeSkillsCount`, `pendingApprovalCount`
5. **Set Skills Data**: Assigns the full skills hierarchy to `skillArray`
6. **Fetch Certificates**: Queries `employee_certificates` joined with master tables
7. **Get Recent Certificate**: Fetches the most recently issued certificate name
8. **Set Certification Data**: Builds certification nodes and sets `recentCertificateName`
9. **Fetch Trainings**: Queries `employee_trainings` with LATERAL joins for latest comments
10. **Set Training Data**: Builds training nodes and calculates `completedTrainingCount`
11. **Accumulate Summaries**: If `is_reportee`, adds unique IDs to sets for `reportee_summary` (skills, trainings, certs)

### `count_hierarchy(nodes, key_map)`

Recursively counts nodes at each level of the skill hierarchy.

**Parameters**:

- `nodes` - List of nodes at the current level
- `key_map` - List of `(child_key, count_key)` tuples for each level:
  - `("disciplines", "domainCount")`
  - `("skillAreas", "disciplineCount")`
  - `("frameworks", "skillAreaCount")`
  - `(None, "frameworkCount")`

**Returns**: Dictionary with counts at each level

### `build_tree(emp_id)`

Recursively builds the employee tree for an employee and all their reportees.

**Parameters**:

- `emp_id` - Employee ID to build tree for

**Process**:

1. Get employee node from `reportee_dict`
2. Find all direct reportees where `managerId == emp_id`
3. Populate employee's data via `populate_employee_data(conn, current_node, is_reportee=True)`
4. Recursively call `build_tree()` for each direct reportee
5. If employee has reportees → set `role` to `"Manager"`, populate `associates` with `associateArrayN` (N = level + 1)
6. If no reportees → set `role` to `"Employee"`, empty `associates` with `associateArrayN`

**Returns**: Complete node dictionary with nested hierarchy

---

## Database Schema

### Tables Used

1. **employee**
   - `id`: Primary key
   - `emp_id`: Employee ID (string)
   - `name`: Employee name
   - `email`: Employee email
   - `manager_id`: Foreign key to employee table (recursive/self-referencing)

2. **employee_skills**
   - `employee_id`: Foreign key to employee
   - `skill_hierarchy_id`: Foreign key to skill_hierarchy_links
   - `level_selected`: Skill proficiency level
   - `approval_status`: Approval status of skill

3. **skill_hierarchy_links**
   - `id`: Primary key
   - `domain_id`: Foreign key to master_domain
   - `discipline_id`: Foreign key to master_discipline
   - `skill_area_id`: Foreign key to master_skill_area
   - `framework_id`: Foreign key to master_framework

4. **master_domain**
   - `id`: Primary key
   - `domain_name`: Domain name

5. **master_discipline**
   - `id`: Primary key
   - `discipline_name`: Discipline name

6. **master_skill_area**
   - `id`: Primary key
   - `skill_area`: Skill area name

7. **master_framework**
   - `id`: Primary key
   - `framework_name`: Framework/tool name

8. **employee_certificates**
   - `id`: Primary key (employee_certificate_id)
   - `employee_id`: Foreign key to employee
   - `certificate_id`: Foreign key to provider_certificate_mapping
   - `issued_date`: Certificate issue date
   - `expiry_date`: Certificate expiry date

9. **provider_certificate_mapping**
   - `id`: Primary key (mapping_id)
   - `provider_id`: Foreign key to master_certificate_provider
   - `certificate_id`: Foreign key to master_certificate

10. **master_certificate**
    - `id`: Primary key
    - `cert_name`: Certificate name
    - `cert_level`: Certificate level
    - `valid_years`: Validity in years
    - `is_active`: Active status (only active certs are fetched)

11. **master_certificate_provider**
    - `id`: Primary key
    - `cert_provider`: Provider name

12. **employee_trainings**
    - `employee_training_id`: Primary key
    - `employee_id`: Foreign key to employee
    - `batch_id`: Foreign key to training_batches
    - `competency`: Competency area
    - `training_status`: Training status (enum, cast to text)
    - `employee_type`: Employee type (enum, cast to text)
    - `nominated_by`: Who nominated the employee for this training
    - `start_date`: Training start date
    - `end_date`: Training end date

13. **training_batches**
    - `id`: Primary key
    - `batch_num`: Batch identifier
    - `training_hierarchy_id`: Foreign key to training_hierarchy_links

14. **training_hierarchy_links**
    - `training_hierarchy_id`: Primary key
    - `area_id`: Foreign key to master_area
    - `sub_area_id`: Foreign key to master_subarea
    - `module_id`: Foreign key to master_module

15. **master_area**
    - `area_id`: Primary key
    - `area_name`: Area name

16. **master_subarea**
    - `sub_area_id`: Primary key
    - `sub_area_name`: Sub-area name

17. **master_module**
    - `module_id`: Primary key
    - `module_name`: Module name
    - `course_level`: Course level

18. **comment**
    - `comment_text`: Comment content
    - `employee_training_id`: Foreign key to employee_trainings
    - `comment_type`: Type of comment (`'Employee'`, `'Manager'`, `'Department'`)
    - `commented_at`: Comment timestamp

---

## Key SQL Queries

### 1. Recursive Employee Hierarchy

```sql
WITH RECURSIVE reportee_hierarchy AS (
    -- Base case: Direct reports
    SELECT
        e.id,
        e.emp_id,
        e.name,
        e.email,
        e.manager_id,
        m.email AS manager_email,
        1 AS level
    FROM employee e
    LEFT JOIN employee m ON e.manager_id = m.id
    WHERE e.manager_id = :manager_id

    UNION ALL

    -- Recursive case: Reports of reports
    SELECT
        e.id,
        e.emp_id,
        e.name,
        e.email,
        e.manager_id,
        m.email AS manager_email,
        rh.level + 1
    FROM employee e
    LEFT JOIN employee m ON e.manager_id = m.id
    INNER JOIN reportee_hierarchy rh ON e.manager_id = rh.id
)
SELECT id, emp_id, name, email, manager_id, manager_email, level
FROM reportee_hierarchy
ORDER BY level, name
```

This query:

- Starts with direct reports of the manager
- Recursively finds reports at each level
- Tracks the hierarchy level for each employee
- Includes manager email via self-join
- Orders by level and name for consistent output

### 2. Skills Hierarchy Aggregation

Uses nested CTEs to build a 4-level hierarchy:

- `employee_skills`: Base employee skills data joined with `skill_hierarchy_links`, filtered to `approval_status IN ('Approved', 'Pre-Approved')` — Pending/Rejected skills never enter this hierarchy or any of its rollup counts
- `frameworks_agg`: Aggregates frameworks (level 4) with `levelSelected` and `approvalStatus`
- `skill_area_agg`: Aggregates skill areas (level 3) with their frameworks
- `discipline_agg`: Aggregates disciplines (level 2) with their skill areas
- `domain_agg`: Aggregates domains (level 1) with their disciplines

Returns JSON structure using `json_agg` and `json_build_object` with `ORDER BY` for consistent ordering.

### 3. Certifications Query

```sql
SELECT
    ec.id AS employee_certificate_id,
    pcm.id AS mapping_id,
    mcp.cert_provider,
    mc.cert_name,
    mc.cert_level,
    mc.valid_years,
    ec.issued_date,
    ec.expiry_date
FROM employee_certificates ec
INNER JOIN provider_certificate_mapping pcm ON ec.certificate_id = pcm.id
INNER JOIN master_certificate mc ON pcm.certificate_id = mc.id
INNER JOIN master_certificate_provider mcp ON pcm.provider_id = mcp.id
WHERE ec.employee_id = :rep_id AND mc.is_active = TRUE
ORDER BY mc.cert_name, mc.cert_level
```

### 4. Trainings Query with Comments

```sql
SELECT
    et.employee_training_id AS training_id,
    et.employee_id,
    thl.module_id,
    tb.batch_num,
    et.competency,
    et.training_status::text AS training_status,
    et.employee_type::text AS employee_type,
    et.nominated_by,
    et.start_date,
    et.end_date,
    ma.area_name,
    msa.sub_area_name,
    mm.module_name,
    mm.course_level,
    employee_comment_data.comment_text AS employee_comment,
    manager_comment_data.comment_text AS manager_comment,
    department_comment_data.comment_text AS department_comment
FROM employee_trainings et
LEFT JOIN training_batches tb ON tb.id = et.batch_id
INNER JOIN training_hierarchy_links thl ON tb.training_hierarchy_id = thl.training_hierarchy_id
LEFT JOIN master_area ma ON thl.area_id = ma.area_id
LEFT JOIN master_subarea msa ON thl.sub_area_id = msa.sub_area_id
LEFT JOIN master_module mm ON thl.module_id = mm.module_id
LEFT JOIN LATERAL (
    SELECT c.comment_text
    FROM comment c
    WHERE c.employee_training_id = et.employee_training_id
      AND c.comment_type = 'Employee'
    ORDER BY c.commented_at DESC
    LIMIT 1
) AS employee_comment_data ON TRUE
-- Similar LATERAL joins for Manager and Department comments
WHERE et.employee_id = :rep_id
ORDER BY et.employee_training_id
```

Uses LATERAL joins to fetch the latest comment of each type (Employee, Manager, Department) for each training record.

---

## Response Structure

The function creates a hierarchical tree with different node types:

1. **Manager/Employee Node** (Root or Intermediate)
   - `role`: `"Manager"` (if has direct reports) or `"Employee"` (if leaf node)
   - Fields: `id`, `empId`, `name`, `email`, `managerEmail`, `managerId`, `level`
   - `skills` object with:
     - `domainCount`: Number of domains in the skills hierarchy
     - `disciplineCount`: Number of disciplines
     - `skillAreaCount`: Number of skill areas
     - `frameworkCount`: Number of frameworks
     - `l1Count`, `l2Count`, `l3Count`: Skill counts by level (L1/L2/L3), Approved/Pre-Approved only
     - `activeSkillsCount`: Count of Approved/Pre-Approved skills (excludes Pending/Rejected — matches the "counts as held" definition `getEmployeeSkillsInfo_v2`/`skillDataTable.jsx` use elsewhere)
     - `pendingApprovalCount`: Skills pending approval
     - `skillArray`: Approved/Pre-Approved skills hierarchy only (see below)
   - `certifications` object with:
     - `certificationCount`: Number of certifications
     - `certificationArray`: List of certification objects
     - `recentCertificateName`: Most recent certificate name
   - `trainings` object with:
     - `trainingCount`: Number of trainings
     - `completedTrainingCount`: Trainings with status "Completed"
     - `trainingArray`: List of training objects
   - `associates` object with `associateCount`, `associateArrayN` (N = level + 1)
   - `reportee_summary` object (at root level) with:
     - `totalUniqueSkills`: Total unique frameworks across all reportees
     - `totalUniqueTrainings`: Total unique training modules
     - `totalUniqueCertifications`: Total unique certificate mappings

2. **Skills Hierarchy (inside `skillArray`)**
   - **Domain**: Top level (e.g., "Technology", "Business")
   - **Discipline**: Second level (e.g., "Cloud Computing", "Data Science")
   - **Skill Area**: Third level (e.g., "AWS", "Azure")
   - **Framework**: Leaf level (e.g., "EC2", "S3") with `levelSelected` and `approvalStatus`

3. **Certification Node (inside `certificationArray`)**
   - Fields: `mappingId`, `employeeCertificateId`, `certName`, `certProvider`, `certLevel`, `validYears`, `issuedDate`, `expiryDate`

4. **Training Node (inside `trainingArray`)**
   - Fields: `employeeTrainingId`, `employeeId`, `moduleId`, `batch`, `moduleName`, `areaName`, `subAreaName`, `courseLevel`, `trainingStatus`, `employeeType`, `nominatedBy`, `startDate`, `endDate`, `competency`, `employeeComment`, `managerComment`, `departmentComment`

### Skill Count Calculation

The following fields are always present in the `skills` object for each employee node:

- `domainCount`: Number of unique domains in the employee's skills hierarchy
- `disciplineCount`: Number of unique disciplines
- `skillAreaCount`: Number of unique skill areas
- `frameworkCount`: Number of unique frameworks

These counts are calculated by traversing the nested skills hierarchy returned from the database, using a recursive function that counts nodes at each level. The calculation is performed in Python after fetching the hierarchy JSON from the database.

### Tree Building Algorithm

```
1. Fetch manager from employee table
2. Initialize manager node with empty skills/certs/trainings/associates
3. Recursive CTE → fetch all reportees across all levels
4. Build reportee_dict keyed by employee id
5. populate_employee_data(manager_node)  ← fills skills, certs, trainings
6. If no reportees → set role="Employee", return manager_node directly
7. For each direct reportee of manager:
   a. build_tree(reportee_id):
      - populate_employee_data(current_node)
      - Set role and associates based on whether they have reportees
   b. Collect into associateArray1
8. Return manager_node with nested hierarchy
```

---

## Environment Variables

Required environment variables:

- `DB_USER`: Database username
- `DB_PASS`: Database password
- `DB_NAME`: Database name
- `DB_HOST`: Database host
- `DB_PORT`: Database port (default: 5432)
- `DB_SCHEMA`: Database schema (default: `public` when unset)
- `ENV`: Environment (`development` or `production`)

---

## Local Development

### Prerequisites

1. Python 3.10+
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
   cd backend/aggregations/getCombinedHierarchy_v2
   pip install -r requirements.txt
   ```

2. **Start Local Server**:

   ```bash
   functions-framework --target=get_combined_hierarchy_v2 --source main.py --debug --port=8110
   ```

   Or using the project script:

   ```bash
   ./scripts/dev/run-backend-function.sh aggregations/getCombinedHierarchy_v2 8110
   ```

3. **Test POST Request**:
   ```bash
   curl -X POST http://localhost:8110 \
     -H "Content-Type: application/json" \
     -d '{"employeeId": 123}'
   ```

---

## Deployment

Deployment and IAM changes belong in `skill-matrix-deploy`. The deployed function is private; only the frontend Cloud Run runtime service account is granted `roles/run.invoker`.

### Production Deployment

```bash
gcloud functions deploy get_combined_hierarchy_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point get_combined_hierarchy_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=production
```

### Development Deployment

```bash
gcloud functions deploy dev_get_combined_hierarchy_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point get_combined_hierarchy_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=development
```

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
3. **Authentication**: Private IAM through the frontend proxy
4. **Generation**: Uses Gen2 Cloud Functions (`--gen2`)
5. **Runtime**: Python 3.10
6. **Dependencies**: Automatically installs from `requirements.txt`

### Cloud Testing

Use `{{frontend_base_url}}/get_combined_hierarchy_v2` for browser and normal cloud Postman requests. The cloud-development client path remains unprefixed; frontend runtime `FUNCTIONS_BASE_URL` ending in `/dev_` selects the `dev_` upstream. If end-user identity is needed, send `Authorization: Bearer {{sso_token}}` from app `localStorage.authToken`; `REQUIRE_SSO_JWT=true` enables proxy enforcement.

The proxy preserves the SSO JWT in `Authorization` and adds its Google identity token as `X-Serverless-Authorization`. Direct `*.cloudfunctions.net` diagnostics require a Google identity token whose audience is the exact function URL. Local functions-framework requests need no GCP identity token.

---

## Error Handling

The function includes comprehensive error handling:

### Validation Errors (400)

- Missing JSON body
- Missing required field: `employeeId`
- Invalid `employeeId` format (not a valid integer)

### Not Found Errors (404)

- Manager/Employee with given ID not found

### Method Errors (405)

- Unsupported HTTP method (non-POST request)

### Server Errors (500)

- **SQLAlchemyError**: Database connection or query errors
  - Returns 500 with `"Database error"` message and details
  - Logs full error details via `logger.exception()`
- **Generic Exceptions**: Unexpected errors
  - Returns 500 with error message
  - Logs full stack trace

### Logging

The function includes comprehensive logging:

- Reportee count per manager
- Tree building progress (number of direct reportees)
- Skills processing results per employee
- Certificate fetch results per employee
- Error details with stack traces
- Final success message

---

## Performance Considerations

### Optimizations

1. **Single Transaction**: All queries execute within one database transaction (`engine.begin()`)
2. **NullPool**: Uses SQLAlchemy NullPool for serverless environment
3. **Efficient Recursion**: PostgreSQL recursive CTE for hierarchy retrieval (single query for all levels)
4. **JSON Aggregation**: Database-side JSON building for skills hierarchy using `json_agg` and `json_build_object`
5. **LATERAL Joins**: Efficient comment fetching (latest per type) without N+1 queries
6. **Dictionary Lookup**: `reportee_dict` enables O(1) lookups when building the tree
7. **Preserved Order**: Uses `json.dumps(sort_keys=False)` to maintain response field order

### Potential Bottlenecks

1. **Large Hierarchies**: For managers with many levels of reportees, response time increases (one `populate_employee_data` call per employee)
2. **Skill Data Volume**: Employees with many skills add to response size
3. **Training Comments**: Multiple LATERAL joins for comments may slow queries on large datasets

### Scaling Recommendations

1. **Pagination**: Consider paginating deep hierarchies
2. **Caching**: Cache results with short TTL for frequently accessed managers
3. **Lazy Loading**: Option to load sections (skills/certs/trainings) on demand
4. **Database Indexing**: Ensure indexes on:
   - `employee.manager_id`
   - `employee_skills.employee_id`
   - `employee_certificates.employee_id`
   - `employee_trainings.employee_id`

---

## Testing

### Test Cases

1. **Manager with Direct Reports Only**
   - Input: employeeId of manager with 1-level reportees
   - Expected: Tree with manager (role=Manager) and direct reports (role=Employee) in `associateArray1`

2. **Manager with Multi-Level Hierarchy**
   - Input: employeeId of senior manager
   - Expected: Deep tree with multiple levels, intermediate managers with `associateArray2`, `associateArray3`, etc.

3. **Employee with No Reports**
   - Input: employeeId of individual contributor
   - Expected: Single node with `role: "Employee"` and `associateCount: 0`

4. **Manager Not Found**
   - Input: Non-existent employeeId
   - Expected: 404 error with `"Manager not found"`

5. **Invalid Input**
   - Input: String/non-integer employeeId
   - Expected: 400 validation error

### Sample Test Request

```bash
curl -X POST http://localhost:8110 \
  -H "Content-Type: application/json" \
  -d '{"employeeId": 123}'
```

---

## Related Documentation

- [manageComments_v2](./manageComments_v2.md) - Comment management for trainings, skills, and certificates
- [saveEmployeeSkill_v2](../skills/saveEmployeeSkill_v2.md) - Skill save function with approval workflow
- [saveEmployeeCertificate_v2](../certificates/saveEmployeeCertificate_v2.md) - Certificate save function
- [addTraining_v2](../data/addTraining_v2.md) - Training data management

---

## Support & Troubleshooting

### Common Issues

#### "Missing JSON body"

- **Cause**: Request sent without JSON body or wrong Content-Type
- **Solution**: Ensure `Content-Type: application/json` header and valid JSON body

#### "Missing required field: employeeId"

- **Cause**: JSON body doesn't contain `employeeId` key
- **Solution**: Include `employeeId` in the request body

#### "Invalid employeeId. Must be a valid integer."

- **Cause**: `employeeId` value is not a valid integer
- **Solution**: Send integer value for `employeeId`

#### "Manager not found"

- **Cause**: No employee exists with the given ID
- **Solution**: Verify the employee ID exists in the database

#### Empty skills/certifications/trainings arrays

- **Cause**: Employee has no records in the respective tables
- **Solution**: This is expected behavior; verify data exists in the database if unexpected

#### Skills hierarchy returning `[]`

- **Cause**: No matching records in `employee_skills` + `skill_hierarchy_links` for the employee
- **Solution**: Check that `employee_skills` records exist and `skill_hierarchy_links` are properly joined

### Debug Mode

Enable detailed logging in local development:

```bash
functions-framework --target=get_combined_hierarchy_v2 --source main.py --debug --port=8110
```

Check logs for:

- Reportee counts
- Skills processing per employee
- Certificate and training fetch results
- Error stack traces
