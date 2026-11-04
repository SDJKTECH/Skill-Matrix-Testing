import axios from "axios";
import { getApiUrl } from "../../../../config/apiConfig";

/**
 * Fetch raw employee-training records (one row per employee_trainings entry,
 * joined with area/sub-area/module/quarter names) for client-side
 * aggregation and cross-filtering.
 * @returns {Promise<{ count: number, records: Array<object> }>}
 */
export const fetchTrainingAnalytics = async () => {
  const response = await axios.get(getApiUrl("get_training_analytics_v2"));
  const data = response.data || {};
  return { count: data.count ?? 0, records: data.records ?? [] };
};
