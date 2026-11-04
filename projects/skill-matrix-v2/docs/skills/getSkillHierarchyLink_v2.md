# get_skill_hierarchy_link_v2 Function Documentation

## Overview

`get_skill_hierarchy_link_v2` is a Google Cloud Function that retrieves the complete master skill catalog from the database. It returns all available skills with their hierarchical structure (Domain → Discipline → Skill Area → Framework) and skill level definitions (L1, L2, L3). This function provides the reference data that employees use to select and add skills to their profiles.

**Location**: `backend/skills/getSkillHierarchyLink_v2/main.py`

**Trigger**: HTTP GET request

**Port (Local Development)**: 8082 (as per `vite.config.js`)

**Database Library**: SQLAlchemy ORM

---

## Purpose

This function serves as the master data provider for the Skill Matrix application. It provides:

1. **Complete Skill Catalog**: All available skills in the system organized by hierarchy
2. **Skill Selection**: Reference data for employees to select skills when adding to their profile
3. **Hierarchy Structure**: Shows how skills are organized (Domain → Discipline → Skill Area → Framework)
4. **Level Definitions**: Provides L1, L2, L3 level descriptions for each framework

**Key Difference from `getEmployeeSkill_v2`**:
- `getSkillHierarchyLink_v2`: Returns **all available skills** (master catalog)
- `getEmployeeSkill_v2`: Returns **employee-specific skills** (what an employee has)

---

## Function Flow

### Entry Point: `get_skill_hierarchy_link_v2(request: Request)`

The main Cloud Function handler that processes HTTP requests.

#### 1. CORS Handling
- Handles OPTIONS preflight requests
- Sets CORS headers with smart origin detection:
  - Allows specific localhost origins for development (`localhost:5173`, `localhost:3000`)
  - Uses `*` for production
- Allows `GET`, `POST`, and `OPTIONS` methods
- Includes `Authorization` header in allowed headers

#### 2. Request Processing
- Accepts GET requests (no parameters required)
- No request body or query parameters needed
- Fetches all skill hierarchy links from the database

#### 3. Data Processing
- Calls `fetch_skill_hierarchy_link()` to query the database
- Converts datetime objects to ISO format strings for JSON serialization
- Returns structured skill catalog data

#### 4. Response
- Returns JSON array of skill hierarchy objects
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

### `get_cors_headers(request: Request) -> Dict[str, str]`

Generates CORS headers based on the request origin.

**Parameters**:
- `request` - Flask Request object

**Returns**: Dictionary of CORS headers

**Logic**:
- If origin is in allowed list (localhost:5173, localhost:3000), uses that origin
- Otherwise uses `*` for production

### `fetch_skill_hierarchy_link() -> List[Dict[str, Any]]`

Performs the database query to fetch all skill hierarchy links with joined master tables.

**Returns**: List of dictionaries containing skill hierarchy data

**Environment Variables Used**:
- `DB_SCHEMA` - Database schema name (default: `skill_matrix_v2_dev`)

**Validation**:
- Validates required environment variables (`DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME`)
- Raises `ValueError` if any are missing

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
    mf.basic AS L1,
    mf.intermediate AS L2,
    mf.expert AS L3,
    shl.created_at,
    shl.updated_at
FROM "{schema}".skill_hierarchy_links shl
LEFT JOIN "{schema}".master_domain md 
    ON md.id = shl.domain_id
LEFT JOIN "{schema}".master_discipline mdisc 
    ON mdisc.id = shl.discipline_id
LEFT JOIN "{schema}".master_skill_area msa 
    ON msa.id = shl.skillarea_id
LEFT JOIN "{schema}".master_framework mf 
    ON mf.id = shl.framework_id
