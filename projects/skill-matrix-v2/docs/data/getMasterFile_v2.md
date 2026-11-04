# get_master_file_v2 Function Documentation

## Overview

`get_master_file_v2` downloads the current skills or certificates master file from Google Cloud Storage.

**Location**: `backend/data/getMasterFile_v2/main.py`

**Entry point**: `get_master_file_v2`

**Trigger**: HTTP `GET` (the handler also accepts `POST`) and `OPTIONS`

**Local port**: `8085`

## Request

```http
GET /get_master_file_v2?type=skills
GET /get_master_file_v2?type=certificates
```

The required `type` value is case-insensitive. No JSON body is required.

| `type` | GCS prefix |
| --- | --- |
| `skills` | `master-skill-mapping/Master_Skills` |
| `certificates` | `master-certificate-mapping/Master_Certificates` |

The function downloads the first blob matching the selected prefix.

## Responses

On success, the response contains the file bytes and includes `Content-Disposition: attachment; filename=<name>`. CSV files use `text/csv`; Excel files use the XLSX MIME type; other extensions use `application/octet-stream`.

| Status | Response |
| --- | --- |
| 200 | Binary file body |
| 204 | Empty `OPTIONS` response |
| 400 | `{ "error": "Invalid type. Use 'skills' or 'certificates'." }` |
| 404 | `{ "error": "No master file found for '<type>'." }` |
| 500 | `{ "error": "<storage error>" }` |

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `BUCKET_NAME` | Yes | Bucket containing the master mapping files |
| `GCP_PROJECT` | No | Project used to initialize the Storage client |

Local development may load these values from `backend/.env`. Deployed functions use configured environment variables and application-default credentials.

## Local Testing

```bash
cd backend/data/getMasterFile_v2
functions-framework --target=get_master_file_v2 --source main.py --debug --port=8085
curl --output Master_Skills.csv "http://localhost:8085/?type=skills"
```

Localhost requests do not need a GCP identity token.

## Cloud Testing

Use the same-origin frontend Cloud Run URL for browser and normal cloud Postman requests:

```http
GET https://<frontend-cloud-run>/get_master_file_v2?type=skills
```

The browser path stays unprefixed in both environments. In cloud development, frontend runtime `FUNCTIONS_BASE_URL` ending in `/dev_` maps the request to `dev_get_master_file_v2`.

An SSO bearer token is optional unless `REQUIRE_SSO_JWT` or `REQUIRE_SSO_AUTH` is enabled. When required, send `Authorization: Bearer {{sso_token}}` using the app's `localStorage.authToken`.

The frontend proxy adds its Google identity token as `X-Serverless-Authorization`. Direct `*.cloudfunctions.net` access is for platform/admin diagnostics only and requires a Google identity token whose audience is the exact function URL.

## Deployment

Deployment and IAM changes belong in `skill-matrix-deploy`. Deploy privately without a public-invoker flag, and grant the frontend Cloud Run runtime service account `roles/run.invoker`.

### Development

```bash
gcloud functions deploy dev_get_master_file_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point get_master_file_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=development
```

### Production

```bash
gcloud functions deploy get_master_file_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point get_master_file_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=production
```
