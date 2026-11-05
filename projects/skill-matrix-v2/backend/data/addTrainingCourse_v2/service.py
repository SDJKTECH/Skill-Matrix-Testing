"""Business logic for add_training_course_v2: validation, GCS upload orchestration, course + lesson creation."""

import uuid
import logging

from google.cloud import storage
from google.cloud.video import transcoder_v1
from google.protobuf import duration_pb2
from werkzeug.utils import secure_filename

from db_session import (
    get_course_by_id,
    list_training_courses,
    insert_training_course,
    get_lesson_by_id,
    insert_training_lesson,
    update_lesson_material_url,
    update_lesson_transcode_status,
    mark_lesson_transcode_failed,
    mark_lesson_ready,
    get_lesson_by_transcoder_job_name,
)

from constants import (
    project,
    location,
    pubsub_topic,
    bucket_name,
    ALLOWED_COURSE_TYPES,
    ALLOWED_COURSE_STATUSES,
    ALLOWED_LESSON_MATERIAL_TYPES,
    ALLOWED_MATERIAL_CONTENT_TYPES,
    ALLOWED_VIDEO_CONTENT_TYPES,
    ALLOWED_DOCUMENT_CONTENT_TYPES,
)

logger = logging.getLogger(__name__)


def _get_gcs_bucket():
    """Return (client, bucket) or raise if BUCKET_NAME is not set. Mirrors addTraining_v2._get_gcs_bucket."""
    
    if not bucket_name:
        raise EnvironmentError("BUCKET_NAME env var is not set")
    
    client = storage.Client(project=project)
    return client, client.bucket(bucket_name)


def _rows_to_dicts(rows):
    """Row -> dict, with datetime/enum values normalized to JSON-safe values."""
    results = []
    for row in rows:
        entry = dict(row._mapping)
        for key, value in entry.items():
            if hasattr(value, "isoformat"):
                entry[key] = value.isoformat()
        if entry.get("course_type"):
            entry["course_type"] = str(entry["course_type"])
        if entry.get("course_status"):
            entry["course_status"] = str(entry["course_status"])
        results.append(entry)
    return results


def list_courses(schema):
    """Admin course-management landing page — every course (draft + published) with lesson/quiz counts."""
    rows = list_training_courses(schema)
    courses = _rows_to_dicts(rows)
    return {"courses": courses, "shown": len(courses), "total": len(courses)}


def create_upload_url(filename, content_type):
    """Issue a GCS resumable-upload session URL so the browser uploads lesson material straight to GCS
    (bypasses the function's body-size limit, needed for video). Uses the function's normal GCS write
    permission (same as the multipart upload paths) — no signing, no extra IAM grant needed."""
    if not filename or not content_type:
        raise ValueError("filename and content_type are required")
    if content_type not in ALLOWED_MATERIAL_CONTENT_TYPES:
        raise ValueError(f"Unsupported content_type: {content_type}")

    safe_name = secure_filename(filename) or "upload"
    material_path = f"training-courses/{uuid.uuid4()}/{safe_name}"

    _, bucket = _get_gcs_bucket()
    blob = bucket.blob(material_path)
    upload_url = blob.create_resumable_upload_session(content_type=content_type, origin="*")
    return {
        "upload_url": upload_url,
        "material_path": material_path,
    }


def _finalize_material_url(material_path):
    """Verify the blob from create_upload_url landed in GCS, then return its gs:// reference for material_url."""
    _, bucket = _get_gcs_bucket()
    blob = bucket.blob(material_path)
    if not blob.exists():
        raise ValueError(f"No uploaded file found at material_path: {material_path}")
    return f"gs://{bucket.name}/{material_path}"


def create_course(schema, data):
    """Validate + insert into training_courses. Course-level metadata only — material lives on training_lessons."""
    title = (data.get("title") or "").strip()
    course_type = (data.get("course_type") or "").strip()
    if not title or not course_type:
        raise ValueError("title and course_type are required")
    if course_type not in ALLOWED_COURSE_TYPES:
        raise ValueError(f"course_type must be one of {sorted(ALLOWED_COURSE_TYPES)}")

    course_status = data.get("course_status") or "Draft"
    if course_status not in ALLOWED_COURSE_STATUSES:
        raise ValueError(f"course_status must be one of {sorted(ALLOWED_COURSE_STATUSES)}")

    course_id = insert_training_course(
        schema,
        title=title,
        description=data.get("description"),
        course_type=course_type,
        duration_minutes=data.get("duration_minutes"),
        course_status=course_status,
    )
    return {"course_id": course_id}


