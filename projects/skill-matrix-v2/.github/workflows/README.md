# GitHub Actions Workflows

This directory contains GitHub Actions workflows for automated deployment of the SkillMatrix application.

## Workflow Architecture

The deployment uses a **two-repository setup**:
1. **Private Repository** (this repo): Contains the source code
2. **Public Repository**: Contains the deployment workflow that pulls from private repo

## Workflows in This Repository (Private)

### `trigger-deployment.yml`
Triggers the public repository's deployment workflow when code is pushed.

**Triggers:**
- Push to `main`, `development`, or `devlopment` branches
- Manual trigger via `workflow_dispatch`

**What it does:**
- Sends a `repository_dispatch` event to the public repository
- Passes the branch name and repository information

**Required Secrets:**
- `PUBLICTOKENPULL`: GitHub Personal Access Token with the following permissions:
  - `repo` scope (full control of private repositories)
  - `workflow` scope (to trigger workflows via repository_dispatch)
  - Must have write access to the public repository (`jktech-training/skill-matrix-deploy`)
  - Required to create `repository_dispatch` events

## Workflow in Public Repository

### `deploy.yml` (Place in: `jktech-training/skill-matrix-deploy/.github/workflows/deploy.yml`)

This workflow should be placed in the **public repository** (`jktech-training/skill-matrix-deploy`).

**Triggers:**
- `repository_dispatch` event from private repo

**What it does:**
1. Checks out code from the private repository
2. Determines environment (production/development) based on branch
3. Detects changes in `frontend/` and `backend/` directories
4. Deploys frontend to Cloud Run (if changed)
5. Deploys changed backend functions to Cloud Functions (if changed)

**Required Secrets in Public Repo:**
- `PRIVATETOKENPULL`: GitHub Personal Access Token with access to private repo
- `GCP_SAKEY`: Google Cloud Service Account JSON key
- `DB_HOST`: Database host
- `DB_USER`: Database user
- `DB_PASS`: Database password
- `DB_NAME`: Database name
- `DB_PORT`: Database port (default: 5432)
- `DB_SCHEMA`: Database schema

## Setup Instructions

### 1. Private Repository Setup (This Repo)

#### Create GitHub Secret:
1. Go to GitHub → Settings → Secrets and variables → Actions → New repository secret
2. Add secret:
   - **Name:** `PUBLICTOKENPULL`
   - **Value:** GitHub Personal Access Token with `repo` and `workflow` permissions

To create a token:
- Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
- Generate new token with `repo` and `workflow` scopes
- Copy the token and add it as `PUBLICTOKENPULL` secret

### 2. Public Repository Setup

#### Create the workflow file:
Copy the content from `.github/workflows/DEPLOYMENT_WORKFLOW_PUBLIC_REPO.yml` to:
`JKTech-Sushant/Skill-Matrix-Public/.github/workflows/deploy.yml`

#### Create GitHub Secrets:
1. Go to the public repository → Settings → Secrets and variables → Actions
2. Add these secrets:
   - **PRIVATETOKENPULL**: Token with access to private repo
   - **GCP_SAKEY**: Google Cloud Service Account JSON key
   - **DB_HOST**: Your database host
   - **DB_USER**: Your database user
   - **DB_PASS**: Your database password
   - **DB_NAME**: Your database name
   - **DB_PORT**: Database port (e.g., `5432`)
   - **DB_SCHEMA**: Database schema (e.g., `public`)

### 3. Google Cloud Service Account Setup

Create a service account for deployments:

```bash
# Create service account
gcloud iam service-accounts create github-actions \
  --display-name="GitHub Actions Service Account"

# Grant necessary permissions
gcloud projects add-iam-policy-binding training-project-419308 \
  --member="serviceAccount:github-actions@training-project-419308.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding training-project-419308 \
  --member="serviceAccount:github-actions@training-project-419308.iam.gserviceaccount.com" \
  --role="roles/cloudfunctions.admin"

gcloud projects add-iam-policy-binding training-project-419308 \
  --member="serviceAccount:github-actions@training-project-419308.iam.gserviceaccount.com" \
  --role="roles/storage.admin"

gcloud projects add-iam-policy-binding training-project-419308 \
  --member="serviceAccount:github-actions@training-project-419308.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

# Create and download key
gcloud iam service-accounts keys create github-actions-key.json \
  --iam-account=github-actions@training-project-419308.iam.gserviceaccount.com
```

Copy the contents of `github-actions-key.json` and add it as the `GCP_SAKEY` secret in the public repository.

## How It Works

1. **Developer pushes code** to private repo (`main` or `development` branch)
2. **Private repo workflow triggers** → Sends `repository_dispatch` to public repo
3. **Public repo workflow runs** → Checks out code from private repo
4. **Detects changes** in `frontend/` or `backend/` directories
5. **Deploys only changed components**:
   - Frontend changes → Build Docker image → Deploy to Cloud Run
   - Backend changes → Deploy only changed Cloud Functions

## Environment Configuration

### Production (main branch):
- Environment: `production`
- Cloud Run Service: `skill-matrix`
- Function Prefix: None (functions deployed as-is)
- Bucket: `skill_matrix`

### Development (development/devlopment branch):
- Environment: `development`
- Cloud Run Service: `skill-matrix-dev`
- Function Prefix: `dev_` (e.g., `dev_get_certificate_mapping_v2`)
- Bucket: `dev_skill_matrix`

## Post–org-policy (private functions + frontend proxy)

GCP org policy blocks new `allUsers` invoker bindings. Skill Matrix **dev and prod** cloud deploys must:

1. Deploy Cloud Functions **without** `--allow-unauthenticated`
2. Grant `roles/run.invoker` only to the **frontend Cloud Run runtime SA** (per env)
3. Build frontend with `VITE_BASE_URL=/` (browser same-origin)
4. Set frontend **runtime** env `FUNCTIONS_BASE_URL` (`…/` prod, `…/dev_` development) and `SSO_VERIFY_URL`

Full checklist for both environments: [`docs/deployment/ORG_POLICY_WORKFLOW_DEV_PROD.md`](../../docs/deployment/ORG_POLICY_WORKFLOW_DEV_PROD.md)

Those changes belong in **`skill-matrix-deploy`** workflows; this private repo only triggers that deploy via `repository_dispatch`.

## Function Deployment Logic

The workflow automatically:
1. Scans `backend/` directory for changed functions
2. Extracts entry point from `main.py` (looks for `def function_name(request):`)
3. Deploys with appropriate naming:
   - V2 functions: Uses entry point name (e.g., `get_certificate_mapping_v2`)
   - Legacy functions: Uses entry point name (e.g., `update_manager_email`)
4. Adds environment prefix for development (`dev_` prefix)
5. Sets all required environment variables (DB credentials, ENV)

## Troubleshooting

### Workflow doesn't trigger
- Check that `PUBLICTOKENPULL` secret exists in private repo
- Verify token has `workflow` permission
- Check public repo workflow file exists and is correct

### Deployment fails
- Check `GCP_SAKEY` secret in public repo
- Verify service account has necessary permissions
- Check database credentials are correct
- Review workflow logs in GitHub Actions

### Functions not deploying
- Ensure `main.py` exists in function directory
- Verify entry point function name matches pattern `def function_name(request):`
- Check that function directory is under `backend/`

## Notes

- Only changed functions are deployed (incremental deployment)
- Frontend and backend deployments are independent
- Database credentials are passed as environment variables to all functions
- The workflow uses `continue-on-error` for legacy functions to prevent one failure from stopping all deployments
