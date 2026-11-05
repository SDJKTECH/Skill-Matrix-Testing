"""
Shared outbound-email Cloud Function. POST {to, subject, body} (optional
base64 attachments); sends over SMTP. Deploys private -- callers attach a
service identity token via utils.service_auth.get_service_id_token.
"""
import base64
import logging
import os
import smtplib
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

from flask import jsonify, make_response
from dotenv import load_dotenv

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load from backend/.env for local development only (deployed functions use Cloud Functions env vars)
try:
    env_file = Path(__file__).parent.parent.parent / ".env"
    if env_file.exists():
        load_dotenv(env_file)
except Exception:
    pass

SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.outlook.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_EMAIL = os.getenv("SMTP_EMAIL")
SMTP_PASS = os.getenv("SMTP_PASS")


def _cors_response(data, status=200):
    response = make_response(jsonify(data), status)
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


def send_mail_v2(request):
    if request.method == "OPTIONS":
        response = make_response("", 204)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        return response

    if not SMTP_EMAIL or not SMTP_PASS:
        logger.error(
            "SMTP_EMAIL/SMTP_PASS not configured: SMTP_EMAIL_set=%s SMTP_PASS_set=%s",
            bool(SMTP_EMAIL), bool(SMTP_PASS),
        )
        return _cors_response({"error": "Email service is not configured"}, 500)

    to_email = subject = None  # defined before the try so the except block can always log them
    try:
        data = request.get_json(silent=True)
        if not data:
            logger.error("Missing JSON body in request")
            return _cors_response({"error": "Missing JSON body"}, 400)

        to_email = data.get("to")
        subject = data.get("subject")
        body = data.get("body")
        attachments = data.get("attachments", [])  # list of base64-encoded files

        missing_fields = [f for f in ("to", "subject", "body") if not data.get(f)]
        if missing_fields:
            logger.error("Missing required fields: %s", ", ".join(missing_fields))
            return _cors_response(
                {"error": f"Missing required fields: {', '.join(missing_fields)}"}, 400
            )

        msg = MIMEMultipart()
        msg["From"] = SMTP_EMAIL
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "html"))

        for attachment in attachments:
            filename = attachment.get("filename")
            filedata = attachment.get("content")
            if not (filename and filedata):
                continue
            part = MIMEApplication(base64.b64decode(filedata))
            part.add_header("Content-Disposition", f'attachment; filename="{filename}"')
            msg.attach(part)

        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_EMAIL, SMTP_PASS)
            server.send_message(msg)

        logger.info(f"Email sent: to={to_email} subject={subject!r}")
        return _cors_response({"success": True, "message": "Email sent successfully"})

    except Exception as e:
        logger.exception(f"Failed to send email: to={to_email} subject={subject!r}")
        return _cors_response({"error": str(e)}, 500)


"""
Local testing command:
functions-framework --target=send_mail_v2 --source main.py --debug --port=8121
"""

"""
Deployment command (Development):
gcloud functions deploy dev_send_mail_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point send_mail_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --no-allow-unauthenticated \
  --gen2 \
  --region asia-south1 \
  --set-env-vars ENV=development
"""

"""
Deployment command (Production):
gcloud functions deploy send_mail_v2 \
  --runtime python310 \
  --trigger-http \
  --entry-point send_mail_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --no-allow-unauthenticated \
  --gen2 \
  --region us-central1 \
  --set-env-vars ENV=production
"""
