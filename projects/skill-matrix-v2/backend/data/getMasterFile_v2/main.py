import datetime
import os
import logging
from pathlib import Path
from flask import jsonify, Request, make_response
from google.cloud import storage
from dotenv import load_dotenv

# Load from backend/.env for local development only (deployed functions use Cloud Functions env vars)
try:
    env_file = Path(__file__).parent.parent.parent / ".env"
    if env_file.exists():
        load_dotenv(env_file)
except Exception:
    # Silently continue - Cloud Functions use environment variables set during deployment
    pass

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

BUCKET_NAME = os.getenv("BUCKET_NAME")
GCP_PROJECT = os.getenv("GCP_PROJECT")
storage_client = storage.Client(project=GCP_PROJECT) if GCP_PROJECT else storage.Client()


def _cors_response(data, status=200):
    """Helper function to add CORS headers to any response (private - not an entry point)"""
    response = make_response(jsonify(data), status)
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


# download the csv and send it to frontend
def get_master_file_v2(request: Request):
    """Download master Skills or Certificates file as CSV/XLSX"""
    if request.method == "OPTIONS":
        # CORS preflight
        response = make_response("", 204)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        return response

    # Determine which master file to download
    master_type = request.args.get(
        "type", ""
    ).lower()  # expects "skills" or "certificates"
    if master_type not in ["skills", "certificates"]:
        return _cors_response(
            {"error": "Invalid type. Use 'skills' or 'certificates'."}, 400
        )

    try:
        # Determine filename in bucket
        # GCS bucket structure: master-skill-mapping/ and master-certificate-mapping/
        prefix = (
            "master-skill-mapping/Master_Skills"
            if master_type == "skills"
            else "master-certificate-mapping/Master_Certificates"
        )

        # Search for the file (CSV or XLSX)
        bucket = storage_client.bucket(BUCKET_NAME)
        blobs = list(bucket.list_blobs(prefix=prefix))

        if not blobs:
            return _cors_response(
                {"error": f"No master file found for '{master_type}'."}, 404
            )

        # Take the first file found
        blob = blobs[0]
        content = blob.download_as_bytes()
        file_name = blob.name.split("/")[-1]

        # Determine content type
        if file_name.endswith(".csv"):
            content_type = "text/csv"
        elif file_name.endswith((".xlsx", ".xls")):
            content_type = (
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            )
        else:
            content_type = "application/octet-stream"

        # Return file
        response = make_response(content)
        response.headers["Content-Disposition"] = f"attachment; filename={file_name}"
        response.headers["Content-Type"] = content_type
        response.headers["Access-Control-Allow-Origin"] = "*"
        return response

    except Exception as e:
        logger.exception("Unexpected error in get_master_file_v2")
        return _cors_response({"error": str(e)}, 500)


"""
Deployment command (Production):
gcloud functions deploy get_master_file_v2
  --runtime python310
  --trigger-http
  --entry-point get_master_file_v2
  --service-account training-project-419308@appspot.gserviceaccount.com
  --allow-unauthenticated
  --gen2
  --region asia-south1
  --set-env-vars ENV=production
"""
"""
Deployment command (Development):
gcloud functions deploy dev_get_master_file_v2
  --runtime python310
  --trigger-http
  --entry-point get_master_file_v2
  --service-account training-project-419308@appspot.gserviceaccount.com
  --allow-unauthenticated
  --gen2
  --region asia-south1
  --set-env-vars ENV=development
"""
