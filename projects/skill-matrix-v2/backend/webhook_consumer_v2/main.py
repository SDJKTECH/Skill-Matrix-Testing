"""
Webhook Consumer Service for Cloud Run
Listens for Pub/Sub POSTs (Push Delivery) and processes them.

Deployment Idea:
1. Deploy this Flask app as a Google Cloud Run Service.
2. Configure Pub/Sub Topics to use "Push" delivery to the Cloud Run URL.
3. This service extracts the `payload` and triggers the necessary target HTTP endpoints.
"""

import os
import json
import base64
import logging
import requests
from urllib.parse import urlsplit
from flask import Flask, request

from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool
from dotenv import load_dotenv

try:
    from utils.service_auth import get_service_id_token
except ImportError:
    get_service_id_token = None

app = Flask(__name__)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Try to load .env file if it exists (local development)
try:
    env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
    load_dotenv(env_path)
except Exception:
    pass

def get_db_engine():
    db_user = os.getenv("DB_USER")
    db_pass = os.getenv("DB_PASS")
    db_host = os.getenv("DB_HOST")
    db_port = os.getenv("DB_PORT")
    db_name = os.getenv("DB_NAME")

    import urllib.parse
    encoded_user = urllib.parse.quote_plus(db_user)
    encoded_pass = urllib.parse.quote_plus(db_pass)
    db_url = f"postgresql+psycopg2://{encoded_user}:{encoded_pass}@{db_host}:{db_port}/{db_name}"
    return create_engine(db_url, poolclass=NullPool)

@app.route("/", methods=["POST"])
def receive_pubsub_push(request=request):
    """
    Endpoint for Pub/Sub to push messages to.
    """
    envelope = request.get_json()
    if not envelope:
        msg = "No Pub/Sub message received"
        logger.error(f"error: {msg}")
        return f"Bad Request: {msg}", 400

    if not isinstance(envelope, dict) or "message" not in envelope:
        msg = "Invalid Pub/Sub message format"
        logger.error(f"error: {msg}")
        return f"Bad Request: {msg}", 400

    pubsub_message = envelope["message"]
    
    if isinstance(pubsub_message, dict) and "data" in pubsub_message:
        try:
            # Pub/Sub payload data is base64 encoded
            decoded_data = base64.b64decode(pubsub_message["data"]).decode("utf-8")
            payload = json.loads(decoded_data)
            logger.info(f"Received payload: {json.dumps(payload, indent=2)}")
            
            # --- START BUSINESS LOGIC ---
            # 1. We expect the 'webhook_id' to be passed in the URL Query Params by the GCP Push Subscription.
            #    (e.g., /?webhook_id=9)
            webhook_id = request.args.get("webhook_id")
            if not webhook_id:
                 logger.warning("No webhook_id provided in Push URL. Acknowledging payload blindly.")
                 return "Success", 204
                 
            try:
                engine = get_db_engine()
                schema = os.getenv("DB_SCHEMA")
                
                with engine.connect() as conn:
                     query = text(f"""
                         SELECT target_url, http_method, headers, params, is_active, subscription_type
                         FROM "{schema}".event_subscriptions_config
                         WHERE id = :id
                     """)
                     result = conn.execute(query, {"id": int(webhook_id)}).fetchone()
                     
                     if not result:
                         logger.warning(f"Webhook config {webhook_id} not found. Ignoring payload.")
                         return "Success", 204

                     target_url, http_method, headers_json, params_json, is_active, subscription_type = result

                     if not is_active:
                         logger.info(f"Webhook {webhook_id} is inactive. Ignored.")
                         return "Success", 204

                     if subscription_type == "Internal":
                         return _deliver_internal(webhook_id, target_url, http_method, headers_json, params_json, payload)
                     return _deliver_external(webhook_id, target_url, http_method, headers_json, params_json, payload)

            except Exception as e:
                 logger.error(f"Database/Routing failure for Webhook {webhook_id}: {e}")
            # --- END BUSINESS LOGIC ---

            # Always return a 20X success back to Pub/Sub to acknowledge delivery and remove from queue
            return "Success", 204

        except Exception as e:
            logger.error(f"Failed to process message data: {e}")
            return f"Internal Server Error: {e}", 500

    return "No Data in message", 400


