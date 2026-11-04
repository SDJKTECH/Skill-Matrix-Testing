"""
Sends the training nomination/approve/reject emails.

Same transport as backend/skills/saveEmployeeSkill_v2's L3 skill-review
email: POST to SEND_EMAIL_URL with {to, subject, body}, plus a service
identity token (send_mail_v2 is private, IAM-invoker-only, like every
other function here). Best-effort -- a failed or misconfigured send never
blocks the request that triggered it.
"""
import html
import logging
import os
import re
from typing import Optional
from urllib.parse import urlencode, urlparse

import requests
from flask import Request

from constants import APP_URL as DEFAULT_APP_URL

# utils/ is copied next to main.py only at deploy time. Locally, main.py adds
# backend/ to sys.path after this import runs, so the import may fail here.
try:
    from utils.service_auth import get_service_id_token
except ImportError:
    get_service_id_token = None

logger = logging.getLogger(__name__)

SEND_EMAIL_URL = os.getenv("SEND_EMAIL_URL")

TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), "templates")


def resolve_app_url(request: Request) -> Optional[str]:
    """Email deep-link base URL: the request's Origin header, else DEFAULT_APP_URL.

    Call this while handling the request -- `request` itself isn't valid
    once the request finishes.
    """
    origin = request.headers.get("Origin")
    if origin:
        parsed = urlparse(origin)
        if parsed.scheme in ("http", "https") and parsed.netloc:
            return f"{parsed.scheme}://{parsed.netloc}/"
        logger.warning(f"[training-email] ignoring malformed Origin header: {origin!r}")
    return DEFAULT_APP_URL


def _load_template(filename):
    """Read one HTML template file. Returns "" if it's missing."""
    path = os.path.join(TEMPLATE_DIR, filename)
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        return ""


NOMINATION_TEMPLATE = _load_template("nomination_submitted.html")
APPROVED_TEMPLATE = _load_template("training_approved.html")
REJECTED_TEMPLATE = _load_template("training_rejected.html")


def send_training_email(to, subject, body, context=""):
    """
    POST {to, subject, body} to the email service. Never raises.

    `context` (e.g. "event=approved employee_training_id=5881") is added
    to every log line, so a failure can be traced back to the record that
    caused it. Every line starts with "[training-email]" -- grep that tag
    to see the whole flow.

    Log level: INFO on success, WARNING for an expected skip (no
    recipient, not configured), ERROR for a real send failure, EXCEPTION
    for a raised request error (keeps the traceback).
    """
    tag = f"[training-email]{' ' + context if context else ''}"
    if not to:
        logger.warning(f"{tag} skipped: no recipient email")
        return
    if not SEND_EMAIL_URL:
        logger.warning(f"{tag} skipped: SEND_EMAIL_URL not configured")
        return
    headers = {}
    if get_service_id_token:
        token = get_service_id_token(SEND_EMAIL_URL)
        if token:
            headers["X-Serverless-Authorization"] = f"Bearer {token}"
    try:
        response = requests.post(
            SEND_EMAIL_URL,
            json={"to": to, "subject": subject, "body": body},
            headers=headers,
            timeout=10,
        )
        if response.status_code != 200:
            logger.error(
                f"{tag} send failed: to={to} subject={subject!r} "
                f"{SEND_EMAIL_URL} returned {response.status_code}: {response.text[:500]}"
            )
        else:
            logger.info(f"{tag} sent: to={to} subject={subject!r}")
    except requests.RequestException:
        logger.exception(f"{tag} send failed: to={to} subject={subject!r} request to {SEND_EMAIL_URL} raised")


def _note_paragraph(note, lead_in):
    """
    Italic aside for {{note_line}}, or "" if there's no note.

    `lead_in` is the full lead-in sentence, so one function covers both the
    nominee's note wording and the manager's.
    """
    if not note:
        return ""
    return (
        f'<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;'
        f'line-height:22px;color:#334155;font-style:italic;">'
        f'{html.escape(lead_in)} &ldquo;{html.escape(note)}&rdquo;</p>'
    )


# Default text the frontend sends when a manager approves without a note.
# It is not a real note, so treat it as no note.
_GENERIC_APPROVAL_NOTE = "approved via manager dashboard"


