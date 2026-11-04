// Pure aggregation helpers for the certification chart. Separate from
// trainingAnalyticsAggregation.js since certificates have no batch/quarter/
// area link and their own status vocabulary.

import { getCertExpiryStatus } from "../../shared/config/certRecordAdapter";

// Best-to-worst, matching CERT_STATUS_COLORS' key order in chartPalette.js.
const CERT_STATUS_ORDER = ["Valid", "Expiring Soon", "Expired"];

/**
 * Count of certificate records per expiry status, derived client-side via
 * getCertExpiryStatus (no stored status column). Counts records, not
 * distinct employees — one employee can contribute to more than one bucket.
 * @param {Array<object>} records - raw rows from fetchCertificateAnalytics
 * @returns {{ buckets: Array<{key:string,label:string,count:number}>, total: number }}
 */
export function countCertificatesByStatus(records) {
  const counts = new Map(CERT_STATUS_ORDER.map((status) => [status, 0]));
  for (const record of records) {
    const status = getCertExpiryStatus(record.expiry_date);
    counts.set(status, (counts.get(status) || 0) + 1);
  }

  const buckets = CERT_STATUS_ORDER.map((status) => ({ key: status, label: status, count: counts.get(status) }));
  return { buckets, total: records.length };
}

// Mirrors filterRecords in trainingAnalyticsAggregation.js, keyed on cert_provider instead.
export function filterCertRecords(records, { providers = [] } = {}) {
  if (providers.length === 0) return records;
  return records.filter((record) => providers.includes(record.cert_provider));
}