def _build_relay_request(headers_json, params_json):
    """Normalize the DB-stored headers/params for an outbound relay call."""
    headers = dict(headers_json) if headers_json else {}
    if "Content-Type" not in headers and "content-type" not in headers:
        headers["Content-Type"] = "application/json"
    params = params_json if params_json else {}
    return headers, params


def _deliver_external(webhook_id, target_url, http_method, headers_json, params_json, payload):
    """Best-effort relay; logs failures but always acks so Pub/Sub won't retry."""
    headers, params = _build_relay_request(headers_json, params_json)

    logger.info(f"Relaying payload to {http_method} {target_url} ...")
    try:
        response = requests.request(
            method=http_method, url=target_url, headers=headers, params=params,
            json=payload, timeout=15,
        )
        if response.status_code >= 400:
            logger.error(f"Target endpoint failed ({response.status_code}): {response.text}")
        else:
            logger.info(f"Relay succeeded: {response.status_code}")
    except Exception as e:
        logger.error(f"External delivery failed for webhook {webhook_id}: {e}")

    return "Success", 204


def _function_audience(target_url):
    """IAM checks audience against the function's own root URL, not the sub-path (mirrors server.mjs)."""
    parts = urlsplit(target_url)
    function_name = parts.path.lstrip("/").split("/", 1)[0]
    return f"{parts.scheme}://{parts.netloc}/{function_name}"


def _deliver_internal(webhook_id, target_url, http_method, headers_json, params_json, payload):
    """Signed relay to a private function; propagates failure so Pub/Sub retries."""
    headers, params = _build_relay_request(headers_json, params_json)

    if get_service_id_token:
        token = get_service_id_token(_function_audience(target_url))
        if token:
            headers["X-Serverless-Authorization"] = f"Bearer {token}"
        else:
            logger.warning(f"Could not mint identity token for {target_url}; calling without it")

    logger.info(f"Delivering internal event to {http_method} {target_url} ...")
    try:
        response = requests.request(
            method=http_method, url=target_url, headers=headers, params=params,
            json=payload, timeout=15,
        )
        if response.status_code >= 400:
            logger.error(f"Internal target failed ({response.status_code}): {response.text}")
            return "Internal target failed", 500
        logger.info(f"Internal delivery succeeded: {response.status_code}")
        return "Success", 204
    except Exception as e:
        logger.error(f"Internal delivery failed for webhook {webhook_id}: {e}")
        return "Internal delivery failed", 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8081))
    app.run(host="0.0.0.0", port=port)


"""
===========================================
DEPLOYMENT COMMANDS (Gen2)
===========================================

Development Deployment:
------------------------
gcloud functions deploy dev_receive_pubsub_push_v2 \
  --gen2 \
  --runtime python310 \
  --trigger-http \
  --entry-point receive_pubsub_push \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --no-allow-unauthenticated \
  --region asia-south1 \
  --set-env-vars ENV=development,DB_USER=YOUR_DB_USER,DB_PASS=YOUR_DB_PASS,DB_NAME=YOUR_DB_NAME,DB_HOST=YOUR_DB_HOST,DB_PORT=5432,DB_SCHEMA=skill_matrix_v2_dev

gcloud run services add-iam-policy-binding dev_receive_pubsub_push_v2 \
  --region=asia-south1 \
  --member="serviceAccount:pubsub-invoker@training-project-419308.iam.gserviceaccount.com" \
  --role="roles/run.invoker" \
  --platform=managed \
  --project=training-project-419308

Production Deployment:
---------------------
gcloud functions deploy receive_pubsub_push_v2 \
  --gen2 \
  --runtime python310 \
  --trigger-http \
  --entry-point receive_pubsub_push \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --no-allow-unauthenticated \
  --region us-central1 \
  --set-env-vars ENV=production,DB_USER=YOUR_DB_USER,DB_PASS=YOUR_DB_PASS,DB_NAME=YOUR_DB_NAME,DB_HOST=YOUR_DB_HOST,DB_PORT=5432,DB_SCHEMA=skill_matrix_v2_prod

gcloud run services add-iam-policy-binding receive_pubsub_push_v2 \
  --region=us-central1 \
  --member="serviceAccount:pubsub-invoker@training-project-419308.iam.gserviceaccount.com" \
  --role="roles/run.invoker" \
  --platform=managed \
  --project=training-project-419308

Local Testing:
--------------
functions-framework --target=receive_pubsub_push --source main.py --debug --port=8081
"""