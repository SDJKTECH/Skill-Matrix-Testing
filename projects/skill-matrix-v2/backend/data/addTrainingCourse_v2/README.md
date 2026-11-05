# addTrainingCourse_v2

Google Cloud Function (Gen2, HTTP trigger) managing training courses and lessons, with direct-to-GCS upload and video transcoding.

## Files

- `main.py` — entry point (`add_training_course_v2`); routes by method/path, builds the DB engine, adds CORS headers.
- `service.py` — business logic: validation, GCS signed-URL/upload orchestration, Transcoder job submission, course/lesson creation.
- `db_session.py` — SQL access (`training_courses`, `training_lessons`).
- `constants.py` — env-driven config and allowed type sets.
- `requirements.txt` — dependencies.

## Routes (method + path suffix)

| Method | Path suffix | Action |
|---|---|---|
| GET | *(any)* | `list_courses` — **not implemented** |
| POST | `/upload-url` | `create_upload_url` — signed GCS PUT URL for lesson material |
| POST | `/lessons/upload-document` | `upload_lesson_document` — multipart upload (PDF/PPTX) |
| POST | `/lessons/upload-video` | `upload_lesson_video` — multipart upload (MP4/WebM) + submits HLS transcode job |
| POST | `/lessons/transcode-callback` | `handle_transcode_callback` — Transcoder job completion payload |
| POST | `/lessons` | `create_lesson` |
| POST | *(any other)* | `create_course` |

## Flow

1. Course created via `create_course` (title, course_type, etc.).
2. Lesson material reaches GCS either via a signed upload URL (`/upload-url`) referenced later as `material_path` in `create_lesson`, or via direct multipart upload (`/lessons/upload-document`, `/lessons/upload-video`).
3. Video uploads trigger a Transcoder job (HLS, 720p); `transcode-callback` marks the lesson `Ready` (with `hls_manifest_path`) or `Failed`.

## Env vars

`DB_USER`, `DB_PASS`, `DB_NAME`, `DB_HOST`, `DB_PORT`, `DB_SCHEMA`, `BUCKET_NAME`, `TRANSCODER_PUBSUB_TOPIC`, `TRANSCODER_LOCATION`, `GCP_PROJECT`/`GOOGLE_CLOUD_PROJECT`.

## Local testing

```
functions-framework --target=add_training_course_v2 --source main.py --debug --port=8112
```

Deployment commands are documented at the bottom of `main.py`.
