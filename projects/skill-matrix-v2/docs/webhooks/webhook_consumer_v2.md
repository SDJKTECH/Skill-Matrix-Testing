# webhook_consumer_v2 Documentation

## Overview

`webhook_consumer_v2` is a Flask service for authenticated Pub/Sub push delivery. It decodes an event, looks up the selected webhook configuration, and relays the payload to the configured third-party endpoint.

**Location**: `backend/webhook_consumer_v2/main.py`

**Route**: `POST /?webhook_id=<id>`

**Runtime**: Cloud Run service

**Local port**: `8081` by default

This endpoint is not a browser-facing Skill Matrix API and does not use the frontend same-origin function proxy. Pub/Sub invokes it directly with a service identity authorized for the private Cloud Run service.

## Request

Pub/Sub sends its standard push envelope. The `message.data` value is base64-encoded JSON:

```json
{
  "message": {
    "data": "eyJhY3Rpb24iOiAiRU1QTE9ZRUVfVVBEQVRFRCIsICJkYXRhIjogeyJpZCI6IDEyfX0=",
    "messageId": "1234567890"
  },
  "subscription": "projects/example/subscriptions/events-employee-updated"
}
```

The push URL supplies `webhook_id`:

```text
https://<webhook-consumer-cloud-run>/?webhook_id=9
```

## Processing

1. Validate the Pub/Sub envelope and decode `message.data`.
2. Read `event_subscriptions_config` for the requested `webhook_id`.
3. Ignore missing or inactive configurations.
4. Relay the decoded event using the stored target URL, HTTP method, headers, and query parameters.
5. Acknowledge the Pub/Sub message.

The outbound request uses a 15-second timeout and defaults `Content-Type` to `application/json` when the stored headers do not specify one.

## Responses

| Status | Meaning |
| --- | --- |
| 204 | Message acknowledged, including missing `webhook_id`, missing configuration, inactive configuration, and completed relay attempts |
| 400 | Missing/invalid Pub/Sub envelope or missing message data |
| 500 | Message data could not be decoded or parsed |

The current implementation logs database and target-delivery failures but still returns `204`, so those failures are acknowledged and are not retried by Pub/Sub.

## Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `DB_HOST` | `127.0.0.1` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_USER` | `postgres` | PostgreSQL user |
| `DB_PASS` | empty | PostgreSQL password |
| `DB_NAME` | `Skill_Matrix` | PostgreSQL database |
| `DB_SCHEMA` | `skill_matrix_v2_dev` | Schema containing `event_subscriptions_config` |
| `PORT` | `8081` | Local/container listen port |

## Local Testing

```bash
cd backend/webhook_consumer_v2
python main.py
```

Post a Pub/Sub envelope to `http://localhost:8081/?webhook_id=9`. Localhost requests do not need a GCP identity token.

## Cloud Deployment and Invocation

Deploy the Cloud Run service as private. Do not grant a public invoker. Configure the Pub/Sub push subscription with an OIDC service account and grant only that service account `roles/run.invoker` on `webhook_consumer_v2`.

Use the private Cloud Run service URL as the push endpoint. This service should not be routed through the frontend Cloud Run proxy, and end-user SSO bearer tokens are not part of the Pub/Sub authentication flow.

For direct administrator diagnostics, obtain a Google identity token whose audience is the exact webhook consumer Cloud Run URL.

## Related Documentation

- [Webhook architecture](./webhook_architecture.md)
