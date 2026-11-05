import os

project = os.getenv("GCP_PROJECT") or os.getenv("GOOGLE_CLOUD_PROJECT")
bucket_name = os.getenv("BUCKET_NAME")
location = os.getenv("TRANSCODER_LOCATION", "")
pubsub_topic = os.getenv("TRANSCODER_PUBSUB_TOPIC")

ALLOWED_COURSE_TYPES = {"Training", "Policy"}
ALLOWED_COURSE_STATUSES = {"Draft", "Published", "Archived"}

# Maps an uploaded file's content_type to the training_lessons.material_type enum value.
VIDEO_CONTENT_TYPES = {
    "video/mp4": "Video",
    "video/webm": "Video",
}
DOCUMENT_CONTENT_TYPES = {
    "application/pdf": "Document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "Document",
}
MATERIAL_TYPE_BY_CONTENT_TYPE = {**VIDEO_CONTENT_TYPES, **DOCUMENT_CONTENT_TYPES}
ALLOWED_MATERIAL_CONTENT_TYPES = set(MATERIAL_TYPE_BY_CONTENT_TYPE)
ALLOWED_VIDEO_CONTENT_TYPES = set(VIDEO_CONTENT_TYPES)
ALLOWED_DOCUMENT_CONTENT_TYPES = set(DOCUMENT_CONTENT_TYPES)
ALLOWED_LESSON_MATERIAL_TYPES = {"Video", "Document", "Text", "Quiz"}