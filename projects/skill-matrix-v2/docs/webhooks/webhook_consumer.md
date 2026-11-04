# webhook_consumer

**Backend**: `backend/webhook_consumer`  
**Entry point**: Cloud Run HTTP service (Pub/Sub push consumer)
**Endpoint**: `POST /?webhook_id=<id>`
**Local port**: `8081` (default)

## Overview

Internal edge consumer for Skill Matrix webhook delivery. Pub/Sub push subscriptions send events here; this service looks up subscriber configuration and forwards the payload to the third-party URL.

This is **not** a browser/SPA API. Do not call it via the frontend same-origin proxy for normal user flows.

## Architecture

See [webhook_architecture.md](./webhook_architecture.md) for the publish → Pub/Sub → consumer → subscriber flow.

## Behavior

1. Accept Pub/Sub push POST.
2. Decode message payload.
3. Resolve subscriber config.
4. Forward to the third-party endpoint.
5. Acknowledge the delivery with `204`; routing and downstream HTTP failures are logged and acknowledged.

## Request

The body must be a Pub/Sub push envelope whose `message.data` value is base64-encoded JSON:

```json
{
  "message": {
    "data": "eyJldmVudCI6InRlc3QifQ=="
  }
}
```

`webhook_id` identifies the `event_subscriptions_config` row. Missing, unknown, or inactive webhook configurations are acknowledged without forwarding.

## Responses

- `204`: Valid payload acknowledged, including routing or downstream failures.
- `400`: Missing/invalid Pub/Sub envelope or missing message data.
- `500`: `message.data` could not be decoded or parsed.

## Local testing

```bash
cd backend/webhook_consumer
python main.py
```

Set `DB_USER`, `DB_PASS`, `DB_HOST`, `DB_PORT`, `DB_NAME`, and `DB_SCHEMA`. The service uses `PORT` when set and otherwise listens on `8081`.

## Ops notes

- Cloud auth is service-to-service (Pub/Sub → Cloud Run), not Azure AD end-user SSO.
- Keep the service private; grant invoker to the Pub/Sub push identity (not `allUsers`).
- Direct Cloud Run requests are admin diagnostics only and require a Google identity token.

## Related

- `backend/utils/event_publisher.py`
- `backend/utils/event_types.py`
- `docs/webhooks/webhook_architecture.md`
