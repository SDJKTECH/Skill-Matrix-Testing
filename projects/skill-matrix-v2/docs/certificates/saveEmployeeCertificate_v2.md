# save_employee_certificate_v2 Function Documentation

## Overview

`save_employee_certificate_v2` is a Google Cloud Function that saves or updates employee certificates. It handles adding new certificates, updating existing certificates, and deleting removed certificates. The function validates certificate data against master tables and ensures proper mapping between providers and certificates.

**Location**: `backend/certificates/saveEmployeeCertificate_v2/main.py`

**Trigger**: HTTP POST request

**Port (Local Development)**: 8104 (as per deployment comments)

**Database Library**: SQLAlchemy ORM

## Cloud access and authentication

The deployed function is private behind IAM. Test it through `{{frontend_base_url}}/save_employee_certificate_v2`, optionally with `Authorization: Bearer {{sso_token}}`. The token is required only when the frontend proxy enables `REQUIRE_SSO_JWT=true`; IAM protection remains active either way. Direct `cloudfunctions.net` calls are admin diagnostics only and require a Google identity token.

---

## Purpose

This function is the core write operation for employee certificates in the Skill Matrix application. When an employee updates their certificates:

1. The frontend sends the complete list of certificates with their details
2. The function validates certificates against master tables (provider, certificate, mapping)
3. Compares with existing certificates to determine what changed
4. Performs add/update/delete operations efficiently
5. Updates manager relationship if manager email is provided

**Key Features**:

- Efficient add/update/delete operations (only processes changed certificates)
- Validates certificates against master data (provider, certificate, mapping)
- Uses `provider_certificate_mapping.id` (mapping_id) for `employee_certificates.certificate_id`
- Manager relationship management (can update reports_to)
- Transaction-based operations (all-or-nothing)
- Proper date handling (yearAchieved → issued_date, expiryDate parsing)
- **Webhooks**: Automatically fires `EMPLOYEE_CERTIFICATE_UPDATED` Pub/Sub events upon successful modification.

---

## Function Flow

### Entry Point: `save_employee_certificate_v2(request: Request)`

The main Cloud Function handler that processes HTTP requests.

#### 1. CORS Handling

- Handles OPTIONS preflight requests
- Sets CORS headers for allowed origins
- Allows `POST` and `OPTIONS` methods
- Includes `Authorization` header in allowed headers

#### 2. Request Validation

- Validates JSON body is present
- Validates required fields: `email`, `certificates`
- Validates `certificates` is an array
- Normalizes email to lowercase

#### 3. Core Processing

- Calls `save_employee_certificates_v2()` to perform database operations
- Returns result with counts and status

#### 4. Response

- Returns success message with deleted count and upserted count
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
- `DB_SCHEMA` - Database schema (default: "skill_matrix_v2_dev")

### `get_cors_headers(request: Request) -> Dict[str, str]`

Get CORS headers that allow localhost for local development and Cloud Run origins for deployed frontend.

**Parameters**:

- `request` - Flask request object

**Returns**: Dictionary with CORS headers

**Allowed Origins**:

- `http://localhost:5173` - Vite dev server
- `https://skill-matrix-v2-dev-140475459295.asia-south1.run.app` - V2 Dev Cloud Run
- `*` - For any other origin (without credentials)

**CORS Headers**:

