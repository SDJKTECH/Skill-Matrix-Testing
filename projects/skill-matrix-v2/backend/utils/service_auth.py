"""
Mints a Google-signed identity token for calling this project's other
private Cloud Functions server-to-server (e.g. a function POSTing to
send_mail_v2).

Every HTTP function in this repo deploys private, IAM-invoker-only --
see docs/deployment/PRIVATE_FUNCTIONS_PROXY_HANDOFF.md. Until now the only
caller of a private function was frontend/server.mjs, which mints a token
from the metadata server and sends it as X-Serverless-Authorization so it
doesn't collide with the end-user's SSO JWT in Authorization. This mirrors
that exact approach (same endpoint, same header) for backend-to-backend
calls, rather than adding a google-auth dependency.

Returns None (never raises) when the metadata server is unreachable, e.g.
local `functions-framework` dev -- callers should send the request without
the header in that case, same as frontend/server.mjs's SKIP_GOOGLE_ID_TOKEN
does locally. The target function doesn't need to change: IAM validates the
token, not application code.
"""
from __future__ import annotations

import logging
import urllib.error
import urllib.request
from typing import Optional
from urllib.parse import quote

logger = logging.getLogger(__name__)

METADATA_ID_TOKEN_URL = (
    "http://metadata.google.internal/computeMetadata/v1/instance/"
    "service-accounts/default/identity"
)


def get_service_id_token(audience: str) -> Optional[str]:
    """Google ID token scoped to `audience` (a function URL), or None if
    the metadata server isn't reachable."""
    url = f"{METADATA_ID_TOKEN_URL}?audience={quote(audience, safe='')}&format=full"
    try:
        req = urllib.request.Request(url, headers={"Metadata-Flavor": "Google"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            token = resp.read().decode("utf-8").strip()
            return token or None
    except Exception as err:
        logger.warning("Could not mint service ID token for %s: %s", audience, err)
        return None
