# VITE_BASE_URL Configuration

## Current model (same-origin proxy)

The browser always calls **same-origin** paths (`/get_…`, `/save_…`, etc.):

| Environment | Browser `BASE_URL` | Who forwards to backends |
|-------------|--------------------|---------------------------|
| Local Vite | `/` | `vite.config.js` proxy → localhost function ports |
| Cloud Run | `/` | `frontend/server.mjs` → `FUNCTIONS_BASE_URL` + Google identity token |

Absolute `https://…cloudfunctions.net/…` values must **not** be used by the browser in production. Org policy blocks relying on public (`allUsers`) function invoker.

`dev_` prefixes belong on the **server** env `FUNCTIONS_BASE_URL` (e.g. ending in `dev_`), not in the browser path.

## Build args

| Arg | Recommended |
|-----|-------------|
| `VITE_BASE_URL` | `/` or empty |
| `VITE_SSO_URL` | Auth gateway URL |

If an older deploy still passes an absolute Cloud Functions base URL, `frontend/src/config/apiConfig.js` forces `/` so traffic still hits the container proxy once `server.mjs` is deployed.

## Runtime env (Cloud Run frontend)

See [PRIVATE_FUNCTIONS_PROXY_HANDOFF.md](./PRIVATE_FUNCTIONS_PROXY_HANDOFF.md) for `FUNCTIONS_BASE_URL`, invoker IAM, and private function deploy requirements (skill-matrix-deploy).