- `Access-Control-Allow-Origin`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization`
- `Access-Control-Allow-Credentials: true` (for allowed origins)

### `get_employee_id(email: str, conn) -> Optional[int]`

Gets employee ID from email.

**Parameters**:

- `email` - Employee email address
- `conn` - Database connection

**Returns**: Employee ID or `None` if not found

**Query**: `SELECT id FROM employee WHERE LOWER(email) = LOWER(:email)`

### `get_provider_id(provider_name: str, conn) -> Optional[int]`

Gets provider ID from `master_certificate_provider` by provider name.

**Parameters**:

- `provider_name` - Certificate provider name (e.g., "AWS", "Microsoft")
- `conn` - Database connection

**Returns**: Provider ID or `None` if not found

**Query**: `SELECT id FROM master_certificate_provider WHERE LOWER(cert_provider) = LOWER(:provider_name)`

### `get_certificate_id(cert_name: str, cert_level: Optional[str], conn) -> Optional[int]`

Gets certificate ID from `master_certificate` by name and level.

**Parameters**:

- `cert_name` - Certificate name (e.g., "Solutions Architect")
- `cert_level` - Certificate level (e.g., "Associate", "Professional") or `None`
- `conn` - Database connection

**Returns**: Certificate ID or `None` if not found

**Query Logic**:

- If `cert_level` provided: Matches both `cert_name` and `cert_level` (or NULL level)
- If `cert_level` is `None`: Matches only `cert_name` with NULL level
- Only returns active certificates (`is_active = true`)

### `get_mapping_id(provider_id: int, certificate_id: int, conn) -> Optional[int]`

Gets `provider_certificate_mapping` ID from provider_id and certificate_id.

**Parameters**:

- `provider_id` - Provider ID from `master_certificate_provider`
- `certificate_id` - Certificate ID from `master_certificate`
- `conn` - Database connection

**Returns**: Mapping ID or `None` if not found

**Query**: `SELECT id FROM provider_certificate_mapping WHERE provider_id = :provider_id AND certificate_id = :certificate_id`

**Important**: This mapping ID is what gets saved to `employee_certificates.certificate_id` (not the certificate_id directly).

### `save_employee_certificates_v2(email: str, certificates: List[Dict], manager_email: str = "") -> Dict`

Main function that saves employee certificates.

**Parameters**:

- `email` - Employee email address
- `certificates` - List of certificate dictionaries with:
  - `certProvider` (required) - Provider name
  - `certName` (required) - Certificate name
  - `certLevel` (optional) - Certificate level
  - `yearAchieved` (optional) - Year achieved (converted to `issued_date`)
  - `expiryDate` (optional) - Expiry date (string or date object)
- `manager_email` - Optional manager email to update manager relationship (reports_to)

**Returns**: Dictionary with:

- `message` - Success message
- `deleted_count` - Number of certificates deleted
- `upserted_count` - Number of certificates added/updated
- `warnings` - List of error messages for invalid certificates (if any)

**Process Flow**:

1. Validates environment variables
2. Gets employee ID (raises error if not found)
3. Updates reports_to if manager_email provided
4. Fetches existing employee certificates
5. For each incoming certificate:
   - Validates provider exists → gets `provider_id`
   - Validates certificate exists → gets `certificate_id`
   - Validates mapping exists → gets `mapping_id`
   - Converts `yearAchieved` to `issued_date` (January 1st of that year)
   - Parses `expiryDate` if string
   - Adds to upsert list
6. Deletes certificates not in incoming list
7. Deletes existing certificates being updated
8. Inserts new/updated certificates
9. Commits transaction (or rolls back on error)

**Transaction Management**: Uses `engine.begin()` for automatic transaction management (commit on success, rollback on error).

---

## API

### Endpoint

```
POST /save_employee_certificate_v2
```

### Request

**Method**: `POST` or `OPTIONS` (for CORS preflight)

**Headers**:

- `Origin`: Frontend origin (for CORS)
- `Content-Type`: `application/json`
- `Authorization`: `Bearer {{sso_token}}` (optional unless proxy SSO enforcement is enabled)

**Request Body**:

```json
{
  "email": "employee@example.com",
  "managerEmail": "manager@example.com",
  "certificates": [
    {
      "certProvider": "AWS",
      "certName": "Solutions Architect",
      "certLevel": "Associate",
      "yearAchieved": 2023,
      "expiryDate": "2026-12-31",
      "verified": false,
      "certIdExternal": "AWS-12345"
    },
    {
      "certProvider": "Microsoft",
      "certName": "Azure Fundamentals",
      "certLevel": null,
      "yearAchieved": 2024,
      "expiryDate": null
    }
  ]
}
```

**Field Descriptions**:

- `email` (required): Employee email address
- `managerEmail` (optional): Manager email to update manager relationship
- `certificates` (required): Array of certificate objects
  - `certProvider` (required): Provider name (must exist in `master_certificate_provider`)
  - `certName` (required): Certificate name (must exist in `master_certificate`)
  - `certLevel` (optional): Certificate level (must match `master_certificate.cert_level` or be NULL)
  - `yearAchieved` (optional): Year achieved (converted to `issued_date` as January 1st)
  - `expiryDate` (optional): Expiry date (ISO format string or date object)
  - `verified` (optional): Verification status (not stored in DB, for frontend use)
  - `certIdExternal` (optional): External certificate ID (not stored in DB, for frontend use)

### Response

**Success (200):**

```json
{
  "message": "Certificates processed for employee@example.com",
  "deleted_count": 2,
  "upserted_count": 3,
  "warnings": [
    "Provider 'InvalidProvider' not found in master_certificate_provider",
    "Certificate 'InvalidCert' (level: Associate) not found in master_certificate"
  ]
}
```

**Error (400):**

```json
{
  "error": "Missing required field: email"
}
```

or

```json
{
  "error": "Missing required field: certificates"
}
```

**Error (404):**

```json
{
  "error": "Employee not found for email: employee@example.com"
}
```

**Error (500):**

```json
{
  "error": "Database error: ..."
}
```

or

```json
{
  "error": "Unexpected error message"
}
```

### CORS Headers

The function includes CORS headers to allow requests from:

- `http://localhost:5173` (Vite dev server)
- `https://skill-matrix-v2-dev-140475459295.asia-south1.run.app` (V2 Dev Cloud Run)
- Any other origin (with `*`, but without credentials)