ORDER BY md.domain_name, mdisc.discipline_name, msa.skill_area, mf.framework_name
```

**Query Explanation**:
- Joins `skill_hierarchy_links` with all master tables to get complete hierarchy information
- Uses LEFT JOINs to ensure all hierarchy links are returned even if some master data is missing
- Orders results by hierarchy: Domain → Discipline → Skill Area → Framework
- Returns skill level descriptions (L1, L2, L3) from the framework table

---

## API Specification

### Endpoint

**URL**: `/get_skill_hierarchy_link_v2`

**Method**: `GET`

**Cloud access**: Private IAM through the frontend proxy. This read may remain available before login when `REQUIRE_SSO_JWT` is unset.

### Request

**Headers**:
- `Content-Type`: `application/json` (optional)
- `Origin`: Request origin (for CORS)

**Query Parameters**: None

**Request Body**: None

### Response

#### Success Response (200 OK)

**Content-Type**: `application/json`

**Body**: Array of skill hierarchy objects

```json
[
  {
    "skillhierarchy_id": 1,
    "domain_id": 1,
    "domain_name": "Technology",
    "discipline_id": 1,
    "discipline_name": "Software Development",
    "skill_area_id": 1,
    "skill_area": "Frontend",
    "framework_id": 1,
    "framework_name": "React",
    "L1": "Basic React concepts and components",
    "L2": "Intermediate React patterns and hooks",
    "L3": "Advanced React architecture and optimization",
    "created_at": "2024-01-01T00:00:00",
    "updated_at": "2024-01-01T00:00:00"
  },
  {
    "skillhierarchy_id": 2,
    "domain_id": 1,
    "domain_name": "Technology",
    "discipline_id": 1,
    "discipline_name": "Software Development",
    "skill_area_id": 1,
    "skill_area": "Frontend",
    "framework_id": 2,
    "framework_name": "Vue.js",
    "L1": "Basic Vue.js concepts",
    "L2": "Intermediate Vue.js patterns",
    "L3": "Advanced Vue.js architecture",
    "created_at": "2024-01-01T00:00:00",
    "updated_at": "2024-01-01T00:00:00"
  }
]
```

**Response Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `skillhierarchy_id` | integer | Unique identifier for the skill hierarchy link |
| `domain_id` | integer | Domain ID |
| `domain_name` | string | Domain name (e.g., "Technology") |
| `discipline_id` | integer | Discipline ID |
| `discipline_name` | string | Discipline name (e.g., "Software Development") |
| `skill_area_id` | integer | Skill Area ID |
| `skill_area` | string | Skill Area name (e.g., "Frontend") |
| `framework_id` | integer | Framework ID |
| `framework_name` | string | Framework name (e.g., "React") |
| `L1` | string | Basic/Level 1 skill description |
| `L2` | string | Intermediate/Level 2 skill description |
| `L3` | string | Expert/Level 3 skill description |
| `created_at` | string (ISO 8601) | Creation timestamp |
| `updated_at` | string (ISO 8601) | Last update timestamp |

#### Error Response (500 Internal Server Error)

**Content-Type**: `application/json`

```json
{
  "error": "Error message describing what went wrong"
}
```

**Common Error Scenarios**:
- Missing environment variables
- Database connection failure
- SQL query execution error
- Unexpected exceptions

---

## Database Schema

### Tables Used

#### `skill_hierarchy_links`
Main table that links all hierarchy levels together.

**Key Columns**:
- `id` - Primary key (returned as `skillhierarchy_id`)
- `domain_id` - Foreign key to `master_domain`
- `discipline_id` - Foreign key to `master_discipline`
- `skillarea_id` - Foreign key to `master_skill_area`
- `framework_id` - Foreign key to `master_framework`
- `created_at`, `updated_at` - Timestamps

#### `master_domain`
Master table for domains.

**Key Columns**:
- `id` - Primary key
- `domain_name` - Domain name

#### `master_discipline`
Master table for disciplines.

**Key Columns**:
- `id` - Primary key
- `discipline_name` - Discipline name

#### `master_skill_area`
Master table for skill areas.

**Key Columns**:
- `id` - Primary key
- `skill_area` - Skill area name

#### `master_framework`
Master table for frameworks.

**Key Columns**:
- `id` - Primary key
- `framework_name` - Framework name
- `basic` - L1 level description (returned as `L1`)
- `intermediate` - L2 level description (returned as `L2`)
- `expert` - L3 level description (returned as `L3`)

### Relationships

```
skill_hierarchy_links
├── domain_id → master_domain.id
├── discipline_id → master_discipline.id
├── skillarea_id → master_skill_area.id
└── framework_id → master_framework.id
```

---

## Frontend Integration

### Usage in Frontend

This function is called from `SkillContext.jsx` when the application loads:

```javascript
// frontend/src/context/SkillContext.jsx
useEffect(() => {
  const fetchMasterSkills = async () => {
    try {
      setIsMasterLoading(true);
      const response = await axios.get(`${BASE_URL}get_skill_hierarchy_link_v2`);
      setMasterSkills(response.data);
    } catch (err) {
      console.error("Failed to fetch master skills:", err);
      toast.error(`Failed to fetch master skills: ${err.response?.data?.error || err.message}`);
      setMasterSkills([]);
    } finally {
      setIsMasterLoading(false);
    }
  };
  fetchMasterSkills();
}, []);
```

### Frontend Components Using This Data

1. **EmployeeSkillTable**: Displays available skills for selection
2. **skillDataTable**: Shows the skill catalog with filtering and sorting
3. **Skill Selection UI**: Dropdowns and autocomplete for skill selection

### Data Flow

```
Frontend (SkillContext)
  ↓ GET /get_skill_hierarchy_link_v2
