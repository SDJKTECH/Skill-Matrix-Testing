# getCertificateMapping_v2

## Overview

Google Cloud Function that fetches certificate mappings from the `ProviderCertificateMapping` table. It joins with `MasterCertificateProvider` and `MasterCertificate` tables to return complete mapping details including provider name, certificate name, level, validity years, and other metadata.

## Purpose

This function provides the complete certificate catalog (master data) for the frontend, showing all available certificate mappings with their associated providers and certificate details. This is used to populate certificate selection dropdowns and display certificate information throughout the application.

## Cloud access and authentication

The deployed function is private behind IAM. Test it through `{{frontend_base_url}}/get_certificate_mapping_v2`. `Authorization: Bearer {{sso_token}}` is optional unless `REQUIRE_SSO_JWT=true` is enabled on the frontend proxy. The proxy attaches its Google identity token; direct `cloudfunctions.net` calls are admin diagnostics only and require a Google identity token.

## Function Flow

```
1. Receive HTTP request (GET or OPTIONS)
2. Handle CORS preflight (OPTIONS)
3. Validate environment variables
4. Connect to database using SQLAlchemy
5. Execute query joining:
   - ProviderCertificateMapping (pcm)
   - MasterCertificateProvider (mcp)
   - MasterCertificate (mc)
6. Convert results to JSON-serializable format
7. Return array of certificate mappings
```

## API

### Endpoint

```
GET /get_certificate_mapping_v2
```

### Request

**Method:** `GET` or `OPTIONS` (for CORS preflight)

**Headers:**
- `Origin`: Frontend origin (for CORS)
- `Content-Type`: `application/json` (optional)

**Query Parameters:** None

**Request Body:** None

### Response

**Success (200):**
```json
[
  {
    "mappingId": 1,
    "providerId": 1,
    "certificateId": 1,
    "createdAt": "2024-01-01T00:00:00",
    "updatedAt": "2024-01-01T00:00:00",
    "providerTableId": 1,
    "certProvider": "AWS",
    "providerCreatedAt": "2024-01-01T00:00:00",
    "providerUpdatedAt": "2024-01-01T00:00:00",
    "certificateTableId": 1,
    "certName": "AWS Certified Solutions Architect",
    "certLevel": "Associate",
    "validYears": 3,
    "isActive": true,
    "certificateCreatedAt": "2024-01-01T00:00:00",
    "certificateUpdatedAt": "2024-01-01T00:00:00"
  },
  ...
]
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

1. **ProviderCertificateMapping** (`pcm`)
   - `id` (mappingId)
   - `provider_id`
   - `certificate_id`
   - `created_at`
   - `updated_at`

2. **MasterCertificateProvider** (`mcp`)
   - `id` (providerTableId)
   - `certprovider` (certProvider)
   - `created_at`
   - `updated_at`

3. **MasterCertificate** (`mc`)
   - `id` (certificateTableId)
   - `certname` (certName)
   - `certlevel` (certLevel)
   - `validyears` (validYears)
   - `isactive` (isActive)
   - `created_at`
   - `updated_at`

### Query

```sql
SELECT 
    pcm.id AS "mappingId",
    pcm.provider_id AS "providerId",
    pcm.certificate_id AS "certificateId",
    pcm.created_at AS "createdAt",
    pcm.updated_at AS "updatedAt",
    mcp.id AS "providerTableId",
    mcp.certprovider AS "certProvider",
    mcp.created_at AS "providerCreatedAt",
    mcp.updated_at AS "providerUpdatedAt",
    mc.id AS "certificateTableId",
    mc.certname AS "certName",
    mc.certlevel AS "certLevel",
    mc.validyears AS "validYears",
    mc.isactive AS "isActive",
    mc.created_at AS "certificateCreatedAt",
    mc.updated_at AS "certificateUpdatedAt"
FROM "{schema}".ProviderCertificateMapping pcm
JOIN "{schema}".MasterCertificateProvider mcp ON mcp.id = pcm.provider_id
JOIN "{schema}".MasterCertificate mc ON mc.id = pcm.certificate_id
ORDER BY pcm.id
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

