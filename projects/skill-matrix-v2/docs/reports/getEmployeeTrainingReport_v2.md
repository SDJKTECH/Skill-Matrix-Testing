# Get Employee Training Report

**Endpoint**: `backend/reports/getEmployeeTrainingReport_v2`

## Description
Generates an Excel report providing a comprehensive view of all employee training sessions.
It joins employee data with their registered trainings, including the area name, sub-area name, module name, batch (batch number, description, status, training mode, trainer, schedule, duration, size, prerequisite, content, resources), competency, training status, employee type, start date, and end date.

**Note**: The report outputs raw, unmerged tabular data where employee details (like Employee ID, Name, and Email) repeat on each row, ensuring compatibility with standard data sorting and filtering tools.
**Cloud access**: Private IAM through the frontend proxy. Report-level SSO enforcement is optional; set `REQUIRE_SSO_AUTH=true` for end-user validation or leave it unset for legacy-compatible pre-login reads. Existing Admin/HR business restrictions remain unchanged.

---

## GET/POST: Generate Report
*   **Request**: `GET` or `POST`
    *   No parameters required.
*   **Success Response (200 OK)**:
    *   **Content-Type**: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
    *   **Body**: Binary Excel file (`EmployeeTrainingReport_<timestamp>.xlsx`).

---

## Local Testing

```bash
# 1. navigate to backend/reports/getEmployeeTrainingReport_v2
# 2. Set up .env
# 3. Run:
functions-framework --target=get_employee_training_report_v2 --source main.py --debug --port=8086
```

Test URL: `http://127.0.0.1:8086/`

## Cloud Testing

Use `{{frontend_base_url}}/get_employee_training_report_v2` for browser and normal cloud Postman testing in both environments. Development remains unprefixed in the client; frontend runtime `FUNCTIONS_BASE_URL` ending in `/dev_` selects `dev_get_employee_training_report_v2`. When SSO enforcement is enabled, send `Authorization: Bearer {{sso_token}}` using `localStorage.authToken`.

The frontend runtime service account has `roles/run.invoker`; the proxy adds its Google identity token as `X-Serverless-Authorization` and preserves the SSO JWT in `Authorization`. Direct `*.cloudfunctions.net` diagnostics require a Google identity token with the exact function URL as audience.

## Deployment Commands

Deployment and IAM changes belong in `skill-matrix-deploy`; these examples intentionally omit any public-invoker flag.

### Development
```bash
gcloud functions deploy dev_get_employee_training_report_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point get_employee_training_report_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=development
```

### Production
```bash
gcloud functions deploy get_employee_training_report_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point get_employee_training_report_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=production
```
