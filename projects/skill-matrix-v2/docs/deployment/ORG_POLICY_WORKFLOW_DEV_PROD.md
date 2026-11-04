# Post–org-policy deployment: workflow changes (dev + prod)

**Audience:** platform / `skill-matrix-deploy` maintainers  
**App repo:** `skill-matrix-v2` (branch `feat/same-origin-api-proxy` and later)  
**Deploy repo:** `jktech-training/skill-matrix-deploy` (workflows live here — not in this repo)

This document records everything that must change on the **workflow / deploy / IAM** side after GCP org policy blocked new `allUsers` invoker bindings. It covers **both development and production** Skill Matrix applications.

Related app-side notes:
- [PRIVATE_FUNCTIONS_PROXY_HANDOFF.md](./PRIVATE_FUNCTIONS_PROXY_HANDOFF.md) — short checklist
- [VITE_BASE_URL_CONFIG.md](./VITE_BASE_URL_CONFIG.md) — browser vs proxy URL model

---

## 1. Why workflows must change

| Before (old model) | After (required by org policy) |
|--------------------|--------------------------------|
| Deploy Cloud Functions with `--allow-unauthenticated` | Deploy **private** functions (no public invoker) |
| Browser called `*.cloudfunctions.net/…` directly | Browser calls **frontend Cloud Run only** (same-origin) |
| IAM: `allUsers` → `roles/run.invoker` (blocked for new grants) | IAM: **frontend Cloud Run runtime SA** → `roles/run.invoker` only |
| Users = Azure AD; APIs = public HTTP | Users = Azure AD SSO; APIs = **service-account invoker** |
| Adding JKTech people as GCP users was sometimes suggested | **Do not** add Azure AD users as GCP users |

Org policy does **not** allow relying on public function URLs for prod (or shared cloud-dev). Local Vite → localhost backends is unchanged and does not need GCP invoker.

---

## 2. Target traffic model (both cloud envs)

```
JKTech user (Azure AD)
  → Microsoft SSO (jktech-auth-gateway)
  → Skill Matrix frontend Cloud Run
       • Serves SPA
       • server.mjs proxies /get_* /save_* /… to Cloud Functions
       • Attaches Google identity token (X-Serverless-Authorization)
       • Optional: validates SSO JWT when REQUIRE_SSO_JWT=true
  → Private Cloud Functions (Gen2 / Cloud Run)
       • Invoker: frontend runtime SA only
       • Optional: validate SSO Bearer (reports use utils.sso_auth)
```

**Not used:** browser → `allUsers` on functions; GCP end-user accounts for employees; org-policy exception for public invoker.

---

## 3. Environment map (workflow branching)

| | **Production** | **Development (cloud)** |
|--|----------------|-------------------------|
| Trigger branch (private repo) | `main` | `development` / `devlopment` |
| Frontend Cloud Run service | `skill-matrix` (confirm actual name in deploy repo) | `skill-matrix-dev` / `skill-matrix-v2-dev` (confirm) |
| Function name prefix | **none** — `get_employee_skill_v2` | **`dev_`** — `dev_get_employee_skill_v2` |
| `FUNCTIONS_BASE_URL` (frontend **runtime** env) | `https://asia-south1-training-project-419308.cloudfunctions.net/` | `https://asia-south1-training-project-419308.cloudfunctions.net/dev_` |
| `VITE_BASE_URL` (frontend **build** arg) | `/` or empty | `/` or empty (same — prefix is **not** in the browser) |
| `VITE_SSO_URL` | jktech-auth-gateway URL | same gateway (or env-specific if you have one) |
| `SSO_VERIFY_URL` | `https://jktech-auth-gateway-….run.app/verify` | same (unless separate gateway) |
| DB / schema secrets | prod schema | `skill_matrix_v2_dev` (or deploy repo values) |
| Bucket (if used) | `skill_matrix` | `dev_skill_matrix` |

**Critical:** `dev_` belongs only in **`FUNCTIONS_BASE_URL`** and in the **deployed function name**. Browser paths stay unprefixed (`/get_employee_skills_report_v2`). The proxy concatenates base + path.

---

## 4. Workflow changes required in `skill-matrix-deploy`

Implement these in the public deploy workflow (e.g. `.github/workflows/deploy.yml`). This repo only **triggers** that workflow via `repository_dispatch` (`.github/workflows/trigger-deployment.yml`).

### 4.1 Backend / Cloud Functions job