2. **`fetch_certificate_mapping()`**
   - Validates required environment variables
   - Executes SQL query with schema prefix
   - Returns list of dictionaries

3. **`get_certificate_mapping_v2(request)`**
   - Entry point for Cloud Function
   - Handles CORS preflight
   - Converts datetime objects to ISO strings
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

1. **Missing Environment Variables**
   - Returns `ValueError` with list of missing variables
   - Logged as error

2. **Database Errors (SQLAlchemyError)**
   - Caught and logged with full stack trace
   - Returns 500 with error message

3. **Unexpected Errors**
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
functions-framework --target=get_certificate_mapping_v2 --source main.py --debug --port=8100
```

4. Test the endpoint:
```bash
curl http://127.0.0.1:8100/
```

### Testing

**Test with curl:**
```bash
curl -X GET http://127.0.0.1:8100/ \
  -H "Origin: http://localhost:5173"
```

**Test CORS preflight:**
```bash
curl -X OPTIONS http://127.0.0.1:8100/ \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: GET" \
  -v
```

## Deployment

Deployment and IAM changes belong in `skill-matrix-deploy`. The function is private; the frontend Cloud Run runtime service account receives `roles/run.invoker`.

### Development

```bash
gcloud functions deploy dev_get_certificate_mapping_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point get_certificate_mapping_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --no-gen2 \
  --region asia-south1 \
  --set-env-vars ENV=development,DB_HOST=...,DB_USER=...,DB_PASS=...,DB_NAME=...,DB_PORT=5432,DB_SCHEMA=skill_matrix_v2_dev
```

### Production

```bash
gcloud functions deploy get_certificate_mapping_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point get_certificate_mapping_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --no-gen2 \
  --region asia-south1 \
  --set-env-vars ENV=production,DB_HOST=...,DB_USER=...,DB_PASS=...,DB_NAME=...,DB_PORT=5432,DB_SCHEMA=skill_matrix_v2
```

### Cloud Testing

Use `{{frontend_base_url}}/get_certificate_mapping_v2` for browser and normal cloud Postman requests. Development uses the same unprefixed path; frontend runtime `FUNCTIONS_BASE_URL` ending in `/dev_` maps it upstream. This pre-login read can remain legacy-compatible with `REQUIRE_SSO_JWT` unset, while IAM still keeps the function private. If sent, use `Authorization: Bearer {{sso_token}}` from app `localStorage.authToken`.

The proxy adds its Google identity token as `X-Serverless-Authorization`. Direct `*.cloudfunctions.net` diagnostics require a Google identity token whose audience is the exact function URL; an SSO token alone is insufficient. Localhost needs no GCP identity token.

## Integration Points

### Frontend Usage

**Called from:**
- `frontend/src/context/CertificateContext.jsx` - `fetchMasterCertificates()`

**Usage:**
```javascript
const response = await axios.get(`${BASE_URL}get_certificate_mapping_v2`);
const mappings = response.data;
```

### Data Flow

1. Frontend calls `get_certificate_mapping_v2` on app load
2. Function returns all certificate mappings with provider and certificate details
3. Frontend uses this data to:
   - Populate certificate selection dropdowns
   - Display certificate information
   - Match employee certificates with master certificates

## Differences from V1

1. **SQLAlchemy instead of psycopg2** - Uses ORM for better connection management
2. **Environment variables** - No config.json files, uses `.env` or Cloud Function env vars
3. **Improved error handling** - Specific SQLAlchemy error handling
4. **Better logging** - Structured logging with context
5. **CORS headers** - Explicitly allows Cloud Run frontend origin
6. **Schema prefix** - Uses quoted schema names for safety

## Notes

- Returns all certificate mappings (no filtering)
- Results are ordered by `pcm.id`
- Datetime fields are converted to ISO 8601 strings
- Uses `NullPool` for stateless Cloud Functions (no connection reuse)
- All table and column names are quoted to handle case sensitivity
