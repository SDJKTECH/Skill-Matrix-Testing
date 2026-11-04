import axios from "axios";
import { BASE_URL } from "../config/apiConfig";

const TRAINING_BASE = `${BASE_URL}add_training_v2`;

/**
 * Fetch training records.
 * GET / → all records { count, results }
 * GET ?employee_id=<int> → trainings for employee
 * GET ?id=<int> → single record
 * @param {{ employee_id?: number, id?: number }} params
 * @returns {Promise<{ count?: number, results: Array } | Object>}
 */
export const fetchTrainings = async (params = {}) => {
  const response = await axios.get(TRAINING_BASE, { params });
  if (response.data?.results !== undefined) {
    return { count: response.data.count, results: response.data.results };
  }
  if (Array.isArray(response.data)) {
    return { count: response.data.length, results: response.data };
  }
  return { count: 1, results: [response.data] };
};

/**
 * An employee asks to join a training batch (self-nomination).
 * We send nomination_request: true, so the request waits for a manager to
 * approve it. The optional note (up to 240 characters) is saved as status_remarks.
 */
export const requestTrainingNomination = async ({ employeeId, batch, note = null }) => {
  const response = await axios.post(
    TRAINING_BASE,
    {
      nomination_request: true,
      employee_id: employeeId,
      batch_id: batch.batch_id ?? batch.batchId,
      batch_num: batch.batch_num ?? batch.batchNum,
      area: batch.area_name ?? batch.areaName ?? null,
      subarea: batch.sub_area_name ?? batch.subAreaName ?? null,
      module: batch.module_name ?? batch.moduleName ?? null,
      competency: batch.area_name ?? batch.areaName ?? null,
      status_remarks: note || null,
    },
    { headers: { "Content-Type": "application/json" } }
  );
  return response.data;
};

/**
 * A manager approves or rejects one or more nomination requests.
 * The backend can update only one record at a time, so we send one request
 * per id. Promise.allSettled lets the other requests finish even if one fails.
 *
 * @param {{ ids: number|number[], action: "approve"|"reject", reason?: string, adminId: number, reviewerName?: string }} opts
 * @returns {Promise<{ results: Array, failures: Array<{employee_training_id: number, error: string}> }>} `results` = requests that worked, `failures` = requests that failed (empty if none).
 */
export const reviewTrainingNominations = async ({ ids, action, reason, adminId, reviewerName }) => {
  const employeeTrainingIds = (Array.isArray(ids) ? ids : [ids]).filter((id) => id != null);
  const trainingStatus = action === "approve" ? "Not Started" : "Not Completed";
  const statusRemarks =
    reason || (action === "approve" ? "Approved via Manager Dashboard" : "Rejected via Manager Dashboard");
  const reviewedAt = new Date().toISOString();

  const settled = await Promise.allSettled(
    employeeTrainingIds.map(async (id) => {
      const { results: existingResults } = await fetchTrainings({ id });
      const existing = existingResults?.[0];
      const batchNum = existing?.batch_num ?? existing?.batch ?? existing?.batchNum;

      const response = await axios.put(
        TRAINING_BASE,
        {
          employee_training_id: id,
          admin_id: adminId,
          batch_num: batchNum,
          training_status: trainingStatus,
          status_remarks: statusRemarks,
        },
        { headers: { "Content-Type": "application/json" } }
      );

      return {
        ...response.data?.record,
        employee_training_id: id,
        batch_num: batchNum,
        training_status: trainingStatus,
        // The backend does not save these 4 fields. They are shown on the screen
        // only until the page is reloaded.
        reviewed_by: adminId,
        reviewed_by_name: reviewerName || null,
        reviewed_at: reviewedAt,
        review_reason: statusRemarks,
      };
    })
  );

  const results = [];
  const failures = [];
  settled.forEach((outcome, idx) => {
    if (outcome.status === "fulfilled") {
      results.push(outcome.value);
    } else {
      failures.push({
        employee_training_id: employeeTrainingIds[idx],
        error: outcome.reason?.response?.data?.error || outcome.reason?.message || "Failed to save decision",
      });
    }
  });

  return { results, failures };
};

/**
 * Get all employees enrolled in one batch (using the batch id).
 * GET /add_training_v2?batch_id=<int>
 * @param {number} batchId
 * @returns {Promise<Array>}
 */
export const fetchBatchEnrollments = async (batchId) => {
  const response = await axios.get(TRAINING_BASE, { params: { batch_id: batchId } });
  if (Array.isArray(response.data?.results)) return response.data.results;
  if (Array.isArray(response.data)) return response.data;
  return [];
};

/**
 * Search employees by employee id, name or email (for the search box).
 * @param {string} q - search query
 * @returns {Promise<Array<{ id: number, emp_id: string, name: string, email: string, department: string }>>}
 */