| Change | Dev | Prod | Detail |
|--------|-----|------|--------|
| Remove `--allow-unauthenticated` | ✅ | ✅ | All Skill Matrix HTTP functions, including reports |
| Do not bind `allUsers` invoker | ✅ | ✅ | Remove existing bindings if present (one-time / migration step) |
| Keep env prefix logic | `dev_` | none | Existing branch → prefix mapping stays |
| Package `backend/utils` | ✅ | ✅ | Reports import `utils.sso_auth`; other funcs may use `event_publisher` |
| Set function env `SSO_VERIFY_URL` (optional) | ✅ | ✅ | Only used when `REQUIRE_SSO_AUTH=true` |
| User-level JWT checks are opt-in | optional | optional | `REQUIRE_SSO_AUTH=true` (functions), `REQUIRE_SSO_JWT=true` (frontend proxy). Off by default so pre-login reads keep working; IAM still blocks public access |
| Never set `SKIP_GOOGLE_ID_TOKEN` in cloud | ✅ | ✅ | Local/container debug only |

**Report functions (must be private + invoker-granted):**
- `get_employee_skill_matrix_report_v2` / `dev_get_employee_skill_matrix_report_v2`
- `get_employee_skills_report_v2` / `dev_get_employee_skills_report_v2`
- `get_employee_certificate_report_v2` / `dev_get_employee_certificate_report_v2`
- `get_employee_training_report_v2` / `dev_get_employee_training_report_v2`
- `get_training_analytics_v2` / `dev_get_training_analytics_v2`

Plus **all** other Skill Matrix HTTP APIs the UI calls (skills, certificates, trainings, employee, aggregations, genai, etc.).

Example deploy shape (illustrative — adapt to existing workflow):

```bash
# DO NOT use: --allow-unauthenticated
gcloud functions deploy "${FUNCTION_NAME}" \
  --gen2 \
  --runtime=python310 \
  --region=asia-south1 \
  --trigger-http \
  --entry-point=... \
  --service-account=... \
  --set-env-vars="...,SSO_VERIFY_URL=${SSO_VERIFY_URL}"
  # no public invoker flag
```

### 4.2 Invoker IAM (after each function deploy or as a dedicated step)

Grant **once per function/service** (idempotent `add-iam-policy-binding`):

```text
member = serviceAccount:<FRONTEND_RUNTIME_SA>@training-project-419308.iam.gserviceaccount.com
role   = roles/run.invoker
```

| Env | Who is `<FRONTEND_RUNTIME_SA>`? |
|-----|----------------------------------|
| Prod | Runtime SA of **prod** frontend Cloud Run service |
| Dev | Runtime SA of **dev** frontend Cloud Run service |

Use the SA that Cloud Run attaches to the revision running `server.mjs` (metadata identity token). If prod and dev frontends use **different** runtime SAs, grant each SA only on the functions that frontend calls (prod SA → prod functions; dev SA → `dev_*` functions). If they share one SA, that SA needs invoker on both sets.

```bash
# Example (Gen2 / Cloud Run underlying service)
gcloud run services add-iam-policy-binding "${FUNCTION_NAME}" \
  --region=asia-south1 \
  --member="serviceAccount:${FRONTEND_RUNTIME_SA}" \
  --role="roles/run.invoker"
```

### 4.3 Frontend Docker build job

| Change | Dev | Prod |
|--------|-----|------|
| Build arg `VITE_BASE_URL` | `/` or `""` — **not** `https://…cloudfunctions.net/dev_` | `/` or `""` — **not** `https://…cloudfunctions.net/` |
| Build arg `VITE_SSO_URL` | Auth gateway URL | Auth gateway URL |
| Image must include `server.mjs` (new dockerfile) | ✅ | ✅ |
| Stop relying on global `serve`-only image | ✅ | ✅ |

App behavior: absolute `*.cloudfunctions.net` baked into old images is **ignored** by `apiConfig.js` in favor of `/`, but the **new** image with `server.mjs` is required for private functions to work.

### 4.4 Frontend Cloud Run deploy job

| Change | Dev | Prod |
|--------|-----|------|
| Set runtime env `FUNCTIONS_BASE_URL` | `…cloudfunctions.net/dev_` | `…cloudfunctions.net/` |
| Set runtime env `SSO_VERIFY_URL` | gateway `/verify` | gateway `/verify` |
| Optional `REQUIRE_SSO_JWT=true` (proxy-level user check) | optional | optional |
| Frontend may remain reachable after SSO (users hit app URL) | ✅ | ✅ |
| Do **not** require GCP login for employees | ✅ | ✅ |

Illustrative:

```bash
gcloud run deploy "${FRONTEND_SERVICE}" \
  --image=... \
  --region=asia-south1 \
  --set-env-vars="FUNCTIONS_BASE_URL=${FUNCTIONS_BASE_URL},SSO_VERIFY_URL=${SSO_VERIFY_URL}"
  # Keep whatever ingress/auth you already use for the SPA + gateway pattern.
  # Function privacy is separate from "can users open the app URL".
```

