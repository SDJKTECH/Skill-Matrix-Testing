import axios from "axios";
import { BASE_URL } from "../config/apiConfig";

const TRAINING_BASE = `${BASE_URL}add_training_v2`;
const BATCH_URL = `${TRAINING_BASE}/training_batch`;

/**
 * Get all training batches.
 * GET /training_batch -> { batches, count }. Each batch also has its area,
 * sub-area and module names.
 * @returns {Promise<{ count: number, results: Array }>}
 */
export const fetchBatches = async () => {
  const response = await axios.get(BATCH_URL);
  const data = response.data || {};
  const results = data.batches ?? data.batch ?? [];
  return { count: data.count ?? results.length, results };
};

/**
 * Create a training batch. The backend finds the area/sub-area/module by name
 * (or creates them if new). Each batch_num must be unique.
 * @param {Object} payload
 * @param {number} payload.admin_id - Required (must have dept/admin/hr role)
 * @param {string} payload.area - Required
 * @param {string} payload.subarea - Required
 * @param {string} payload.module - Required
 * @param {string} [payload.batch_num] - batch number/identifier
 * @param {string} [payload.batch_status]
 * @param {string} [payload.start_date]
 * @param {string} [payload.end_date]
 * @returns {Promise<{ message: string, batch_id: number, training_hierarchy_id: number, created_by: number, created: boolean }>}
 */
export const createBatch = async (payload) => {
  const response = await axios.post(BATCH_URL, payload, {
    headers: { "Content-Type": "application/json" },
  });
  return response.data;
};

/**
 * Update a training batch. The batch is found by batch_id (this also lets you
 * rename batch_num), or by batch_num if batch_id is not sent. A field sent as
 * null is cleared; a field not sent stays the same.
 * @param {Object} payload - createBatch's payload shape plus batch_id.
 */
export const updateBatch = async (payload) => {
  const response = await axios.put(BATCH_URL, payload, {
    headers: { "Content-Type": "application/json" },
  });
  return response.data;
};

/**
 * Delete a training batch by its id.
 * If employees are still enrolled in it, the request fails with status 409
 * and err.response.data.employee_training_count tells how many.
 * @param {number} batchId
 * @param {number} adminId - Required (must have dept/admin/hr role)
 */
export const deleteBatch = async (batchId, adminId) => {
  await axios.delete(BATCH_URL, { params: { batch_id: batchId, admin_id: adminId } });
};
