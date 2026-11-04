/**
 * API Configuration Helper
 *
 * Browser calls are always same-origin:
 * - Local Vite: relative `/…` → vite.config.js proxy → local functions
 * - Production Cloud Run: relative `/…` → server.mjs proxy → private Cloud Functions
 *   (proxy attaches Google identity token; browser never needs allUsers)
 *
 * VITE_BASE_URL may still be set at build time for legacy deploy scripts.
 * Absolute `*.cloudfunctions.net` values are ignored in the browser so production
 * always goes through the same-origin proxy. Prefer `/` or empty.
 *
 * Function naming:
 * - Development functions often use a `dev_` prefix on the *server* via
 *   FUNCTIONS_BASE_URL ending in `dev_` (not in the browser path).
 * - Browser paths stay unprefixed: `/get_certificate_mapping_v2`
 */

const configured = import.meta.env.VITE_BASE_URL || "";

/**
 * Same-origin base for all API calls.
 * Absolute Cloud Functions URLs are forced to `/` so prod uses the container proxy.
 */
const BASE_URL =
  !configured || configured.startsWith("http://") || configured.startsWith("https://")
    ? "/"
    : configured.endsWith("/") || configured.endsWith("_")
      ? configured
      : `${configured}/`;

/**
 * Get the API URL for a function
 * @param {string} functionName - The function name (e.g., 'get_certificate_mapping_v2')
 * @returns {string} - Same-origin path (or legacy absolute URL only if forced relative base)
 *
 * @example
 * // BASE_URL is '/'
 * // functionName is 'get_certificate_mapping_v2'
 * // Returns: '/get_certificate_mapping_v2'
 */
export const getApiUrl = (functionName) => {
  if (!functionName) {
    throw new Error("Function name is required");
  }

  if (BASE_URL.endsWith("/") || BASE_URL.endsWith("_")) {
    return `${BASE_URL}${functionName}`;
  }

  return `${BASE_URL}/${functionName}`;
};

/**
 * Export BASE_URL for direct use if needed
 */
export { BASE_URL };
