# webhook_consumer_v2

Flask service (Cloud Run/Cloud Function, HTTP trigger) that receives Pub/Sub push deliveries and relays the payload to a configured target endpoint.

## Files

- `main.py` — Flask app with a single `POST /` route (`receive_pubsub_push`).
- `requirements.txt` — dependencies.

## Flow

1. Pub/Sub pushes a message envelope to `POST /?webhook_id=<id>`.
2. The base64 `message.data` is decoded to JSON (`payload`).
3. `webhook_id` is looked up in `event_subscriptions_config` for `target_url`, `http_method`, `headers`, `params`, `is_active`, `subscription_type`.
4. If inactive/missing, the message is acked and ignored.
5. `subscription_type == "Internal"` → `_deliver_internal`: mints an identity token (`utils.service_auth.get_service_id_token`, if available) and relays; a failed delivery returns 500 so Pub/Sub retries.
6. Otherwise → `_deliver_external`: best-effort relay; failures are logged but still acked (204) so Pub/Sub won't retry.

## Env vars

`DB_USER`, `DB_PASS`, `DB_NAME`, `DB_HOST`, `DB_PORT`, `DB_SCHEMA`, `PORT` (default 8081).

## Local testing

```
functions-framework --target=receive_pubsub_push --source main.py --debug --port=8081
```

Deployment commands (dev/prod, Gen2, with Pub/Sub invoker IAM binding) are documented at the bottom of `main.py`.
