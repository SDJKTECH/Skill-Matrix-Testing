/**
 * Production SPA + same-origin API proxy for Cloud Run.
 *
 * - Serves the Vite build from ./dist
 * - Proxies API paths to FUNCTIONS_BASE_URL (Cloud Functions)
 * - Attaches Google identity token via X-Serverless-Authorization
 *   (keeps end-user SSO JWT in Authorization)
 *
 * The proxy exists to satisfy IAM (private functions, no allUsers). It does not
 * gate users by default: the app bootstraps some reads before login, so
 * requiring a Bearer here would 401 those and log the user out. Set
 * REQUIRE_SSO_JWT=true to additionally enforce gateway verification.
 *
 * Env:
 *   PORT                 Cloud Run port (default 8080)
 *   FUNCTIONS_BASE_URL   e.g. https://asia-south1-PROJECT.cloudfunctions.net/
 *                        or .../dev_ for development-prefixed functions
 *   REQUIRE_SSO_JWT      set true to reject API calls without a valid SSO JWT
 *   SSO_VERIFY_URL       e.g. https://jktech-auth-gateway-....run.app/verify
 *   SKIP_GOOGLE_ID_TOKEN set true to skip metadata identity token (local only)
 */
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const FUNCTIONS_BASE_URL = (process.env.FUNCTIONS_BASE_URL || "").trim();
const SSO_VERIFY_URL =
  process.env.SSO_VERIFY_URL ||
  "https://jktech-auth-gateway-140475459295.asia-south1.run.app/verify";
const REQUIRE_SSO_JWT =
  String(process.env.REQUIRE_SSO_JWT || "").toLowerCase() === "true";
const SKIP_GOOGLE_ID_TOKEN =
  String(process.env.SKIP_GOOGLE_ID_TOKEN || "").toLowerCase() === "true";

const METADATA_ID_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";

/** Cache Google ID tokens by audience until near expiry. */
const idTokenCache = new Map();