**CORS Headers Set**:

- `Access-Control-Allow-Origin`: Origin or `*`
- `Access-Control-Allow-Methods`: `GET, POST, OPTIONS`
- `Access-Control-Allow-Headers`: `Content-Type, Authorization`
- `Access-Control-Allow-Credentials`: `true` (for allowed origins)
- `Access-Control-Max-Age`: `3600` (for preflight)

---

## Database Interactions

### Tables Used

1. **`employee`**
   - **Purpose**: Get employee ID, update reports_to
   - **Operations**: SELECT, UPDATE
   - **Columns Used**: `id`, `email`, `reports_to`

2. **`master_certificate_provider`**
   - **Purpose**: Validate and get provider ID
   - **Operations**: SELECT
   - **Columns Used**: `id`, `cert_provider`

3. **`master_certificate`**
   - **Purpose**: Validate and get certificate ID
   - **Operations**: SELECT
   - **Columns Used**: `id`, `cert_name`, `cert_level`, `is_active`

4. **`provider_certificate_mapping`**
   - **Purpose**: Get mapping ID (junction table)
   - **Operations**: SELECT
   - **Columns Used**: `id`, `provider_id`, `certificate_id`

5. **`employee_certificates`**
   - **Purpose**: Store employee certificates
   - **Operations**: SELECT, INSERT, DELETE
   - **Columns Used**: `id`, `employee_id`, `certificate_id` (mapping_id), `issued_date`, `expiry_date`, `created_at`, `updated_at`

### Key Relationships

```
employee (1) ──→ (N) employee_certificates
employee_certificates.certificate_id ──→ provider_certificate_mapping.id
provider_certificate_mapping.provider_id ──→ master_certificate_provider.id
provider_certificate_mapping.certificate_id ──→ master_certificate.id
```

**Important**: `employee_certificates.certificate_id` stores the `provider_certificate_mapping.id` (mapping_id), not the `master_certificate.id` directly.

### Database Schema

