# getEmpTrainingCourse_v2

Google Cloud Function (Gen2, HTTP trigger) serving an employee's training courses/lessons, course content, and progress tracking.

## Files

- `main.py` — entry point (`get_emp_training_course_v2`); routes GET/POST by `mode`, adds CORS headers.
- `service.py` — business logic: row formatting, GCS signed-URL resolution/content streaming, progress validation.
- `db_session.py` — SQL access (`training_courses`, `training_lessons`, `employee_trainings`, `training_batches`, `employee_training_progress`).
- `requirements.txt` — dependencies.

## Routes (method + `mode`)

| Method | mode | Params | Action |
|---|---|---|---|
| GET | `emp_course` | `employee_id` (+optional `course_id`, `lesson_id`) | `fetch_emp_courses` — this employee's enrolled course(s)/lesson, with a `content_url` |
| GET | `emp_course_lessons` | `employee_id`, `course_id` | `fetch_course_lessons` — all lessons in an enrolled course + per-lesson progress |
| GET | `emp_all_course` | `employee_id` | `fetch_emp_all_courses` — full published catalog + enrollment status if any |
| GET | `download_content` | `employee_id`, `course_id` (+optional `lesson_id`) | `stream_content` — proxies the file bytes (fallback when GCS signed URL unavailable) |
| POST | `saveEmpCourseProgress` | `employee_id`, `course_id`, `lesson_id`, `status`, `progress_pct`, `position_seconds` | `save_progress` — UPSERT progress, rolls status into `employee_trainings` |

## Flow

1. Enrollment is `employee_trainings` (employee × batch); the batch carries the course via `training_batches.course_id`.
2. `material_url` (`gs://...`) is resolved to a signed HTTPS URL for 15 min; if signing fails (e.g. local dev with ADC), `content_proxy_required` is set and the client falls back to `mode=download_content`.
3. `saveEmpCourseProgress` only promotes self-paced status (`Not Started`/`In Progress` → given status) — never overwrites an admin-set status from the nomination/approval flow.

## Env vars

`DB_USER`, `DB_PASS`, `DB_NAME`, `DB_HOST`, `DB_PORT`, `DB_SCHEMA`.

## Local testing

```
functions-framework --target=get_emp_training_course_v2 --source main.py --debug --port=8094
```

Deployment commands are documented at the bottom of `main.py`.
