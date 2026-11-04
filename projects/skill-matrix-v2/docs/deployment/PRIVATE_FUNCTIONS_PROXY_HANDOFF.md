# Handoff: private Cloud Functions + frontend proxy (skill-matrix-deploy)

> **Full workflow doc (dev + prod):** [ORG_POLICY_WORKFLOW_DEV_PROD.md](./ORG_POLICY_WORKFLOW_DEV_PROD.md)

Application code in this repo now expects production traffic to be:

```
JKTech user
  → Microsoft SSO (jktech-auth-gateway)
  → Skill Matrix frontend (Cloud Run)  ← same-origin browser calls
       server.mjs validates SSO JWT + attaches Google identity token
  → Cloud Functions / Cloud Run APIs (private, no allUsers)
```

Users stay on Azure AD only. Do **not** add JKTech employees as GCP users. Do **not** grant `allUsers` invoker or request an org-policy exception for public functions.

## What skill-matrix-deploy must do

### 1. Deploy functions as private
- Remove `--allow-unauthenticated` from Skill Matrix function deploys (prod and, ideally, shared-dev).
- Remove any existing `allUsers` → `roles/run.invoker` (or `cloudfunctions.invoker`) bindings on these services.

Include at least the report APIs used by the UI:
- `get_employee_skill_matrix_report_v2`
- `get_employee_skills_report_v2`
- `get_employee_certificate_report_v2`
- `get_employee_training_report_v2`
- `get_training_analytics_v2`

…plus the rest of the Skill Matrix HTTP functions the frontend calls.

### 2. Grant invoker only to the frontend/proxy runtime SA
On each function/service:

| Field | Value |
|--------|--------|
| member | `serviceAccount:<FRONTEND_CLOUD_RUN_SA>@training-project-419308.iam.gserviceaccount.com` |
| role | `roles/run.invoker` |

Use the **Cloud Run runtime service account** of the Skill Matrix frontend service (the identity that calls the metadata server from `frontend/server.mjs`).

### 3. Frontend Cloud Run env (runtime, not build secrets)
Set on the frontend service:

| Env | Example |
|-----|---------|
| `FUNCTIONS_BASE_URL` | `https://asia-south1-training-project-419308.cloudfunctions.net/` (prod) or `…/dev_` (dev-prefixed names) |
| `SSO_VERIFY_URL` | `https://jktech-auth-gateway-140475459295.asia-south1.run.app/verify` |

User-level JWT enforcement is **opt-in** and off by default, because the app performs some reads before login:

| Env | Where | Effect |
|-----|-------|--------|
| `REQUIRE_SSO_JWT=true` | frontend service | Proxy rejects API calls without a gateway-verified JWT |
| `REQUIRE_SSO_AUTH=true` | report functions | Function rejects requests without a gateway-verified JWT |

Leave both unset to keep behaviour identical to before, with privacy enforced by IAM alone. `SKIP_GOOGLE_ID_TOKEN` is local-container debugging only.

### 4. Frontend build args
Prefer `VITE_BASE_URL=/` (or empty). Absolute `*.cloudfunctions.net` values are ignored by the app so the browser always uses same-origin paths; the container proxy performs the upstream call.

Keep `VITE_SSO_URL` pointing at the existing auth gateway.

### 5. Package `backend/utils` with report (and other) function deploys
Report functions import `utils.sso_auth` for Bearer/SSO verification. Ensure deploy packaging includes `backend/utils/` on `PYTHONPATH` (same pattern as `event_publisher` for other functions).

### 6. Do not change auth product model
- SSO remains Azure AD via `jktech-auth-gateway`.
- No GCP end-user accounts for employees.
- No IAP/Workforce Identity Federation required for this BFF approach.

## Out of scope here
GitHub Actions / deploy YAML live in **skill-matrix-deploy**, not this repository.