def _display_nominated_by(nominated_by):
    """'Self nomination' or the nominator's name (employee_trainings.nominated_by)."""
    return nominated_by or "Not specified"


def _deep_link_url(app_url, batch_num, view=None):
    """
    Link to the batch's own row on the Training Batches page, not just the
    bare homepage (see frontend's useGoToTrainingBatches and
    useTrainingEmailDeepLink).

    `view="review"` marks this as the manager's review visit.
    """
    if not batch_num:
        return app_url
    params = {"batch": batch_num}
    if view:
        params["view"] = view
    return f"{app_url}?{urlencode(params)}"


# Some email apps turn text like "DE-2026" into a flight link. We add an
# invisible character to stop this (only in shown text, not in links).
_AUTOLINK_BREAK_PATTERN = re.compile(r"([A-Za-z]{2,3})(-?)(\d{1,4})")
# Invisible character U+200C, written as an escape so editors keep it.
_ZWNJ = "\u200c"


def _break_autolink_pattern(value):
    """Insert a zero-width non-joiner at any airline-code-like boundary in `value`."""
    return _AUTOLINK_BREAK_PATTERN.sub(rf"\1{_ZWNJ}\2\3", value)


def _fill_common(template, employee_name, training_name, batch_num, recipient_name, skill_matrix_url):
    """Fill the placeholders every template shares. `recipient_name` drives the
    salutation and can differ from `employee_name` (e.g. the nomination
    email's recipient is the manager, not the nominee)."""
    return (
        template.replace("{{recipient_name}}", html.escape(recipient_name or "there"))
        .replace("{{employee_name}}", html.escape(employee_name or "there"))
        .replace("{{training_name}}", html.escape(training_name or ""))
        .replace("{{batch_num}}", html.escape(_break_autolink_pattern(batch_num or "")))
        .replace("{{skill_matrix_url}}", html.escape(skill_matrix_url))
    )


def build_nomination_submitted_email(app_url, employee_name, training_name, batch_num, manager_name, note=None):
    """(subject, body) when an employee self-nominates. Notifies the manager."""
    if not NOMINATION_TEMPLATE or not app_url:
        logger.warning("[training-email] skipped: nomination_submitted.html or app_url not configured")
        return None, None
    link = _deep_link_url(app_url, batch_num, view="review")
    body = _fill_common(NOMINATION_TEMPLATE, employee_name, training_name, batch_num, manager_name, link)
    lead_in = f"{employee_name or 'The nominee'} included the following note:"
    body = body.replace("{{note_line}}", _note_paragraph(note, lead_in))
    subject = f"New nomination: {training_name or 'Training'} for {employee_name or 'Employee'}"
    return subject, body


def build_training_approved_email(app_url, employee_name, training_name, batch_num, nominated_by=None, note=None):
    """(subject, body) when a manager approves. Notifies the employee."""
    if not APPROVED_TEMPLATE or not app_url:
        logger.warning("[training-email] skipped: training_approved.html or app_url not configured")
        return None, None
    link = _deep_link_url(app_url, batch_num)
    body = _fill_common(APPROVED_TEMPLATE, employee_name, training_name, batch_num, employee_name, link)
    body = body.replace("{{nominated_by}}", html.escape(_display_nominated_by(nominated_by)))
    has_note = note and note.strip().lower() != _GENERIC_APPROVAL_NOTE
    note_html = _note_paragraph(note, "Your manager added the following note:") if has_note else ""
    body = body.replace("{{note_line}}", note_html)
    subject = f"Approved: {training_name or 'Training'} nomination for {employee_name or 'Employee'}"
    return subject, body


def build_training_rejected_email(app_url, employee_name, training_name, batch_num, reason, nominated_by=None):
    """(subject, body) when a manager rejects. Notifies the employee with the reason."""
    if not REJECTED_TEMPLATE or not app_url:
        logger.warning("[training-email] skipped: training_rejected.html or app_url not configured")
        return None, None
    link = _deep_link_url(app_url, batch_num)
    body = _fill_common(REJECTED_TEMPLATE, employee_name, training_name, batch_num, employee_name, link)
    body = body.replace("{{nominated_by}}", html.escape(_display_nominated_by(nominated_by)))
    body = body.replace("{{reason}}", html.escape(reason or ""))
    subject = f"Update on your {training_name or 'training'} nomination"
    return subject, body