**Schema Name**: `skill_matrix_v2_dev` (configurable via `DB_SCHEMA` environment variable)

**Table Names**: All use snake_case (v2 schema):

- `employee`
- `master_certificate_provider`
- `master_certificate`
- `provider_certificate_mapping`
- `employee_certificates`

---

## Environment Variables

### Required

- `DB_HOST` - Database host address
- `DB_USER` - Database username
- `DB_PASS` - Database password
- `DB_NAME` - Database name

### Optional

- `DB_PORT` - Database port (default: `5432`)
- `DB_SCHEMA` - Database schema (default: `skill_matrix_v2_dev`)

### Example `.env` File

```env
DB_HOST=34.47.204.166
DB_USER=postgres
DB_PASS=Skillmatrix@123
DB_NAME=Skill_Matrix
DB_SCHEMA=skill_matrix_v2_dev
DB_PORT=5432
```

---

## Error Handling

### Validation Errors

- **Missing email**: Returns 400 with error message
- **Missing certificates**: Returns 400 with error message
- **Employee not found**: Returns 404 with error message
- **Invalid certificate data**: Logs warning, adds to `warnings` array, continues processing other certificates

### Database Errors

- **SQLAlchemyError**: Catched and returns 500 with error message
- **Transaction errors**: Automatic rollback via `engine.begin()` context manager
- **Connection errors**: Handled by SQLAlchemy, returns 500

### Processing Errors

- **Invalid provider**: Logs warning, adds to `warnings`, skips certificate
- **Invalid certificate**: Logs warning, adds to `warnings`, skips certificate
- **Missing mapping**: Logs warning, adds to `warnings`, skips certificate
- **Invalid date format**: Logs warning, continues with NULL date

---

## Usage Examples

### Example 1: Add New Certificates

**Request**:

```json
{
  "email": "john.doe@example.com",
  "certificates": [
    {
      "certProvider": "AWS",
      "certName": "Solutions Architect",
      "certLevel": "Associate",
      "yearAchieved": 2023,
      "expiryDate": "2026-12-31"
    }
  ]
}
```

**Response**:

```json
{
  "message": "Certificates processed for john.doe@example.com",
  "deleted_count": 0,
  "upserted_count": 1
}
```

### Example 2: Update Existing Certificates

**Request**:

```json
{
  "email": "john.doe@example.com",
  "certificates": [
    {
      "certProvider": "AWS",
      "certName": "Solutions Architect",
      "certLevel": "Professional",
      "yearAchieved": 2024,
      "expiryDate": "2027-12-31"
    }
  ]
}
```

**Response**:

```json
{
  "message": "Certificates processed for john.doe@example.com",
  "deleted_count": 1,
  "upserted_count": 1
}
```

### Example 3: Delete Certificates

**Request**:

```json
{
  "email": "john.doe@example.com",
  "certificates": []
}
```

**Response**:

```json
{
  "message": "Certificates processed for john.doe@example.com",
  "deleted_count": 2,
  "upserted_count": 0
}
```

### Example 4: Invalid Certificate (Warning)

**Request**:

```json
{
  "email": "john.doe@example.com",
  "certificates": [
    {
      "certProvider": "InvalidProvider",
      "certName": "InvalidCert",
      "certLevel": "Associate"
    }
  ]
}
```

**Response**:

```json
{
  "message": "Certificates processed for john.doe@example.com",
  "deleted_count": 0,
  "upserted_count": 0,
  "warnings": [
    "Provider 'InvalidProvider' not found in master_certificate_provider",
    "Certificate 'InvalidCert' (level: Associate) not found in master_certificate"
  ]
}
```

---

## Deployment

Deployment and IAM changes belong in `skill-matrix-deploy`. The function is private; the frontend Cloud Run runtime service account receives `roles/run.invoker`.

### Development

```bash
gcloud functions deploy dev_save_employee_certificate_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point save_employee_certificate_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --no-gen2 \
  --region asia-south1 \
  --set-secrets DB_DEV_V2=DB_DEV_V2:latest
```

