# Add Certificate API (V2)

**Endpoint**: `backend/data/add_certificate_v2`

## Description
Consolidated API to create a complete Certificate Ecosystem entry. This single endpoint handles the creation or retrieval of:
1.  **Master Certificate Provider**
2.  **Master Certificate**
3.  **Provider-Certificate Mapping**

It uses a "Get or Create" pattern, meaning it will reuse existing Providers and Certificates if they match the input, preventing duplicates.

**Authorization**: Requires an `employee_id` belonging to a user with role `dept` (Department), `admin`, or `hr`.

**Webhooks**: Dispatches `CERTIFICATE_MAPPING_UPDATED` events to any configured listeners via Google Cloud Pub/Sub upon successful creation, update, deletion, or bulk-upload of certificates.

## Cloud access and authentication

The deployed function is private behind IAM. Use `{{frontend_base_url}}/add_certificate_v2` for cloud tests and optionally send `Authorization: Bearer {{sso_token}}`. The token becomes required only when `REQUIRE_SSO_JWT=true` is enabled on the frontend proxy. Direct `cloudfunctions.net` calls are admin diagnostics only and require a Google identity token.

---

## GET: List All Certificates / Get details
*   **Request**: `GET`
    *   List all: `GET /`
    *   Get One: `GET /?id=5`
*   **Success Response (200 OK)**:
    ```json
    [
      {
        "id": 5, // Mapping ID
        "providerId": 2,
        "certProvider": "Google Cloud",
        "certificateId": 15,
        "certName": "Professional Cloud Architect",
        "certLevel": "Professional",
        "validYears": 3,
        "isActive": true,
        "createdAt": "...",
        "updatedAt": "..."
      }
    ]
    ```

## POST: Add Certificate Entry
*   **Request**: `POST`
    ```json
    {
      "employee_id": 1,                // Required: Authorized User ID
      "certProvider": "Google Cloud",  // Required
      "certName": "Professional Cloud Architect", // Required
      "certLevel": "Professional",     // Required
      "validYears": 3,                 // Optional (Default: 0)
      "isActive": true                 // Optional (Default: true)
    }
    ```

*   **Success Response (201 Created)**:
    Returns the IDs of all entities involved.
    ```json
    {
      "message": "Certificate ecosystem entry processed successfully",
      "mapping_id": 5,
      "provider_id": 2,
      "certificate_id": 15
    }
    ```

## PUT: Update Certificate Entry
*   **Request**: `PUT`
    ```json
    {
      "id": 5,                         // Required: Mapping ID
      "employee_id": 1,                // Required: Authorized User ID
      "certProvider": "AWS",           // Optional: Update Provider
      "certName": "Solutions Architect", // Optional: Update Cert (Must provide Level too)
      "certLevel": "Associate"         // Optional: Update Level (Must provide Name too)
    }
    ```
    *Note: Updates modify the mapping to point to new/existing Provider or Certificate. It does NOT modify the Master records if they are shared.*

*   **Success Response (200 OK)**:
    ```json
    {
      "message": "Certificate entry updated successfully",
      "mapping_id": 5,
      "provider_id": 3,
      "certificate_id": 16
    }
    ```

## DELETE: Delete Certificate Entry
*   **Request**: `DELETE`
    *   Query Param: `?id=5&employee_id=1`
    *   OR Body: `{"id": 5, "employee_id": 1}`
*   **Success Response (200 OK)**:
    ```json
    { "message": "Certificate entry deleted" }
    ```

*   **Error Response (400 Bad Request)**:
    *   Missing Fields:
        ```json
        { "error": "Missing required fields: ..." }
        ```
    *   Unauthorized Role:
        ```json
        { "error": "Access denied... Only ['dept', 'department', 'admin', 'hr'] roles are allowed..." }
        ```

---

## POST: Bulk Add Certificates
*   **Request**: `POST /bulk-upload` (multipart/form-data)
    *   `file`: The CSV or Excel file containing certificates.
    *   `employee_id`: The authorized user ID.