export const suggestEmployees = async (q) => {
  if (!q?.trim()) return [];
  const response = await axios.get(TRAINING_BASE, {
    params: { suggest: "employees", q: q.trim() },
  });
  return response.data?.results ?? [];
};

/**
 * Get every area / sub-area / module combination (for the dropdowns).
 * @returns {Promise<Array<{ training_hierarchy_id: number, area_name: string, sub_area_name: string, module_name: string, ... }>>}
 */
export const suggestTrainingHierarchies = async () => {
  const response = await axios.get(TRAINING_BASE, { params: { suggest: "training_hierarchy" } });
  const data = response.data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data)) return data;
  return [];
};

/**
 * Get the list of employee types (for the dropdown).
 * @returns {Promise<string[]>}
 */
export const suggestEmployeeTypes = async () => {
  const response = await axios.get(TRAINING_BASE, { params: { suggest: "employee_type" } });
  const data = response?.data;
  const list = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
  return list.map((o) => (typeof o === "string" ? o : o?.name ?? o?.employee_type ?? "")).filter(Boolean);
};

/**
 * Get the list of training statuses (for the dropdown).
 * @returns {Promise<string[]>}
 */
export const suggestTrainingStatuses = async () => {
  const response = await axios.get(TRAINING_BASE, { params: { suggest: "training_status" } });
  return response.data?.results ?? [];
};

/**
 * Get the list of training modes (for the dropdown).
 * @returns {Promise<string[]>}
 */
export const suggestTrainingModes = async () => {
  const response = await axios.get(TRAINING_BASE, { params: { suggest: "training_mode" } });
  return response.data?.results ?? [];
};

/**
 * Get the list of batch statuses (for the dropdown).
 * @returns {Promise<string[]>}
 */
export const suggestBatchStatuses = async () => {
  const response = await axios.get(TRAINING_BASE, { params: { suggest: "batch_status" } });
  return response.data?.results ?? [];
};

/**
 * Update one employee's training record.
 * @param {Object} payload
 * @param {number} payload.employee_training_id - Required
 * @param {number} payload.employee_id - Required (for auth)
 * @param {string} [payload.nominated_by]
 * @param {string} [payload.competency]
 * @param {string} [payload.training_status]
 * @param {string} [payload.employee_type]
 * @param {string} [payload.start_date]
 * @param {string} [payload.end_date]
 * @returns {Promise<Object>}
 */
export const updateTraining = async (payload) => {
  const response = await axios.put(TRAINING_BASE, payload, {
    headers: { "Content-Type": "application/json" },
  });
  return response.data;
};

/**
 * Delete one employee's training record.
 * @param {{ id: number, admin_id: number }} params - employee_training_id and admin_id (must have dept/admin/hr role)
 * @returns {Promise<void>}
 */
export const deleteTraining = async ({ id, admin_id }) => {
  await axios.delete(TRAINING_BASE, { params: { id, admin_id } });
};

/**
 * Add many training records in one request.
 * POST body: { admin_id, trainings: [ { employee_id, area, subarea, module, ... }, ... ] }
 * @param {number} adminId - Required (db employee id, must have dept/admin/hr role)
 * @param {Array<{ employee_id: number, area: string, subarea: string, module: string, batch_num: string, competency?: string, employee_type?: string, start_date?: string }>} trainings
 * @returns {Promise<Object>} API response with summary and results
 */
export const addTrainingBatch = async (adminId, trainings) => {
  const response = await axios.post(
    TRAINING_BASE,
    { admin_id: adminId, trainings },
    { headers: { "Content-Type": "application/json" } }
  );
  return response.data;
};

/**
 * Upload many training records from a CSV or Excel file.
 * POST add_training_v2/bulk-upload with multipart/form-data: file, admin_id.
 * Required columns: Employee ID, Area, Sub Area, Module.
 * @param {File} file - CSV or Excel file
 * @param {number} adminId - Required (db employee id, must have dept/admin/hr role)
 * @returns {Promise<Object>} API response with created_count, skipped_count, etc.
 */
export const uploadTrainingCSV = async (file, adminId) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("admin_id", String(adminId));
  const response = await axios.post(`${TRAINING_BASE}/bulk-upload`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
};

export const downloadBulkUploadReport = async (reportUrl, adminId) => {
  if (reportUrl.startsWith("http")) {
    window.open(reportUrl, "_blank");
    return;
  }

  const response = await axios.get(TRAINING_BASE, {
    params: { download_report: "latest", admin_id: adminId },
    responseType: "blob",
  });

  let filename = "training_bulk_upload_report.xlsx";
  const disposition = response.headers["content-disposition"];
  if (disposition) {
    const match = disposition.match(/filename[^;=\n]*=([^;\n]*)/);
    if (match) filename = match[1].trim().replace(/^["']|["']$/g, "");
  }

  const blob = new Blob([response.data], { type: response.data.type });
  const link = document.createElement("a");
  link.href = window.URL.createObjectURL(blob);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
};
