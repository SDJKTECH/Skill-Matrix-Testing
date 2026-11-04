import os
import json
import logging
from typing import Dict, Any

from sqlalchemy import text
from google.cloud import pubsub_v1

logger = logging.getLogger(__name__)

def publish_event(conn, action_name: str, payload: Dict[str, Any]) -> None:
    """
    Core Application Event Publisher.
    
    This utility acts as the centralized outbound dispatcher for all system webhooks.
    When a domain event occurs (like an employee update or a new skill added), 
    the related API calls `publish_event`. 
    
    This function then queries `event_subscriptions_config` to identify any active 
    3rd-party subscriptions registered for this specific `action_name`.
    If found, the payload is serialized to JSON and pushed onto the Google Cloud 
    Pub/Sub Topic mapped to that subscription.
    
    Note: The actual delivery to the 3rd party HTTP endpoint is handled downstream
    by a dedicated Cloud Run consumer service subscribed to these Pub/Sub topics,
    providing reliable retry mechanisms.
    
    Args:
        conn: The active database connection (supports both Psycopg2 and SQLAlchemy).
        action_name (str): The system action triggering the webhook (e.g., 'EMPLOYEE_UPDATED').
        payload (dict): A detailed JSON-serializable dictionary describing the event context.
    """
    schema = os.getenv("DB_SCHEMA")
    project_id = os.getenv("GCP_PROJECT")
    
    # GOOGLE_APPLICATION_CREDENTIALS Override from .env
    try:
        credentials_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        if credentials_path:
            from pathlib import Path
            
            c_path = Path(credentials_path)
            if not c_path.is_absolute():
                # Assume relative to 'backend/'
                c_path = Path(__file__).parent.parent / credentials_path
                
            if c_path.exists():
                os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(c_path)
    except Exception as e:
        pass
        
    # --------------------------------------------------------------------------
    # 1. Look up Registered Webhook Targets for this Action
    # --------------------------------------------------------------------------
    # We query the `event_subscriptions_config` table for all topics natively
    # mapped to the incoming `action_name` where `is_active` is true.
    # To maximize compatibility across our diverse API endpoints, this logic
    # supports both direct Psycopg2 cursors and SQLAlchemy Engine connections.
    results = []
    try:
        if hasattr(conn, 'cursor'):
            # Psycopg2 path
            with conn.cursor() as cur:
                cur.execute(
                    f'SELECT pubsub_topic FROM "{schema}".event_subscriptions_config WHERE event_action = %s AND is_active = true',
                    (action_name.upper(),)
                )
                rows = cur.fetchall()
                # Depending on dict cursor vs tuple cursor, extract the first element
                for row in rows:
                    if isinstance(row, dict):
                        results.append(row.get('pubsub_topic'))
                    else:
                        results.append(row[0])
        else:
            # SQLAlchemy path
            query = text(f"""
                SELECT pubsub_topic 
                FROM "{schema}".event_subscriptions_config
                WHERE event_action = :action 
                  AND is_active = true
            """)
            rows = conn.execute(query, {"action": action_name.upper()}).fetchall()
            results = [r.pubsub_topic for r in rows]
    except Exception as e:
        logger.error(f"Failed to query event_subscriptions_config: {e}")
        return
    
    if not results:
        # No active webhooks for this action
        return
        
    if not project_id:
        logger.error("GCP_PROJECT environment variable missing. Cannot publish events.")
        return
        
    # --------------------------------------------------------------------------
    # 2. Dispatch to Google Cloud Pub/Sub
    # --------------------------------------------------------------------------
    try:
        # Initialize Google Cloud Pub/Sub client
        publisher = pubsub_v1.PublisherClient()
            
        # Serialize the payload to bytes. The `default=str` ensures that datetime
        # objects and other non-standard types are safely cast to strings.
        payload_bytes = json.dumps(payload, default=str).encode("utf-8")
        
        # Iterate over all registered subscriptions and push the message
        for topic_path in results:
            if not topic_path:
                continue
            
            # Basic validation to ensure topic path looks vaguely correct
            if not topic_path.startswith("projects/"):
                 logger.warning(f"Topic {topic_path} seems malformed. Using as-is.")
            
            future = publisher.publish(topic_path, payload_bytes)
            # We wrap this in a try-except to prevent one bad topic from 
            # stopping delivery to other perfectly valid configured topics.
            try:
                message_id = future.result()
                logger.info(f"Published event {action_name} to {topic_path} (ID: {message_id})")
            except Exception as e:
                logger.error(f"Failed to publish {action_name} to {topic_path}: {e}")
                
    except Exception as base_error:
        logger.error(f"Event Publisher initialization failed: {base_error}")
