# Get Employee Skills Report (Detailed)

**Endpoint**: `backend/reports/getEmployeeSkillsReport_v2`

## Description
Generates a detailed Excel report of all employee skills.
The report includes:
- Employee Details (ID, Name, Email, Manager Email)
- Skill Details (Domain, Discipline, Skill Area, Framework)
**Key Feature**: Raw Tabular Data.
- The report outputs unmerged tabular data where employee details (like Employee ID, Name, and Email) repeat on each row, ensuring compatibility with standard data sorting and filtering tools.


**Cloud access**: Private IAM through the frontend proxy. Report-level SSO enforcement is optional; set `REQUIRE_SSO_AUTH=true` for end-user validation or leave it unset for legacy-compatible pre-login reads.

---

## GET/POST: Generate Report
*   **Request**: `GET` or `POST`
    *   No parameters required.
*   **Success Response (200 OK)**:
    *   **Content-Type**: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
    *   **Body**: Binary Excel file (`EmployeeSkillsReport.xlsx`).

---

## Local Testing

```bash
# 1. navigate to backend/reports/getEmployeeSkillsReport_v2
# 2. Set up .env
# 3. Run:
functions-framework --target=get_employee_skills_report_v2 --source main.py --debug --port=8084
```

Test URL: `http://127.0.0.1:8084/`

## Cloud Testing

Use `{{frontend_base_url}}/get_employee_skills_report_v2` for browser and normal cloud Postman testing in both development and production. Development remains unprefixed in the client; frontend runtime `FUNCTIONS_BASE_URL` ending in `/dev_` selects `dev_get_employee_skills_report_v2`. When SSO enforcement is enabled, send `Authorization: Bearer {{sso_token}}` using the app's `localStorage.authToken`.

The frontend Cloud Run runtime service account invokes the private function with `roles/run.invoker`. Its Google identity token is added server-side as `X-Serverless-Authorization`, while the SSO JWT remains in `Authorization`. Direct `*.cloudfunctions.net` testing is for platform administrators only and requires a Google identity token whose audience is the exact function URL.

## Deployment Commands

Deployment and IAM changes belong in `skill-matrix-deploy`; these examples intentionally omit any public-invoker flag.

### Development
```bash
gcloud functions deploy dev_get_employee_skills_report_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point get_employee_skills_report_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=development
```

### Production
```bash
gcloud functions deploy get_employee_skills_report_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point get_employee_skills_report_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=production
```
