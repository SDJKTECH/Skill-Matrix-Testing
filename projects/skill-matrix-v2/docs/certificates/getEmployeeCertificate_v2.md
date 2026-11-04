# getEmployeeCertificate_v2

## Overview

Google Cloud Function that fetches employee certificates from the `employee_certificates` table. It joins with `provider_certificate_mapping`, `master_certificate`, and `master_certificate_provider` to return complete certificate details for an employee.

## Purpose

This function provides employee-specific certificate data to the frontend. When an employee views their profile or certificate section:

1. The frontend calls `get_employee_certificate_v2` with the employee's email
2. The function queries the database for all certificates linked to that employee
3. Returns complete certificate information including provider, name, level, validity, and dates
4. The frontend displays this data and allows editing/updating

**Key Difference from `getCertificateMapping_v2`:**
- `getCertificateMapping_v2`: Returns **all available certificate mappings** (master catalog)
- `getEmployeeCertificate_v2`: Returns **employee-specific certificates** (what an employee has)

## Cloud access and authentication

The deployed function is private behind IAM. Test it through `{{frontend_base_url}}/get_employee_certificate_v2`, optionally sending `Authorization: Bearer {{sso_token}}`. The SSO token is required only when `REQUIRE_SSO_JWT=true` is enabled on the frontend proxy. Direct `cloudfunctions.net` calls are admin diagnostics only and require a Google identity token.

## Function Flow

```
1. Receive HTTP request (POST with email or OPTIONS for CORS)
2. Handle CORS preflight (OPTIONS)
3. Validate email in request body
4. Validate environment variables
5. Connect to database using SQLAlchemy
6. Execute query joining:
   - employee_certificates (ec)
   - employee (e)
   - provider_certificate_mapping (pcm)
   - master_certificate (mc)
   - master_certificate_provider (mcp)
7. Convert results to JSON-serializable format
8. Return employee email and certificates array
```

## API

### Endpoint

```
POST /get_employee_certificate_v2
```

### Request

**Method:** `POST` or `OPTIONS` (for CORS preflight)

**Headers:**
- `Origin`: Frontend origin (for CORS)
- `Content-Type`: `application/json`

**Request Body:**
```json
{
  "email": "employee@example.com"
}
```

### Response

**Success (200):**
```json
{
  "email": "employee@example.com",
  "certificates": [
    {
      "mappingId": 1,
      "certificateName": "AWS Certified Solutions Architect",
      "certLevel": "Associate",
      "validYears": 3,
      "certProvider": "AWS",
      "issuedDate": "2024-01-15T00:00:00",
      "expiryDate": "2027-01-15T00:00:00",
      "empCertId": 1,
      "yearAchieved": 2024
    },
    ...
  ]
}
```

**Error (400):**
```json
{
  "error": "Missing required field: email"
}
```

**Error (500):**
```json
{
  "error": "Error message"
}
```

### CORS Headers

The function includes CORS headers to allow requests from:
- `http://localhost:5173` (local Vite dev server)
- `https://skill-matrix-v2-dev-140475459295.asia-south1.run.app` (V2 Dev Cloud Run)

## Database Schema

### Tables Used

1. **employee_certificates** (`ec`)
   - `id` (empCertId)
   - `employee_id` → references `employee.id`
   - `certificate_id` → references `provider_certificate_mapping.id`
   - `issued_date`
   - `expiry_date`
   - `created_at`
   - `updated_at`

2. **employee** (`e`)
   - `id`
   - `email`

3. **provider_certificate_mapping** (`pcm`)
   - `id` (mappingId)
   - `provider_id` → references `master_certificate_provider.id`
   - `certificate_id` → references `master_certificate.id`

4. **master_certificate** (`mc`)
   - `id`
   - `cert_name` (certificateName)
   - `cert_level` (certLevel)
   - `valid_years` (validYears)
   - `is_active`

5. **master_certificate_provider** (`mcp`)
   - `id`
   - `cert_provider` (certProvider)

### Query

```sql
SELECT 
    pcm.id AS "mappingId",
    mc.cert_name AS "certificateName",
    mc.cert_level AS "certLevel",
    mc.valid_years AS "validYears",
    mcp.cert_provider AS "certProvider",
    ec.issued_date AS "issuedDate",
    ec.expiry_date AS "expiryDate",
    ec.id AS "empCertId"
FROM "{schema}".employee_certificates ec
JOIN "{schema}".employee e ON e.id = ec.employee_id
JOIN "{schema}".provider_certificate_mapping pcm ON pcm.id = ec.certificate_id
JOIN "{schema}".master_certificate mc ON mc.id = pcm.certificate_id
JOIN "{schema}".master_certificate_provider mcp ON mcp.id = pcm.provider_id
WHERE LOWER(e.email) = LOWER(:email)
AND mc.is_active = true
ORDER BY ec.id
```

## Implementation Details

### Technology Stack

- **Runtime:** Python 3.10
- **Framework:** Flask (via functions-framework)
- **Database:** PostgreSQL
- **ORM:** SQLAlchemy 2.0
- **Connection Pooling:** NullPool (stateless Cloud Functions)

### Key Functions

1. **`get_db_engine()`**
   - Creates SQLAlchemy engine using environment variables
   - Uses `NullPool` for stateless Cloud Functions
   - URL encodes credentials for special characters

2. **`fetch_employee_certificates(email: str)`**
   - Validates required environment variables
   - Executes SQL query with schema prefix
   - Returns list of dictionaries

3. **`get_employee_certificate_v2(request)`**
   - Entry point for Cloud Function
   - Handles CORS preflight
   - Converts datetime objects to ISO strings
   - Extracts year from `issuedDate` for `yearAchieved` field
   - Returns JSON response