Backend (get_skill_hierarchy_link_v2)
  ↓ Query Database
Database (skill_hierarchy_links + master tables)
  ↓ Return Results
Backend (JSON array)
  ↓ Response
Frontend (masterSkills state)
  ↓ Display/Use
UI Components (EmployeeSkillTable, skillDataTable)
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

1. **ValueError**: Missing required environment variables
   - **Status**: 500
   - **Message**: "Missing required environment variables: DB_HOST, DB_USER, ..."

2. **SQLAlchemyError**: Database connection or query errors
   - **Status**: 500
   - **Message**: SQLAlchemy error message

3. **Exception**: Unexpected errors
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
- Logs include full stack traces for debugging

---

## Deployment

Cloud deployment/IAM belongs in `skill-matrix-deploy`. The function is private and invoked by the frontend Cloud Run runtime service account with `roles/run.invoker`.

### Production Deployment

```bash
gcloud functions deploy get_skill_hierarchy_link_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point get_skill_hierarchy_link_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --no-gen2 \
  --region asia-south1 \
  --set-env-vars ENV=production
```

### Development Deployment

```bash
gcloud functions deploy dev_get_skill_hierarchy_link_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point get_skill_hierarchy_link_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --no-gen2 \
  --region asia-south1 \
  --set-env-vars ENV=development
```

### Local Testing

1. **Create `.env` file** in `backend/skills/getSkillHierarchyLink_v2/`:
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
   functions-framework --target=get_skill_hierarchy_link_v2 --source main.py --debug --port=8082
   ```

3. **Test the endpoint**:
   ```bash
   curl http://127.0.0.1:8082/
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

1. **Test successful request**:
   ```bash
   curl -X GET http://localhost:8082/
   ```

2. **Test CORS preflight**:
   ```bash
   curl -X OPTIONS http://localhost:8082/ \
     -H "Origin: http://localhost:5173" \
     -H "Access-Control-Request-Method: GET"
   ```

3. **Test with frontend**:
   - Start frontend: `npm run dev`
   - Frontend automatically calls this endpoint on load
   - Check browser console and network tab

### Expected Behavior

- Returns array of skill hierarchy objects
- All datetime fields are ISO 8601 strings
- Results are ordered by Domain → Discipline → Skill Area → Framework
- CORS headers are properly set
- Errors are logged and returned with appropriate status codes

---

## Performance Considerations

### Query Optimization

- Uses LEFT JOINs to ensure all hierarchy links are returned
- Results are ordered in the database (no client-side sorting needed)
- Uses SQLAlchemy connection pooling (NullPool for Cloud Functions)

### Caching

- Consider caching results if master data doesn't change frequently
- Frontend may cache results in React state
- No built-in caching in the function (returns fresh data each time)

### Scalability

- Function is stateless and can scale horizontally
- Database query is read-only (no locks)
- Suitable for high read traffic

---

## Security Considerations

### Private Endpoint and Data Sensitivity