function isApiPath(pathname) {
  const segment = pathname.replace(/^\//, "").split("/")[0] || "";
  if (!segment || segment.includes(".")) return false;
  if (
    /^(dev_)?(get_|save_|add_|update_|upload_|review_|manage_|ask_)/.test(
      segment
    )
  ) {
    return true;
  }
  return [
    "upload_cv",
    "review_certificate",
    "get_certificate_requests",
  ].includes(segment);
}

function buildTargetBase() {
  if (!FUNCTIONS_BASE_URL) {
    throw new Error("FUNCTIONS_BASE_URL is required in production");
  }
  return FUNCTIONS_BASE_URL;
}

function functionAudienceForPath(pathname) {
  const functionName = pathname.replace(/^\//, "").split("/")[0];
  const base = buildTargetBase();
  if (base.endsWith("_")) {
    return `${base}${functionName}`;
  }
  const normalized = base.endsWith("/") ? base : `${base}/`;
  return `${normalized}${functionName}`;
}

function targetUrlForPath(pathname) {
  const relative = pathname.replace(/^\//, "");
  const base = buildTargetBase();
  if (base.endsWith("_")) {
    return `${base}${relative}`;
  }
  const normalized = base.endsWith("/") ? base : `${base}/`;
  return `${normalized}${relative}`;
}

async function fetchGoogleIdToken(audience) {
  if (SKIP_GOOGLE_ID_TOKEN) {
    return null;
  }

  const cached = idTokenCache.get(audience);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token;
  }

  const url = `${METADATA_ID_TOKEN_URL}?audience=${encodeURIComponent(
    audience
  )}&format=full`;
  const res = await fetch(url, {
    headers: { "Metadata-Flavor": "Google" },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Failed to fetch identity token (${res.status}): ${body.slice(0, 200)}`
    );
  }
  const token = (await res.text()).trim();
  // Google ID tokens are typically ~1h; cache 50 minutes.
  idTokenCache.set(audience, {
    token,
    expiresAt: Date.now() + 50 * 60 * 1000,
  });
  return token;
}

async function validateSsoJwt(authorizationHeader) {
  if (!REQUIRE_SSO_JWT) {
    return { ok: true };
  }
  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    return { ok: false, status: 401, message: "Missing Authorization Bearer token" };
  }
  try {
    const res = await fetch(SSO_VERIFY_URL, {
      method: "GET",
      headers: {
        Authorization: authorizationHeader,
        Accept: "application/json",
      },
    });
    if (res.ok) {
      return { ok: true };
    }
    const text = await res.text();
    return {
      ok: false,
      status: res.status === 401 || res.status === 403 ? res.status : 401,
      message: text || "SSO token verification failed",
    };
  } catch (err) {
    console.error("SSO verify request failed:", err);
    return { ok: false, status: 503, message: "SSO verification unavailable" };
  }
}

const app = express();

if (!FUNCTIONS_BASE_URL) {
  console.warn(
    "WARNING: FUNCTIONS_BASE_URL is not set. API proxy will return 500 until it is configured."
  );
}

app.use(async (req, res, next) => {
  if (!isApiPath(req.path)) {
    return next();
  }

  if (!FUNCTIONS_BASE_URL) {
    return res
      .status(500)
      .json({ error: "FUNCTIONS_BASE_URL is not configured on the frontend service" });
  }

  const authHeader = req.headers.authorization || "";
  const verified = await validateSsoJwt(authHeader);
  if (!verified.ok) {
    return res.status(verified.status || 401).json({ error: verified.message });
  }

  let googleToken = null;
  try {
    const audience = functionAudienceForPath(req.path);
    googleToken = await fetchGoogleIdToken(audience);
  } catch (err) {
    console.error("Identity token error:", err);
    return res.status(502).json({
      error: "Failed to obtain Google identity token for Cloud Functions",
    });
  }

  // Stash for proxy onReq so we don't re-fetch per hop.
  req.skillMatrixGoogleToken = googleToken;
  req.skillMatrixTargetUrl = targetUrlForPath(req.path);
  return next();
});

const apiProxy = createProxyMiddleware({
  target: "http://127.0.0.1", // overridden per-request via router
  changeOrigin: true,
  selfHandleResponse: false,
  pathFilter: (pathname) => isApiPath(pathname),
  router: (req) => {
    const full = req.skillMatrixTargetUrl || targetUrlForPath(req.path);
    const u = new URL(full);
    return `${u.protocol}//${u.host}`;
  },
  pathRewrite: (pathAndQuery, req) => {
    const full = req.skillMatrixTargetUrl || targetUrlForPath(req.path);
    const u = new URL(full);
    // Preserve original query string from the incoming request.
    const incoming = new URL(req.originalUrl, "http://localhost");
    u.search = incoming.search;
    return `${u.pathname}${u.search}`;
  },
  on: {
    proxyReq: (proxyReq, req) => {
      // Keep end-user SSO JWT in Authorization; put Google ID token in
      // X-Serverless-Authorization so Cloud Run/Functions IAM can authenticate
      // the caller without dropping the user token.
      if (req.skillMatrixGoogleToken) {
        proxyReq.setHeader(
          "X-Serverless-Authorization",
          `Bearer ${req.skillMatrixGoogleToken}`
        );
      }
      if (req.headers.authorization) {
        proxyReq.setHeader("Authorization", req.headers.authorization);
      }
    },
    error: (err, _req, res) => {
      console.error("API proxy error:", err);
      if (res && !res.headersSent) {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Upstream Cloud Function proxy failed" }));
      }
    },
  },
});

app.use(apiProxy);

const distDir = path.join(__dirname, "dist");
app.use(express.static(distDir, { index: false, maxAge: "1h" }));

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(
    `Skill Matrix frontend listening on ${PORT}; FUNCTIONS_BASE_URL=${FUNCTIONS_BASE_URL || "(unset)"}`
  );
});