def create_lesson(schema, data):
    """Validate + insert into training_lessons; resolves material_path to material_url if given."""
    course_id = data.get("course_id")
    sequence = data.get("sequence")
    title = (data.get("title") or "").strip()
    material_type = (data.get("material_type") or "").strip()

    if not course_id or not sequence or not title or not material_type:
        raise ValueError("course_id, sequence, title and material_type are required")
    if material_type not in ALLOWED_LESSON_MATERIAL_TYPES:
        raise ValueError(f"material_type must be one of {sorted(ALLOWED_LESSON_MATERIAL_TYPES)}")

    material_path = data.get("material_path")
    material_url = _finalize_material_url(material_path) if material_path else None

    if not get_course_by_id(schema, course_id):
        raise LookupError(f"Training course with id {course_id} not found")

    lesson_id = insert_training_lesson(
        schema,
        course_id=course_id,
        sequence=sequence,
        title=title,
        material_type=material_type,
        duration_minutes=data.get("duration_minutes"),
        material_url=material_url,
        text_body=data.get("text_body"),
    )
    return {"lesson_id": lesson_id, "materialUrl": material_url}


def _parse_lesson_id(lesson_id_raw):
    """Validate and coerce the lesson_id form field to an int."""
    if not lesson_id_raw:
        raise ValueError("lesson_id is required")
    try:
        return int(lesson_id_raw)
    except ValueError:
        raise ValueError("lesson_id must be an integer")


def _submit_hls_transcode_job(bucket_name, lesson_id, source_path):
    if not project or not location:
        # Fails fast instead of the Transcoder API's cryptic "Malformed name" 400 (e.g. "locations//jobs/...").
        raise EnvironmentError(
            f"Cannot submit transcode job: GCP_PROJECT/GOOGLE_CLOUD_PROJECT={project!r}, "
            f"TRANSCODER_LOCATION={location!r} — both must be set"
        )

    output_uri = f"gs://{bucket_name}/training-courses/lessons/{lesson_id}/video/hls/"

    job = transcoder_v1.Job(
        input_uri=f"gs://{bucket_name}/{source_path}",
        output_uri=output_uri,
        config=transcoder_v1.JobConfig(
            elementary_streams=[
                transcoder_v1.ElementaryStream(
                    key="video-hd",
                    video_stream=transcoder_v1.VideoStream(
                        h264=transcoder_v1.VideoStream.H264CodecSettings(
                            # width_pixels omitted so the API derives it, preserving the source's aspect ratio.
                            height_pixels=720,
                            bitrate_bps=3_000_000,
                            frame_rate=30,
                        ),
                    ),
                ),
                transcoder_v1.ElementaryStream(
                    key="audio-stereo",
                    audio_stream=transcoder_v1.AudioStream(
                        codec="aac",
                        bitrate_bps=64_000,
                    ),
                ),
            ],
            mux_streams=[
                transcoder_v1.MuxStream(
                    key="hls-video-hd",
                    container="ts",
                    elementary_streams=["video-hd"],
                    segment_settings=transcoder_v1.SegmentSettings(
                        segment_duration=duration_pb2.Duration(seconds=6),
                    ),
                ),
                transcoder_v1.MuxStream(
                    key="hls-audio-stereo",
                    container="ts",
                    elementary_streams=["audio-stereo"],
                    segment_settings=transcoder_v1.SegmentSettings(
                        segment_duration=duration_pb2.Duration(seconds=6),
                    ),
                ),
            ],
            manifests=[
                transcoder_v1.Manifest(
                    file_name="master.m3u8",
                    type_=transcoder_v1.Manifest.ManifestType.HLS,
                    mux_streams=["hls-video-hd", "hls-audio-stereo"],
                ),
            ],
        ),
    )
    if pubsub_topic:
        job.config.pubsub_destination = transcoder_v1.PubsubDestination(topic=pubsub_topic)

    created_job = transcoder_v1.TranscoderServiceClient().create_job(
        parent=f"projects/{project}/locations/{location}", job=job)
    return created_job.name

def _upload_lesson_material(schema, lesson_id_raw, uploaded_file, allowed_content_types, path_prefix):
    """Shared multipart-upload path for lesson documents/videos: validate, upload to GCS, update material_url."""
    lesson_id = _parse_lesson_id(lesson_id_raw)
    if uploaded_file is None or not uploaded_file.filename:
        raise ValueError("No file uploaded. Send the file with form field 'file'")

    content_type = uploaded_file.mimetype or "application/octet-stream"
    if content_type not in allowed_content_types:
        raise ValueError(f"Unsupported content_type: {content_type}")

    if not get_lesson_by_id(schema, lesson_id):
        raise LookupError(f"Training lesson with id {lesson_id} not found")

    safe_name = secure_filename(uploaded_file.filename) or "upload"
    material_path = f"{path_prefix.format(lesson_id=lesson_id)}/{safe_name}"

    _, bucket = _get_gcs_bucket()
    blob = bucket.blob(material_path)
    blob.upload_from_file(uploaded_file.stream, content_type=content_type)
    # Uniform bucket-level access means objects can't be public; store a stable gs:// reference.
    material_url = f"gs://{bucket.name}/{material_path}"

    update_lesson_material_url(schema, lesson_id, material_url)
    return {"lesson_id": lesson_id, "materialUrl": material_url, "material_path": material_path}


