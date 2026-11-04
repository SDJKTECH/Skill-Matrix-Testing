# Skill Matrix Webhook Event Architecture

## Overview
The Skill Matrix system incorporates a dynamic Event-Driven architecture to allow real-time integration with downstream or 3rd-party services. To prevent the core Application APIs from being bogged down by synchronous HTTP calls and potential timeouts, we utilize an asynchronous **Publish-Subscribe (Pub/Sub)** model powered by Google Cloud Platform (GCP).

## Components
The system is divided into three primary components:

### 1. Webhooks Management API (`backend/data/manageEventSubscriptions`)
The API provides the interface for Administrators (via the `AdminConsoleWebhooks` frontend component) to configure Webhooks.
* **Database Target**: Configurations are stored in the PostgreSQL table `event_subscriptions_config`.
* **Auto-Provisioning**: Upon configuring a new Webhook for an action, the API automatically provisions a Google Cloud Pub/Sub Topic (e.g., `events-employee-updated`) and a Push Subscription attached to it.
* **Security & Routing**: To ensure security and handle private network egress properly, the Push Subscription does **not** push directly to the final 3rd-party internet URL. Instead, it pushes to an internal Cloud Run service (`webhook_consumer_v2`).

### 2. Event Publisher Utility (`backend/utils/event_publisher.py`)
A core utility function imported by all primary system APIs.
* **Invocation**: Instead of calling a webhook directly, APIs (like `saveEmployee`, `addSkill`, `addTraining`) simply call `publish_event(conn, "EMPLOYEE_UPDATED", payload)`.
* **Database Lookup**: The utility queries `event_subscriptions_config` to identify all **Active** topics configured for the fired event type.
* **Dispatch**: The Python dictionary payload is serialized to normalized JSON and pushed onto the resolved GCP Pub/Sub Topics concurrently.

### 3. Webhook Consumer (`backend/webhook_consumer_v2/main.py`)
This standalone Cloud Run function acts as the edge traffic manager. 
* **Ingestion**: It securely accepts HTTP POST requests (Pushes) from Google Cloud Pub/Sub.
* **Resolution**: It isolates the database configuration ID passed via query parameters inside the push configuration, accessing the exact `target_url`, `http_method`, and authentication `headers`.
* **Delivery & Retry**: It attempts to deliver the JSON payload to the final 3rd-party subscriber URL via synchronous HTTP. Any 4xx or 5xx failures are bubbled back to Pub/Sub, which automatically drives exponential backoff retries.

## Supported Events (Enums)
All actions originate from the `SystemEventType` enum to ensure no parameter mismatches or typos occur between what the system fires, and what the user selects in the Admin UI dropdown.

**Employee Context:**
- `EMPLOYEE_CREATED`
- `EMPLOYEE_UPDATED` 
- `EMPLOYEE_SKILLS_UPDATED`
- `EMPLOYEE_TRAINING_UPDATED`
- `EMPLOYEE_CERTIFICATE_UPDATED`

**Master Data Context:**
- `SKILL_MAPPING_UPDATED`
- `TRAINING_MAPPING_UPDATED`
- `CERTIFICATE_MAPPING_UPDATED`

## Sample JSON Payload Format 
All events publish a structured, serialized JSON object to explicitly outline changes in the Database for reliable consumption.

```json
{
  "action": "UPDATE_MAPPING",
  "data": {
     "mapping_id": 412,
     "provider_id": 56,
     "certificate_id": 90,
     "updated_by": 90
  }
}
```

## Adding a New Event Type
1. Define the event string in `backend/utils/event_types.py` under the `SystemEventType` enum.
2. Add a user-friendly label and description to the `AVAILABLE_EVENTS` dictionary in the same file to instantly populate the Frontend UI dropdown.
3. Import `publish_event` and `SystemEventType` in your backend route handler. Implement the invocation logic with a complete dictionary reporting the delta or results.
