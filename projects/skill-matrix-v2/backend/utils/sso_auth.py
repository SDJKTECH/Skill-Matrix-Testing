"""
Lightweight SSO JWT checks for Cloud Functions.

Opt-in: enforcement only happens when REQUIRE_SSO_AUTH=true. IAM (private
functions invoked by the frontend service account) is what keeps these
endpoints off the public internet; this adds user-level checks on top for
deployments that want them, without breaking callers that never sent a token.

When enabled, requires Authorization: Bearer <gateway JWT> and confirms it
with jktech-auth-gateway via SSO_VERIFY_URL.
"""

from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
from typing import Any, Dict, Optional, Tuple

from flask import Request, make_response

logger = logging.getLogger(__name__)

DEFAULT_SSO_VERIFY_URL = (
    "https://jktech-auth-gateway-140475459295.asia-south1.run.app/verify"
)


def _cors_headers() -> Dict[str, str]:
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
    }


def _unauthorized(message: str, status: int = 401):
    response = make_response(json.dumps({"error": message}), status)
    for key, value in _cors_headers().items():
        response.headers[key] = value
    response.headers["Content-Type"] = "application/json"
    return response


def require_sso_bearer(request: Request) -> Tuple[Optional[Dict[str, Any]], Any]:
    """
    Require a valid SSO Bearer token when REQUIRE_SSO_AUTH is enabled.

    Returns:
      (claims_or_empty_dict, None) on success or when disabled
      (None, flask_response) on failure
    """
    if str(os.getenv("REQUIRE_SSO_AUTH", "")).lower() not in ("1", "true", "yes"):
        return {}, None

    auth = request.headers.get("Authorization", "") or ""
    if not auth.startswith("Bearer ") or len(auth.split(" ", 1)[-1].strip()) < 10:
        return None, _unauthorized("Missing or invalid Authorization Bearer token")

    verify_url = (os.getenv("SSO_VERIFY_URL") or DEFAULT_SSO_VERIFY_URL).strip()
    if not verify_url:
        # Presence check only when verify URL intentionally cleared
        return {}, None

    try:
        req = urllib.request.Request(
            verify_url,
            headers={
                "Authorization": auth,
                "Accept": "application/json",
            },
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            body = resp.read().decode("utf-8") if resp else ""
            claims: Dict[str, Any] = {}
            if body:
                try:
                    parsed = json.loads(body)
                    if isinstance(parsed, dict):
                        claims = parsed
                except json.JSONDecodeError:
                    claims = {}
            return claims, None
    except urllib.error.HTTPError as err:
        logger.warning("SSO verify failed: HTTP %s", err.code)
        status = 401 if err.code in (401, 403) else 401
        return None, _unauthorized("SSO token verification failed", status=status)
    except Exception as err:
        logger.error("SSO verify error: %s", err)
        return None, _unauthorized("SSO verification unavailable", status=503)