### Environment Variables

**Required:**
- `DB_HOST`: Database host address
- `DB_USER`: Database username
- `DB_PASS`: Database password
- `DB_NAME`: Database name
- `DB_PORT`: Database port (default: 5432)
- `DB_SCHEMA`: Database schema name (default: `skill_matrix_v2_dev`)

**Optional:**
- `ENV`: Environment name (`development` or `production`)

## Error Handling

1. **Missing Email**
   - Returns 400 with error message
   - Logged as warning

2. **Missing Environment Variables**
   - Returns `ValueError` with list of missing variables
   - Logged as error

3. **Database Errors (SQLAlchemyError)**
   - Caught and logged with full stack trace
   - Returns 500 with error message

4. **Unexpected Errors**
   - Caught and logged with full stack trace
   - Returns 500 with error message

## Local Development

### Setup

1. Create a `.env` file in the function directory:
```bash
DB_HOST=your-database-host
DB_USER=your-database-username
DB_PASS=your-database-password
DB_NAME=your-database-name
DB_PORT=5432
DB_SCHEMA=skill_matrix_v2_dev
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Run the function locally:
```bash
functions-framework --target=get_employee_certificate_v2 --source main.py --debug --port=8102
```

4. Test the endpoint:
```bash
curl -X POST http://127.0.0.1:8102/ \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:5173" \
  -d '{"email": "employee@example.com"}'
```

### Testing

**Test with curl:**
```bash
curl -X POST http://127.0.0.1:8102/ \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:5173" \
  -d '{"email": "employee@example.com"}'
```

**Test CORS preflight:**
```bash
curl -X OPTIONS http://127.0.0.1:8102/ \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST" \
  -v
```

## Deployment

Deployment and IAM changes belong in `skill-matrix-deploy`. The function is private; the frontend Cloud Run runtime service account receives `roles/run.invoker`.

### Development

```bash
gcloud functions deploy dev_get_employee_certificate_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point get_employee_certificate_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --no-gen2 \
  --region asia-south1 \
  --set-env-vars ENV=development,DB_HOST=...,DB_USER=...,DB_PASS=...,DB_NAME=...,DB_PORT=5432,DB_SCHEMA=skill_matrix_v2_dev
```

### Production

```bash
gcloud functions deploy get_employee_certificate_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point get_employee_certificate_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --no-gen2 \
  --region asia-south1 \
  --set-env-vars ENV=production,DB_HOST=...,DB_USER=...,DB_PASS=...,DB_NAME=...,DB_PORT=5432,DB_SCHEMA=skill_matrix_v2
```

### Cloud Testing

Use `{{frontend_base_url}}/get_employee_certificate_v2` for browser and normal cloud Postman requests in both environments. Development remains unprefixed in the client; frontend runtime `FUNCTIONS_BASE_URL` ending in `/dev_` selects the `dev_` upstream. Send `Authorization: Bearer {{sso_token}}` from app `localStorage.authToken` when end-user identity is needed.

The proxy adds its Google identity token as `X-Serverless-Authorization` and preserves the SSO JWT in `Authorization`. Direct `*.cloudfunctions.net` diagnostics require a Google identity token whose audience is the exact function URL. Localhost needs no GCP identity token.

## Integration Points

### Frontend Usage

**Called from:**
- `frontend/src/context/CertificateContext.jsx` - `fetchEmployeeCertificates(email)`

**Usage:**
```javascript
const response = await axios.post(
  `${BASE_URL}get_employee_certificate_v2`,
  { email }
);
const certificates = response.data.certificates || [];
```

### Data Flow

1. Frontend calls `get_employee_certificate_v2` with employee email
2. Function returns employee certificates with complete details
3. Frontend uses this data to:
   - Display employee certificates in tables
   - Match certificates with master certificates using `mappingId`
   - Allow editing and updating certificates

## Response Field Mapping

| Backend Column | Frontend Field | Description |
|---------------|----------------|-------------|
| `pcm.id` | `mappingId` | Unique identifier for certificate mapping |
| `mc.cert_name` | `certificateName` | Certificate name |
| `mc.cert_level` | `certLevel` | Certificate level (e.g., "Associate") |
| `mc.valid_years` | `validYears` | Validity period in years |
| `mcp.cert_provider` | `certProvider` | Certificate provider (e.g., "AWS") |
| `ec.issued_date` | `issuedDate` | ISO format date when certificate was issued |
| `ec.issued_date.year` | `yearAchieved` | Year extracted from issued date |
| `ec.expiry_date` | `expiryDate` | ISO format expiry date (nullable) |
| `ec.id` | `empCertId` | Employee certificate record ID |

## Differences from V1

1. **SQLAlchemy instead of psycopg2** - Uses ORM for better connection management
2. **Environment variables** - No config.json files, uses `.env` or Cloud Function env vars
3. **V2 schema** - Uses `employee_certificates` table with `certificate_id` referencing `provider_certificate_mapping.id`
4. **Improved error handling** - Specific SQLAlchemy error handling
5. **Better logging** - Structured logging with context
6. **CORS headers** - Explicitly allows Cloud Run frontend origin
7. **Schema prefix** - Uses quoted schema names for safety
8. **mappingId** - Uses `provider_certificate_mapping.id` as unique identifier (replaces hashId)

## Notes

- Only returns active certificates (`mc.is_active = true`)
- Results are ordered by `ec.id`
- Datetime fields are converted to ISO 8601 strings
- `yearAchieved` is extracted from `issuedDate` for frontend compatibility
- Uses `NullPool` for stateless Cloud Functions (no connection reuse)
- All table and column names are quoted to handle case sensitivity
