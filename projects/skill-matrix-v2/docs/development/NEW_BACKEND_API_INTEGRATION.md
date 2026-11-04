# New Backend API: Integration & Local Run & Deploy

This guide is for developers who add a **new backend API** (Cloud Function) and/or **integrate it with the frontend**. Follow the steps in order.

---

## 1. When You Add a New Backend API

- Implement the function under `backend/` (e.g. `backend/aggregations/myNewFunction_v2/main.py`).
- Use the **same HTTP contract** you will use in production (method, path, request/response body).
- Document the API (e.g. under `docs/aggregations/myNewFunction_v2.md` or the relevant `docs/` folder) including:
  - Request method and body
  - Response shape
  - Local run command and port

No frontend or port changes are required until the API is called from the frontend.

---

## 2. When the New API Is Integrated with the Frontend

If the frontend will call this API (e.g. from a context, helper, or component), do the following so that **local dev** works (Vite proxy + backend on a fixed port).

### 2.1 Choose a Port

- Use a **free port** in the same range as existing functions (e.g. 8080–8119).
- Avoid ports already used (see `frontend/vite.config.js` and `scripts/dev/start-all-backend.ps1`).

### 2.2 Update Frontend Proxy (Port Mapping)

**File:** `frontend/vite.config.js`

Add an entry to the `BACKEND_PORTS` object so the frontend dev server can proxy requests to your backend:

```js
const BACKEND_PORTS = {
  // ... existing entries ...
  'your_new_function_name': 8111,   // use your chosen port
}
```

- **Key:** Must be the **exact endpoint path** the frontend calls (e.g. `get_combined_hierarchy_v2`), without leading slash.
- **Value:** The port your backend will listen on locally.

After changing `vite.config.js`, **restart the frontend dev server** so the new proxy is applied.

### 2.3 Update Backend Port Documentation

**File:** `frontend/BACKEND_PORTS.md`

Add a line under the right section (or a new section), for example:

```markdown
## Your Category
- `your_new_function_name` → Port **8111**
```

### 2.4 Update Local “Start All Backend” Script

**File:** `scripts/dev/start-all-backend.ps1`

Add your function to the `$allFunctions` array so it is started with the rest of the backends:

```powershell
$allFunctions = @(
    # ... existing entries ...
    @{name="your_new_function_name"; path="backend\aggregations\yourFolder_v2"; port=8111; category="aggregations"}
)
```

- **name:** Same as in `vite.config.js` (the HTTP endpoint name).
- **path:** Relative path from repo root to the folder that contains `main.py`.
- **port:** Same port as in `vite.config.js`.
- **category:** One of `skills`, `employee`, `certificates`, `data`, `aggregations` (used by `--skills-only`, `--employee-only`, `--certificates-only`, `--aggregations-only`).

If your function is in a new category, add a new `elseif` block for it (e.g. `--aggregations-only`) if you want a filter flag.

---

## 3. Running Locally

### 3.1 Start All Backends (Recommended)

From the **project root**:

```powershell
.\scripts\dev\start-all-backend.ps1
```

This starts every function in `$allFunctions` (including your new one) in separate minimized PowerShell windows, each on its configured port.

**Options:**

| Option | Effect |
|--------|--------|
| `--list-only` | Only print the list of functions and their ports; do not start anything. |
| `--skills-only` | Start only skills-related functions. |
| `--employee-only` | Start only employee-related functions. |
| `--certificates-only` | Start only certificate-related functions. |
| `--aggregations-only` | Start only aggregation-related functions (e.g. `get_combined_hierarchy_v2`). |

If your function is in a category that has no filter yet, run without flags to start all (including your new one).

### 3.2 Start Only Your Backend (Single Function)

From the project root, go to your function folder and run the framework on the **same port** as in `vite.config.js` and `start-all-backend.ps1`:

```powershell
cd backend\aggregations\yourFolder_v2
functions-framework --target=your_new_function_name --source main.py --debug --port=8111
```

Or use the helper script (if it supports your path/port):

```powershell
.\scripts\dev\run-backend-function.ps1 <function-directory> 8111
```

### 3.3 Start the Frontend

In a separate terminal from the project root:

```powershell
.\scripts\dev\run-frontend.ps1
```

Or:

```powershell
cd frontend
npm run dev
```

The app will be at `http://localhost:5173` (or the port Vite shows). Requests to `/your_new_function_name` will be proxied to `http://localhost:8111` (or whatever port you set).

### 3.4 Frontend Code: Base URL

In the frontend, call the API using the **same path** as the key in `BACKEND_PORTS`:

```javascript
const BASE_URL = import.meta.env.VITE_BASE_URL || "";

const response = await axios.post(
  `${BASE_URL}your_new_function_name`,
  { /* body */ },
  { headers: { "Content-Type": "application/json" } }
);
```