def upload_lesson_document(schema, lesson_id_raw, uploaded_file):
    """Upload a lesson document (PDF/PPTX) to GCS and store its URL on the lesson."""
    return _upload_lesson_material(
        schema, lesson_id_raw, uploaded_file,
        ALLOWED_DOCUMENT_CONTENT_TYPES, "training-courses/lessons/{lesson_id}",
    )

def _submit_and_record_transcode(schema, lesson_id, material_path):
    """Submit the HLS transcode job for an uploaded video and record its status. Shared by the multipart and signed-URL upload paths."""
    try:
        job_name = _submit_hls_transcode_job(bucket_name, lesson_id, material_path)
        update_lesson_transcode_status(schema, lesson_id, job_name)
    except Exception as e:
        logger.error(f"Failed to submit transcode job for lesson_id={lesson_id}: {e}")
        mark_lesson_transcode_failed(schema, lesson_id)
        raise
    return {"material_upload_status": "Processing", "transcoder_job_name": job_name}


def upload_lesson_video(schema, lesson_id_raw, uploaded_file):
    result = _upload_lesson_material(
        schema, lesson_id_raw, uploaded_file,
        ALLOWED_VIDEO_CONTENT_TYPES, "training-courses/lessons/{lesson_id}/video/source",
    )
    lesson_id = result["lesson_id"]
    transcode = _submit_and_record_transcode(schema, lesson_id, result["material_path"])
    return {"lesson_id": lesson_id, "materialUrl": result["materialUrl"], **transcode}


def finalize_lesson_video_upload(schema, lesson_id_raw, material_path):
    """After a signed-URL upload lands the video in GCS, finalize material_url and submit the HLS transcode job."""
    lesson_id = _parse_lesson_id(lesson_id_raw)
    if not material_path:
        raise ValueError("material_path is required")
    if not get_lesson_by_id(schema, lesson_id):
        raise LookupError(f"Training lesson with id {lesson_id} not found")

    material_url = _finalize_material_url(material_path)
    update_lesson_material_url(schema, lesson_id, material_url)
    transcode = _submit_and_record_transcode(schema, lesson_id, material_path)
    return {"lesson_id": lesson_id, "materialUrl": material_url, **transcode}


def finalize_lesson_document_upload(schema, lesson_id_raw, material_path):
    """After the browser PUTs a document straight to GCS via a signed URL, record its material_url on the lesson."""
    lesson_id = _parse_lesson_id(lesson_id_raw)
    if not material_path:
        raise ValueError("material_path is required")
    if not get_lesson_by_id(schema, lesson_id):
        raise LookupError(f"Training lesson with id {lesson_id} not found")

    material_url = _finalize_material_url(material_path)
    update_lesson_material_url(schema, lesson_id, material_url)
    return {"lesson_id": lesson_id, "materialUrl": material_url}

def handle_transcode_callback(schema, data):
    """Process a Transcoder job completion payload relayed via event_subscriptions_config, update the owning lesson."""
    job = data.get("job", {})
    job_name = job.get("name")
    job_state = job.get("state")
    job_error = job.get("error")

    if not job_name or job_state not in ("SUCCEEDED", "FAILED"):
        return {"ignored": True}  # PENDING/RUNNING shouldn't reach here, but ignore defensively

    row = get_lesson_by_transcoder_job_name(schema, job_name)
    if row is None:
        logger.warning(f"No lesson found for transcoder job {job_name}")
        return {"ignored": True}
    if row.material_upload_status in ("Ready", "Failed"):
        return {"ignored": True}  # already handled — Pub/Sub delivers at-least-once

    if job_state == "SUCCEEDED":
        manifest_path = f"gs://{bucket_name}/training-courses/lessons/{row.lesson_id}/video/hls/master.m3u8"
        mark_lesson_ready(schema, row.lesson_id, manifest_path)
        return {"lesson_id": row.lesson_id, "material_upload_status": "Ready"}

    logger.error(f"Transcode failed for lesson_id={row.lesson_id} job={job_name}: {job_error}")
    mark_lesson_transcode_failed(schema, row.lesson_id)
    return {"lesson_id": row.lesson_id, "material_upload_status": "Failed"}