- Cloud IAM restricts invocation to the frontend runtime service account
- Only returns read-only master data (no sensitive information)
- No user-specific data is exposed
- Legacy-compatible pre-login reads are controlled at the frontend proxy by leaving `REQUIRE_SSO_JWT` unset

### Cloud Testing

Use `{{frontend_base_url}}/get_skill_hierarchy_link_v2` for browser and normal cloud Postman requests in both environments. Development remains unprefixed in the client; runtime `FUNCTIONS_BASE_URL` ending in `/dev_` selects `dev_get_skill_hierarchy_link_v2`. If supplied, use `Authorization: Bearer {{sso_token}}` from app `localStorage.authToken`.

The proxy adds its Google identity token as `X-Serverless-Authorization`. Direct `*.cloudfunctions.net` diagnostics require a Google identity token whose audience is the exact function URL; an SSO token alone is insufficient. Localhost needs no GCP identity token.

### SQL Injection Prevention

- Uses SQLAlchemy `text()` with parameterized queries
- Schema name is validated from environment variable
- No user input is directly used in SQL queries

### CORS

- Smart CORS handling for development vs production
- Allows specific localhost origins for development
- Uses `*` for production (can be restricted if needed)

---

## Related Functions

### Related Backend Functions

- **`getEmployeeSkill_v2`**: Returns employee-specific skills (uses same hierarchy data)
- **`saveEmployeeSkill_v2`**: Saves employee skills (uses `skillhierarchy_id` from this function)
- **`getEmployeeSkillHierarchy_v2`**: Returns hierarchical tree structure (uses same master data)

### Related Frontend Components

- **`SkillContext.jsx`**: Calls this function to populate master skills
- **`EmployeeSkillTable.jsx`**: Uses master skills for selection
- **`skillDataTable.jsx`**: Displays and filters master skills

---

## Changelog

### Version 2 (Current)

- **Migration to SQLAlchemy**: Converted from `psycopg2` to SQLAlchemy ORM
- **Removed `db_utils.py`**: Now uses `get_db_engine()` directly
- **Environment Variables**: Uses `.env` file instead of config files
- **Error Handling**: Improved error handling with `SQLAlchemyError`
- **CORS**: Enhanced CORS handling with smart origin detection
- **Port**: Updated to 8082 (matching `vite.config.js`)

### Version 1 (Legacy)

- Used `psycopg2` directly
- Used `db_utils.py` for database connections
- Used config files for database configuration

---

## Troubleshooting

### Common Issues

1. **"Missing required environment variables"**
   - **Solution**: Ensure all required environment variables are set in `.env` file or Cloud Function environment

2. **Database connection errors**
   - **Solution**: Verify database credentials and network connectivity
   - Check that database is accessible from Cloud Function

3. **Empty results**
   - **Solution**: Verify that `skill_hierarchy_links` table has data
   - Check that schema name matches your database schema

4. **CORS errors in browser**
   - **Solution**: Verify CORS headers are being set correctly
   - Check that frontend origin matches allowed origins

### Debugging

1. **Check logs**: Cloud Function logs show detailed error messages
2. **Test locally**: Use local testing to debug before deploying
3. **Verify database**: Ensure master tables have data
4. **Check schema**: Verify `DB_SCHEMA` matches your database schema

---

## Future Enhancements

### Potential Improvements

1. **Caching**: Add Redis or in-memory caching for frequently accessed data
2. **Filtering**: Add query parameters to filter by domain, discipline, etc.
3. **Pagination**: Add pagination for large result sets
4. **Versioning**: Add version parameter to support multiple skill catalogs
5. **Compression**: Add response compression for large datasets

---

## Summary

`get_skill_hierarchy_link_v2` is a critical function that provides the master skill catalog to the frontend. It:

- ✅ Returns all available skills with complete hierarchy information
- ✅ Uses SQLAlchemy ORM for database operations
- ✅ Handles CORS properly for frontend integration
- ✅ Provides comprehensive error handling
- ✅ Is optimized for read-only operations
- ✅ Follows v2 function patterns and conventions

This function is called on application load and provides the reference data that employees use to select and add skills to their profiles.
