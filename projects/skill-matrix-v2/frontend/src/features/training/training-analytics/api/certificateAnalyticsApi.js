import axios from "axios";
import { getApiUrl } from "../../../../config/apiConfig";

/**
 * Fetch raw employee-certificate records (one row per employee_certificates
 * entry, joined with cert name/provider/level) for client-side aggregation.
 * Hits get_training_analytics_v2 with `?mode=certificates`. Certifications
 * have no batch/hierarchy link, so this set can't be cross-filtered by
 * Area/Sub Area/Module/Batch Quarter.
 * @returns {Promise<{ count: number, records: Array<object> }>}
 */
export const fetchCertificateAnalytics = async () => {
  const response = await axios.get(getApiUrl("get_training_analytics_v2"), { params: { mode: "certificates" } });
  const data = response.data || {};
  return { count: data.count ?? 0, records: data.records ?? [] };
};
