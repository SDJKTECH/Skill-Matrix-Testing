# Get Employee Skills Info API

**Endpoint**: `backend/employee/getEmployeeSkillsInfo_v2`

## Description

This API returns a summary view of an employee's skill ecosystem. Specifically, it counts the total number of 'Active Skills' (Approved) and 'Pending Approvals' (Pending) from the `employee_skills` table, and it returns the name of their most recently acquired certification.

## Cloud access and authentication

The deployed function is private behind IAM. Use `{{frontend_base_url}}/get_employee_skills_info` for cloud tests and optionally send `Authorization: Bearer {{sso_token}}`. The token is required only when `REQUIRE_SSO_JWT=true` is enabled on the frontend proxy. Direct `cloudfunctions.net` calls are admin diagnostics only and require a Google identity token.

**Method:** `GET`

### Query Parameters
- `employee_id` (integer) [REQUIRED]: The unique ID of the employee.

---

## Response 

**Success Response (200 OK):**
```json
{
  "active_skills_count": 10,
  "pending_approval_count": 2,
  "recent_certificate_name": "Google Cloud Professional Architect"
}
```
*(If the user has no recent certificate, `recent_certificate_name` will be returned as `null`)*

**Error Responses:**
- `400 Bad Request`: If `employee_id` is missing or invalid.
- `405 Method Not Allowed`: If a request sent is not a `GET` request.

---

## Local Testing

First install dependencies inside `backend/employee/getEmployeeSkillsInfo_v2`:
```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

Run functions-framework:
```bash
functions-framework --target=get_employee_skills_info --debug --port=8106
```

Test against it using cURL or Postman:
```bash
curl -X GET "http://127.0.0.1:8106/?employee_id=1"
```

---

## Deployment Commands

Cloud deployment/IAM belongs in `skill-matrix-deploy`. The function is private and invoked by the frontend Cloud Run runtime service account with `roles/run.invoker`.

**Development**
```bash
gcloud functions deploy dev_get_employee_skills_info \
  --runtime python311 \
  --trigger-http \
  --entry-point get_employee_skills_info \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=development
```

**Production**
```bash
gcloud functions deploy get_employee_skills_info \
  --runtime python311 \
  --trigger-http \
  --entry-point get_employee_skills_info \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --no-gen2 \
  --region asia-south1 \
  --set-env-vars ENV=production
```

## Cloud Testing

Use `{{frontend_base_url}}/get_employee_skills_info` for browser and normal cloud Postman requests in both environments. The cloud-development client path remains unprefixed; frontend runtime `FUNCTIONS_BASE_URL` ending in `/dev_` maps it to `dev_get_employee_skills_info`. Send `Authorization: Bearer {{sso_token}}` from app `localStorage.authToken` when end-user identity is needed.

The proxy adds its Google identity token as `X-Serverless-Authorization` and preserves the SSO JWT in `Authorization`. Direct `*.cloudfunctions.net` diagnostics require a Google identity token whose audience is the exact function URL. The localhost example above needs no GCP identity token.
