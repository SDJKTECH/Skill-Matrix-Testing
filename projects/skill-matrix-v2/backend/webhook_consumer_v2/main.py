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
from flask import Flask, request

from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool
from dotenv import load_dotenv

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
def receive_pubsub_push():
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
                         SELECT target_url, http_method, headers, params, is_active 
                         FROM "{schema}".event_subscriptions_config
                         WHERE id = :id
                     """)
                     result = conn.execute(query, {"id": int(webhook_id)}).fetchone()
                     
                     if not result:
                         logger.warning(f"Webhook config {webhook_id} not found. Ignoring payload.")
                         return "Success", 204
                         
                     target_url, http_method, headers_json, params_json, is_active = result
                     
                     if not is_active:
                         logger.info(f"Webhook {webhook_id} is inactive. Ignored.")
                         return "Success", 204

                     headers = headers_json if headers_json else {}
                     
                     # Force JSON content type if missing
                     if "Content-Type" not in headers and "content-type" not in headers:
                         headers["Content-Type"] = "application/json"
                         
                     params = params_json if params_json else {}
                     
                     # 3. Fire the real Webhook out to the 3rd-Party Customer URL using Python requests!
                     logger.info(f"Relaying payload to {http_method} {target_url} ...")
                     target_response = requests.request(
                         method=http_method,
                         url=target_url,
                         headers=headers,
                         params=params,
                         json=payload,
                         timeout=15
                     )
                     
                     if target_response.status_code >= 400:
                          logger.error(f"Target endpoint failed ({target_response.status_code}): {target_response.text}")
                     else:
                          logger.info(f"Relay succeeded: {target_response.status_code}")
                          
            except Exception as e:
                 logger.error(f"Database/Routing failure for Webhook {webhook_id}: {e}")
            # --- END BUSINESS LOGIC ---
            
            # Always return a 20X success back to Pub/Sub to acknowledge delivery and remove from queue
            return "Success", 204
            
        except Exception as e:
            logger.error(f"Failed to process message data: {e}")
            return f"Internal Server Error: {e}", 500

    return "No Data in message", 400

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8081))
    app.run(host="0.0.0.0", port=port)