*   **Headers**: `multipart/form-data`
*   **Success Response**: `200 OK` (fully successful) or `207 Multi-Status` (partial success with errors)
    ```json
    {
      "message": "Bulk upload completed",
      "successful_inserts": 2,
      "skipped_existing": 1,
      "errors": [
        {
          "row": 3,
          "error": "Missing Certificate Provider or Certificate Name"
        }
      ],
      "total_rows": 4
    }
    ```

---

## Scenarios

### 1. Completely New Entry
*   **Input**: New Provider, New Certificate.
*   **Action**: Creates Provider, Creates Certificate, Creates Mapping. Appends Excel Row.
*   **Result**: 201 Created (New IDs for all).

### 2. Existing Provider, New Certificate
*   **Input**: "Google Cloud" (Existing), "New Cert".
*   **Action**: Reuses Provider ID, Creates Certificate, Creates Mapping. Appends Excel Row.
*   **Result**: 201 Created (Existing Provider ID, New Cert ID).

### 3. Existing Provider, Existing Certificate (New Mapping)
*   **Input**: "Google Cloud", "Existing Cert".
*   **Action**: Reuses Provider ID, Reuses Certificate ID, Creates Mapping. Appends Excel Row.
*   **Result**: 201 Created.

### 4. Duplicate Request (Idempotency)
*   **Input**: Same data sent twice.
*   **Action**: Finds all entities (including Mapping). Excel append acts as a No-Op to prevent duplicates.
*   **Result**: 201 Created (Returns the same IDs).

---

## GCS Bucket Synchronization (Incremental & Robust)

This API maintains a synchronized `.xlsx` mapping in Google Cloud Storage (`BUCKET_NAME / master-certificate-mapping/Master_Certificates.xlsx`). The operations are performed iteratively to optimize performance and prevent destructive overwrites:

*   **POST** (Single): Uses `sync_excel_append_row` to non-destructively push exactly one row to the bottom of the existing spreadsheet, utilizing `mapping_id` to halt duplicate pushes.
*   **PUT**: Uses `sync_excel_update_row` to selectively overwrite only the columns inside the specific row corresponding to the patched `mapping_id`.
*   **DELETE**: Uses `sync_excel_delete_row` to slice out only the target `mapping_id`. Additionally automatically sweeps for orphaned master provider/certificates unassigned in any mappings and deletes them.
*   **POST** (Bulk): Rather than syncing 1 by 1 resulting in throttling, bulk inserts tally successful rows locally, and execute a full background `sync_excel_full_reexport` only once upon successful completion. Note that a timestamped backup of the previous Excel is stored via `_write_excel_to_gcs` before any full export.

---

## Local Testing

```bash
functions-framework --target=add_certificate_v2 --debug
```

## Deployment Commands

Deployment and IAM changes belong in `skill-matrix-deploy`. The function is private; the frontend Cloud Run runtime service account receives `roles/run.invoker`.

### Development
```bash
gcloud functions deploy dev_add_certificate_v2 \
  --runtime python311 \
  --trigger-http \
  --entry-point add_certificate_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=development
```

### Production
```bash
gcloud functions deploy add_certificate_v2 \
  --runtime python311 \
  --trigger-http \
  --entry-point add_certificate_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --no-gen2 \
  --region asia-south1 \
  --set-env-vars ENV=production
```

## Cloud Testing

Use `{{frontend_base_url}}/add_certificate_v2` for browser and normal cloud Postman requests in both environments. Development remains unprefixed in the client; frontend runtime `FUNCTIONS_BASE_URL` ending in `/dev_` selects `dev_add_certificate_v2`. Send `Authorization: Bearer {{sso_token}}` from app `localStorage.authToken` when end-user identity is needed.

The proxy adds its Google identity token server-side as `X-Serverless-Authorization` and preserves the SSO JWT in `Authorization`. Direct `*.cloudfunctions.net` diagnostics require a Google identity token whose audience is the exact function URL. Local functions-framework requests need no GCP identity token.