### 4.5 Secrets / variables to add or adjust in `skill-matrix-deploy`

| Name | Scope | Purpose |
|------|--------|---------|
| `FUNCTIONS_BASE_URL_PROD` | secret/var | Prod proxy upstream |
| `FUNCTIONS_BASE_URL_DEV` | secret/var | Dev proxy upstream (`…/dev_`) |
| `SSO_VERIFY_URL` | secret/var | Gateway verify endpoint |
| `VITE_BASE_URL` / build | prefer `/` | No longer the Cloud Functions base |
| `VITE_SSO_URL` | keep | Unchanged SSO entry |
| `FRONTEND_RUNTIME_SA_PROD` / `_DEV` | var | Member for `roles/run.invoker` |

Deprecate workflow usage of baking Cloud Functions absolute URLs into `VITE_BASE_URL_PROD` / `VITE_BASE_URL_DEV` for browser calls (those secrets become obsolete for the SPA; replaced by runtime `FUNCTIONS_BASE_URL_*`).

### 4.6 What this private repo workflow does **not** change

`skill-matrix-v2` `.github/workflows/trigger-deployment.yml` continues to dispatch to `skill-matrix-deploy`. No org-policy-specific edits are required in that trigger file for the new model—**all IAM/proxy env/function flags belong in the public deploy workflow**.

---

## 5. App-side changes workflows must align with

(Implemented in `skill-matrix-v2`; deploy must ship them.)

| Area | Change |
|------|--------|
| `frontend/server.mjs` | SPA + API proxy + SSO verify + Google ID token |
| `frontend/dockerfile` | `CMD ["node", "server.mjs"]` instead of `serve` |
| `frontend/src/config/apiConfig.js` | Browser always same-origin `/` |
| Auth / reports / chat | Send `Authorization: Bearer <SSO JWT>` |
| `backend/utils/sso_auth.py` | Report functions verify SSO Bearer |
| Report `main.py` files | Call `require_sso_bearer` |

Local development (`npm run dev` + Vite proxy + `functions-framework`) does **not** use `server.mjs` or GCP invoker.

---

## 6. Migration checklist (platform)

Use for both envs; tick prod and cloud-dev separately.

### One-time / IAM
- [ ] Identify frontend Cloud Run **runtime** SA (prod) and (dev)
- [ ] Remove `allUsers` invoker on Skill Matrix functions (if still present)
- [ ] Confirm org policy: no new public invoker grants
- [ ] Grant `roles/run.invoker` to frontend SA(s) on **every** Skill Matrix HTTP function

### Workflow code (`skill-matrix-deploy`)
- [ ] Strip `--allow-unauthenticated` from function deploy steps (dev + prod paths)
- [ ] Add post-deploy invoker binding step (dev SA → `dev_*`, prod SA → unprefixed)
- [ ] Frontend build: `VITE_BASE_URL=/` (both)
- [ ] Frontend deploy: set `FUNCTIONS_BASE_URL` + `SSO_VERIFY_URL` (env-specific base)
- [ ] Ensure function package includes `backend/utils`
- [ ] Confirm image builds from dockerfile that runs `server.mjs`

### Validation
- [ ] Unauthenticated `curl` to function URL → **401/403** (not 200)
- [ ] Logged-in user via app URL can load data and download all 4 reports (dev app + prod app)
- [ ] Browser network tab shows API calls to **frontend origin**, not `cloudfunctions.net`
- [ ] No JKTech users created in GCP IAM for app access

---

## 7. Explicit non-goals (workflow)

- Do **not** add Azure AD / JKTech domain users as GCP IAM users for Skill Matrix access
- Do **not** request an org-policy exception to restore `allUsers` on functions
- Do **not** put Google identity tokens or SA keys in the browser / `VITE_*` build args
- Do **not** require Workforce Identity Federation / IAP unless product later chooses that heavier path; BFF proxy is the chosen fix

---

## 8. Summary table

| Layer | Dev cloud | Prod | Local |
|-------|-----------|------|-------|
| User login | Azure AD SSO | Azure AD SSO | SSO or existing local patterns |
| Browser → APIs | Same-origin → frontend proxy | Same-origin → frontend proxy | Vite proxy → localhost |
| Function names | `dev_*` | unprefixed | local ports |
| Function invoker | Dev frontend SA | Prod frontend SA | N/A |
| `--allow-unauthenticated` | **Removed** | **Removed** | N/A |
| Workflow repo | `skill-matrix-deploy` | `skill-matrix-deploy` | N/A |

**Bottom line:** After org policy, workflows must deploy **private** functions for **both** cloud-dev and prod, wire **one frontend runtime SA per env** as invoker, and configure the frontend service with **`FUNCTIONS_BASE_URL`** (including `dev_` for development) so `server.mjs` can call APIs without public access.