### Production

```bash
gcloud functions deploy save_employee_certificate_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point save_employee_certificate_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --no-gen2 \
  --region asia-south1 \
  --set-secrets DB_PROD_V2=DB_PROD_V2:latest
```

### Local Testing

```bash
functions-framework --target=save_employee_certificate_v2 --debug --port=8104
```

**Test URL**: `http://127.0.0.1:8104/`

For browser and normal cloud Postman testing, use `{{frontend_base_url}}/save_employee_certificate_v2`. Development remains unprefixed in the client; frontend runtime `FUNCTIONS_BASE_URL` ending in `/dev_` selects the `dev_` upstream. Send `Authorization: Bearer {{sso_token}}` from app `localStorage.authToken` when end-user identity is needed.

The frontend proxy adds its Google identity token as `X-Serverless-Authorization` and preserves the SSO JWT in `Authorization`. Direct `*.cloudfunctions.net` diagnostics require a Google identity token whose audience is the exact function URL. Localhost needs no GCP identity token.

**Test with curl**:

```bash
curl -X POST http://127.0.0.1:8104/ \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "managerEmail": "manager@example.com",
    "certificates": [
      {
        "certProvider": "AWS",
        "certName": "Solutions Architect",
        "certLevel": "Associate",
        "yearAchieved": 2023,
        "expiryDate": "2026-12-31"
      }
    ]
  }'
```

---

## Frontend Integration

### Frontend Endpoint

The frontend calls this function via:

```javascript
axios.post(`${BASE_URL}save_employee_certificate_v2`, {
  email: user.email,
  managerEmail: user.managerEmail,
  certificates: certificateList,
});
```

### Frontend Context

This function is called from `CertificateContext.jsx` in the `saveEmployeeCertificates` function.

### Data Mapping

**Frontend → Backend**:

- `certProvider` → `certProvider` (validated against `master_certificate_provider`)
- `certName` → `certName` (validated against `master_certificate`)
- `certLevel` → `certLevel` (validated against `master_certificate.cert_level`)
- `yearAchieved` → `issued_date` (converted to January 1st of that year)
- `expiryDate` → `expiryDate` (parsed if string)

**Backend → Frontend**:

- `message` → Display success message
- `deleted_count` → Show number of deleted certificates
- `upserted_count` → Show number of saved certificates
- `warnings` → Display warnings for invalid certificates

---

## Differences from v1

1. **Schema**: Uses snake_case table/column names (v2 schema) instead of PascalCase
2. **Database Library**: Uses SQLAlchemy ORM instead of `psycopg2` directly
3. **Configuration**: Uses environment variables instead of config files
4. **Certificate Mapping**: Uses `provider_certificate_mapping.id` (mapping_id) instead of direct certificate_id
5. **Manager Relationship**: Uses `reports_to` (foreign key) instead of `manager_email` string
6. **Error Handling**: Improved error handling with SQLAlchemy exceptions
7. **CORS**: Proper CORS headers with allowed origins
8. **Transaction Management**: Uses SQLAlchemy's `engine.begin()` for automatic transaction management

---

## Notes

- The function processes certificates in a transaction (all-or-nothing)
- Invalid certificates are logged as warnings but don't fail the entire operation
- The function compares incoming certificates with existing ones to determine what to add/update/delete
- `yearAchieved` is converted to `issued_date` as January 1st of that year
- `expiryDate` can be provided as a string (ISO format) or date object
- The function validates that provider-certificate mappings exist before saving
- Manager relationship is only updated if `manager_email` is provided and the manager exists in the reports_to field

---

## Related Functions

- **`getEmployeeCertificate_v2`**: Fetches employee certificates (read operation)
- **`getCertificateMapping_v2`**: Fetches all available certificate mappings (master catalog)
- **`saveEmployeeSkill_v2`**: Similar save operation for employee skills (with approval workflow)