- **Local:** Leave `VITE_BASE_URL` unset (or empty). The browser will send requests to the same origin (e.g. `http://localhost:5173/your_new_function_name`), and Vite will proxy them to your backend port.
- **Deployed:** Keep `VITE_BASE_URL` `/` (or empty). The browser calls the same-origin frontend Cloud Run URL, for example `https://<frontend-service>/your_new_function_name`. In cloud development the browser path is still unprefixed; the frontend runtime `FUNCTIONS_BASE_URL` ends in `/dev_` and maps that path to `dev_your_new_function_name`.

---

## 4. Deployment (Cloud Functions)

Deployment and IAM workflow changes are owned by `jktech-training/skill-matrix-deploy`. Cloud functions are private: deploy without a public-invoker flag, and grant the frontend Cloud Run runtime service account `roles/run.invoker`.

### 4.1 Production

Deploy the function **without** a `dev_` prefix:

```bash
gcloud functions deploy your_new_function_name \
  --runtime python310 \
  --trigger-http \
  --entry-point your_new_function_name \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --no-gen2 \
  --region asia-south1 \
  --set-env-vars ENV=production
```

Set DB and other env vars as needed (e.g. `--set-env-vars DB_HOST=...,DB_USER=...,DB_PASS=...,DB_NAME=...,DB_SCHEMA=...`).

### 4.2 Development (dev_ prefix)

Deploy with the **dev_** prefix; the frontend proxy maps the unprefixed browser path `/your_new_function_name` to this upstream:

```bash
gcloud functions deploy dev_your_new_function_name \
  --runtime python310 \
  --trigger-http \
  --entry-point your_new_function_name \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --no-gen2 \
  --region asia-south1 \
  --set-env-vars ENV=development
```

The **entry-point** stays the Python function name (e.g. `your_new_function_name`); the **deployed name** is `dev_your_new_function_name`.

### 4.3 Frontend Deployment and Cloud Testing

- **Browser/normal cloud Postman:** use `{{frontend_base_url}}/your_new_function_name` in both environments. If the endpoint accepts end-user identity, send `Authorization: Bearer {{sso_token}}`, where `sso_token` is the app's `localStorage.authToken`.
- **Frontend runtime:** set `FUNCTIONS_BASE_URL` to the private upstream base; development ends in `/dev_`, production does not. The proxy preserves the SSO JWT in `Authorization` and adds its Google identity token as `X-Serverless-Authorization`.
- **Optional user JWT enforcement:** set frontend `REQUIRE_SSO_JWT=true`; leave it unset for legacy-compatible pre-login reads. Private IAM still applies either way.
- **Direct upstream diagnostics only:** a `*.cloudfunctions.net` URL requires a Google identity token whose audience is that exact function URL. An SSO token alone cannot invoke it.

See `docs/deployment/VITE_BASE_URL_CONFIG.md` and the deployment workflow in `skill-matrix-deploy`.

### 4.4 CI/CD (Optional)

If you use the public repo’s workflow to deploy backend functions, add your new function to the list of functions that get deployed when `backend/` changes (in that repo’s workflow). The exact step depends on how the workflow enumerates functions (e.g. a matrix or a list of names). Ensure the deployed name and entry-point match the convention above (e.g. `dev_` for dev, no prefix for prod).

---

## 5. Checklist Summary

Use this when adding a new backend API and wiring it to the frontend:

| Step | Where | What to do |
|------|--------|------------|
| 1 | `frontend/vite.config.js` | Add `'your_new_function_name': PORT` to `BACKEND_PORTS`. |
| 2 | `frontend/BACKEND_PORTS.md` | Document `your_new_function_name` → Port **PORT**. |
| 3 | `scripts/dev/start-all-backend.ps1` | Add entry to `$allFunctions` (name, path, port, category). |
| 4 | Frontend code | Call `${BASE_URL}your_new_function_name` (same name as in proxy). |
| 5 | Local run | Start backends with `.\scripts\dev\start-all-backend.ps1`, then start frontend; restart frontend after proxy changes. |
| 6 | Deploy | Update `skill-matrix-deploy` to deploy the private function (prod or `dev_...`), grant the frontend runtime service account invoker, and configure runtime `FUNCTIONS_BASE_URL`. |

---

## 6. Example: Adding `get_combined_hierarchy_v2`

- **Port:** 8110  
- **vite.config.js:** `'get_combined_hierarchy_v2': 8110`  
- **BACKEND_PORTS.md:** `get_combined_hierarchy_v2` → Port **8110**  
- **start-all-backend.ps1:**  
  `@{name="get_combined_hierarchy_v2"; path="backend\aggregations\getCombinedHierarchy_v2"; port=8110; category="aggregations"}`  
- **Local:** `.\scripts\dev\start-all-backend.ps1` then start frontend; call `${BASE_URL}get_combined_hierarchy_v2` with POST body `{ employeeId: id }`.  
- **Deploy:**  
  Prod: `gcloud functions deploy get_combined_hierarchy_v2 ...`  
  Dev: `gcloud functions deploy dev_get_combined_hierarchy_v2 ... --entry-point get_combined_hierarchy_v2 ...`

This matches the current setup and can be used as a reference for any new API.
