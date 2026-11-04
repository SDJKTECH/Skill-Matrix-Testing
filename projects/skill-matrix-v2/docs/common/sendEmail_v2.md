# send_mail_v2 (sendEmail_v2) Function Documentation

## Overview

`send_mail_v2` is the shared outbound-email Cloud Function used by every other v2 backend function that notifies a user over email. It takes `{to, subject, body}` (plus optional base64 `attachments`) and sends it over SMTP. It has no business logic of its own — callers build the subject/body/recipient and hand it off.

**Location**: `backend/common/sendEmail_v2/main.py` — grouped under `backend/common/` the same way `addTraining_v2` sits under `backend/data/` or `getTrainingAnalytics_v2` under `backend/reports/`.

**Trigger**: HTTP POST, deployed private (`--no-allow-unauthenticated`) like every other function in this repo — see Security below.

**Callers**: `backend/data/addTraining_v2/notifications.py`, `backend/skills/saveEmployeeSkill_v2/main.py` — both via the `SEND_EMAIL_URL` env var, never by hardcoded URL.

**Supersedes**: `jktech-training/skill-matrix` (legacy repo) `functions/sendEmail/main.py`. That copy predates this one, was deployed by hand (no CI/CD) only to `asia-south1`, and is the subject of the region-mismatch incident this function fixes — see `docs/deployment/send-mail-region-mismatch-rca.md`.

---

## Request / response contract

Same fields as the legacy function. One addition: since this deploys private (unlike the legacy copy, which was public), the caller must also attach a service identity token — see Security below. Both current callers already do this; a new caller needs the same one-line change, not a copy of this function.

**Request**
```
POST /send_mail_v2
Content-Type: application/json
X-Serverless-Authorization: Bearer <Google ID token, audience = this function's URL>

{
  "to": "manager@jktech.com",
  "subject": "New nomination: AWS Fundamentals for Jane Doe",
  "body": "<html>...</html>",
  "attachments": [
    { "filename": "report.xlsx", "content": "<base64>" }
  ]
}
```
`attachments` is optional; no current caller sends it, but it's preserved for parity with the legacy function and any future need (e.g. a report-email feature).

**Response**
- `200` — `{"success": true, "message": "Email sent successfully"}`
- `400` — `{"error": "Missing required fields: ..."}` (missing `to`/`subject`/`body`, or no JSON body)
- `500` — `{"error": "..."}` (SMTP not configured, or the send itself failed)
- `403` (from Cloud Run IAM, before this code runs) — caller's identity token missing, wrong audience, or not yet granted `roles/run.invoker`

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `SMTP_SERVER` | No (default `smtp.outlook.com`) | SMTP host |
| `SMTP_PORT` | No (default `587`) | SMTP port (STARTTLS) |
| `SMTP_EMAIL` | Yes | Sending account |
| `SMTP_PASS` | Yes | SMTP app password |

Auto-detected by `skill-matrix-deploy`'s env-var scan (`os.getenv(...)` in this file) — must exist in the `DB_DEV_V2` / `DB_PROD_V2` secrets before the first deploy of this function. The legacy `config.json` used `smtp.outlook.com` / `gennotification@jktech.com` — reusing that same account is fine; it was never split by environment (dev/prod configs were identical).

---

## Deployment

No workflow changes needed. `skill-matrix-deploy` finds this `main.py` anywhere under `backend/`, detects entry point `send_mail_v2` — already ending in `_v2`, same as every sibling function's entry point (`add_training_v2`, `get_training_analytics_v2`, ...) — so the deployed name is the entry point unchanged: `send_mail_v2` in production, `dev_send_mail_v2` in development, each in its environment's own region (prod: `us-central1`, dev: `asia-south1`).

### Local testing
```bash
cd backend/common/sendEmail_v2
functions-framework --target=send_mail_v2 --port=8121 --debug
```
No IAM layer exists locally, so a plain unauthenticated POST works against the local instance regardless of the prod/dev auth model.

---

## Security

Deploys private (`--no-allow-unauthenticated`), like every function in this repo — see `docs/deployment/PRIVATE_FUNCTIONS_PROXY_HANDOFF.md`. Callers attach a Google identity token via `backend/utils/service_auth.get_service_id_token()`, sent as `X-Serverless-Authorization`, same as `frontend/server.mjs` does for the browser path. Returns `None` locally (no metadata server); callers skip the header in that case.

Authorizing it requires `roles/run.invoker` on `send_mail_v2` / `dev_send_mail_v2`, granted to `training-project-419308@appspot.gserviceaccount.com` (the shared backend runtime SA). `skill-matrix-deploy`'s automatic invoker grant doesn't work for underscore-named functions yet, so grant this manually using the dash-cased Cloud Run service name:
```bash
gcloud run services add-iam-policy-binding dev-send-mail-v2 \
  --region=asia-south1 --platform=managed \
  --member="serviceAccount:training-project-419308@appspot.gserviceaccount.com" \
  --role="roles/run.invoker" --project=training-project-419308
```
(swap `dev-send-mail-v2` for `send-mail-v2` and `--region=us-central1` in prod).

---

## Rollout checklist (beyond the code)

1. Add `SMTP_SERVER`, `SMTP_PORT`, `SMTP_EMAIL`, `SMTP_PASS` to the `DB_DEV_V2` and `DB_PROD_V2` deploy secrets — verify all four landed with `gcloud functions describe dev_send_mail_v2 --gen2 --region=asia-south1` (a missing var deploys fine and fails at request time with a 500, not a deploy error).
2. Deploy on a non-`main` branch first; grant `roles/run.invoker` per the manual command above (see Security); confirm it sends a real email when called with a service identity token.
3. Update `SEND_EMAIL_URL` in `DB_DEV_V2` to the `dev_send_mail_v2` URL; run a real nomination and a real L3-skill request in dev end-to-end.
4. Merge to `main`; confirm `send_mail_v2` deploys to `us-central1`; grant the same `roles/run.invoker` binding to the prod deployment.
5. Update `SEND_EMAIL_URL` in `DB_PROD_V2` to the `send_mail_v2` URL; run the same two flows in prod.
6. After a clean burn-in period, delete the legacy `send_mail` / `dev_send_mail` functions from `asia-south1` and remove `functions/sendEmail/` from the legacy repo — first confirming nothing else (e.g. the legacy app itself) still calls the old URL.
