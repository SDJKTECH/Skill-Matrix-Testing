# Get Training Analytics

**Endpoint**: `backend/reports/getTrainingAnalytics_v2`

## Description
Returns raw records as JSON (not Excel) for the Training Analytics admin dashboard, which aggregates/cross-filters client-side. The `mode` query param selects the dataset:

- `mode=training` (default) — one row per `employee_trainings` entry, joined with its batch's area/sub-area/module/quarter names. Records with no batch are excluded (nothing to plot).
- `mode=certificates` — one row per `employee_certificates` entry, joined with its cert name/provider/level. Certificates have no batch/hierarchy link, so this dataset can't be cross-filtered by Area/Sub Area/Module/Batch Quarter.

**Cloud access**: Private IAM through the frontend proxy. Report-level SSO enforcement is optional via `REQUIRE_SSO_AUTH=true`.

---

## GET: Fetch Records

*   **Request**: `GET`
    *   **Query param**: `mode` — `training` (default) or `certificates`.
*   **Success Response (200 OK)**:
    *   **Content-Type**: `application/json`
    *   **Body (`mode=training`)**:
        ```json
        {
          "count": 860,
          "records": [
            {
              "employee_training_id": 1,
              "employee_id": 7,
              "training_status": "Completed",
              "status_remarks": null,
              "employee_type": "Existing Lateral",
              "batch_id": 42,
              "batch_num": "B-2023-042",
              "batch_desc": "Customer interaction refresher",
              "area_id": 5,
              "area_name": "Others",
              "sub_area_name": "Customer Interaction",
              "module_name": "Behavioral Training",
              "training_quarter": "2023-Q2",
              "batch_status": "Completed"
            }
          ]
        }
        ```
    *   **Body (`mode=certificates`)**:
        ```json
        {
          "count": 42,
          "records": [
            {
              "employee_certificate_id": 3,
              "employee_id": 7,
              "cert_name": "AWS Certified Solutions Architect",
              "cert_provider": "Amazon Web Services",
              "cert_level": "Professional",
              "valid_years": 3,
              "issued_date": "2024-01-15",
              "expiry_date": "2027-01-15"
            }
          ]
        }
        ```
*   **Error Response (400)**: `{"error": "Invalid mode '<value>'. Expected 'training' or 'certificates'."}`
*   **Error Response (500)**: `{"error": "Database error occurred"}` or `{"error": "<message>"}`.

---

## Local Testing

```bash
# 1. navigate to backend/reports/getTrainingAnalytics_v2
# 2. Set up .env
# 3. Run:
functions-framework --target=get_training_analytics_v2 --source main.py --debug --port=8097
```

Test URLs: `http://127.0.0.1:8097/` and `http://127.0.0.1:8097/?mode=certificates`

## Cloud Testing

Use `{{frontend_base_url}}/get_training_analytics_v2` for browser and normal cloud Postman testing in both environments. Development remains unprefixed in the client; frontend runtime `FUNCTIONS_BASE_URL` ending in `/dev_` selects `dev_get_training_analytics_v2`. When SSO enforcement is enabled, send `Authorization: Bearer {{sso_token}}` using `localStorage.authToken`.

The frontend runtime service account has `roles/run.invoker`; the proxy adds its Google identity token as `X-Serverless-Authorization` and preserves the SSO JWT in `Authorization`. Direct `*.cloudfunctions.net` diagnostics require a Google identity token with the exact function URL as audience.

## Deployment Commands

Deployment and IAM changes belong in `skill-matrix-deploy`; these examples intentionally omit any public-invoker flag.

### Development
```bash
gcloud functions deploy dev_get_training_analytics_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point get_training_analytics_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=development
```

### Production
```bash
gcloud functions deploy get_training_analytics_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point get_training_analytics_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=production
```
