import axios from "axios";
import { BASE_URL } from "../config/apiConfig";

/**
 * Fetch all certificate ecosystem entries (provider–certificate mappings).
 * GET add_certificate_v2 → list of { id, certProvider, certName, certLevel, validYears, ... }
 * @returns {Promise<Array>}
 */
export const fetchCertificateMappings = async () => {
  const response = await axios.get(`${BASE_URL}add_certificate_v2`);
  if (Array.isArray(response.data)) return response.data;
  if (response.data?.results && Array.isArray(response.data.results)) return response.data.results;
  return [];
};

/**
 * Fetch a single certificate entry by mapping id.
 * @param {number} id - mapping id
 * @returns {Promise<Object>}
 */
export const getCertificateById = async (id) => {
  const response = await axios.get(`${BASE_URL}add_certificate_v2`, { params: { id } });
  return response.data;
};

/**
 * Add a new certificate entry (provider + certificate + mapping).
 * Requires employee_id (dept/admin role), certProvider, certName, certLevel.
 * @param {Object} payload
 * @param {number} payload.employee_id - Required (db employee id)
 * @param {string} payload.certProvider
 * @param {string} payload.certName
 * @param {string} payload.certLevel
 * @param {number} [payload.validYears]
 * @returns {Promise<Object>} API response with mapping_id, provider_id, certificate_id
 */
export const addCertificate = async (payload) => {
  const response = await axios.post(`${BASE_URL}add_certificate_v2`, payload, {
    headers: { "Content-Type": "application/json" },
  });
  return response.data;
};

/**
 * Update an existing certificate mapping.
 * @param {Object} payload
 * @param {number} payload.id - mapping id (required)
 * @param {number} payload.employee_id - required
 * @param {string} [payload.certProvider]
 * @param {string} [payload.certName] - if updating cert, must send certLevel too
 * @param {string} [payload.certLevel]
 * @returns {Promise<Object>}
 */
export const updateCertificate = async (payload) => {
  const response = await axios.put(`${BASE_URL}add_certificate_v2`, payload, {
    headers: { "Content-Type": "application/json" },
  });
  return response.data;
};

/**
 * Delete a certificate mapping.
 * @param {{ id: number, employee_id: number }} params - mapping id and employee_id
 * @returns {Promise<void>}
 */
export const deleteCertificate = async ({ id, employee_id }) => {
  await axios.delete(`${BASE_URL}add_certificate_v2`, {
    params: { id, employee_id },
  });
};

/**
 * Bulk upload certificate mappings from a CSV or Excel file.
 * POST add_certificate_v2/bulk-upload with multipart/form-data: file, employee_id.
 * Required columns: Certificate Provider, Certificate Name. Optional: Certificate Level, Valid Years, Is Active.
 * @param {File} file - CSV or Excel file
 * @param {number} employeeId - Required (db employee id, must have dept/admin role)
 * @returns {Promise<Object>} API response with successful_inserts, skipped_existing, errors, total_rows
 */
export const uploadCertificateCSV = async (file, employeeId) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("employee_id", String(employeeId));
  const response = await axios.post(`${BASE_URL}add_certificate_v2/bulk-upload`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
};
