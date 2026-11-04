import axios from "axios";
import { BASE_URL } from "../config/apiConfig";

/**
 * Fetch all skill hierarchy entries (for populating filter dropdowns).
 * Tries add-skill-v2 GET first; falls back to get_skill_hierarchy_link_v2 if needed.
 * @returns {Promise<Array>} List of hierarchy entries with domain_name, discipline_name, skill_area, framework_name
 */
export const fetchSkillHierarchies = async () => {
  try {
    const response = await axios.get(`${BASE_URL}add_skill_v2`);
    if (response.data?.results && Array.isArray(response.data.results)) {
      return response.data.results;
    }
    if (Array.isArray(response.data)) {
      return response.data;
    }
    return [];
  } catch (err) {
    // Fallback: use get_skill_hierarchy_link_v2 (same schema: domain_name, discipline_name, skill_area, framework_name)
    try {
      const fallback = await axios.get(`${BASE_URL}get_skill_hierarchy_link_v2`);
      const data = fallback.data;
      return Array.isArray(data) ? data : data?.results || [];
    } catch {
      throw err;
    }
  }
};

/**
 * Extract unique values for each filter from hierarchy results.
 * @param {Array} results - From fetchSkillHierarchies (may include L1, L2, L3)
 * @returns {{ domains: string[], disciplines: string[], skillAreas: string[], frameworks: string[], l1: string[], l2: string[], l3: string[] }}
 */
export const getUniqueFilterOptions = (results) => {
  const domains = [...new Set(results.map((r) => r.domain_name).filter(Boolean))].sort();
  const disciplines = [...new Set(results.map((r) => r.discipline_name).filter(Boolean))].sort();
  const skillAreas = [...new Set(results.map((r) => r.skill_area).filter(Boolean))].sort();
  const frameworks = [...new Set(results.map((r) => r.framework_name).filter(Boolean))].sort();
  const l1 = [...new Set(results.map((r) => r.L1 ?? r.l1).filter(Boolean))].sort();
  const l2 = [...new Set(results.map((r) => r.L2 ?? r.l2).filter(Boolean))].sort();
  const l3 = [...new Set(results.map((r) => r.L3 ?? r.l3).filter(Boolean))].sort();
  return { domains, disciplines, skillAreas, frameworks, l1, l2, l3 };
};

/**
 * Add a new skill hierarchy via add-skill-v2 POST.
 * Requires employee_id (dept/admin role), domain_name, discipline_name, skill_area, framework_name.
 * @param {Object} payload
 * @param {number} payload.employee_id - Required (db employee id)
 * @param {string} payload.domain_name
 * @param {string} payload.discipline_name
 * @param {string} payload.skill_area
 * @param {string} payload.framework_name
 * @param {string} [payload.domain_description]
 * @param {string} [payload.discipline_description]
 * @param {string} [payload.skill_area_description]
 * @param {string} [payload.framework_description]
 * @param {string} [payload.basic] - L1 criteria
 * @param {string} [payload.intermediate] - L2 criteria
 * @param {string} [payload.expert] - L3 criteria
 * @returns {Promise<Object>} API response with skill_hierarchy_id, etc.
 */
export const addSkillHierarchy = async (payload) => {
  const response = await axios.post(`${BASE_URL}add_skill_v2`, payload, {
    headers: { "Content-Type": "application/json" },
  });
  return response.data;
};

/**
 * Add multiple skill hierarchies in one request (batch).
 * @param {number} employeeId - Required (db employee id)
 * @param {Array<{ domain_name: string, discipline_name: string, skill_area: string, framework_name: string, basic?: string, intermediate?: string, expert?: string }>} skills
 * @returns {Promise<Object>} API response with summary and results
 */
export const addSkillHierarchyBatch = async (employeeId, skills) => {
  const response = await axios.post(
    `${BASE_URL}add_skill_v2`,
    { employee_id: employeeId, skills },
    { headers: { "Content-Type": "application/json" } }
  );
  return response.data;
};

/**
 * Bulk upload skill hierarchies from a CSV/Excel file.
 * POST add_skill_v2/bulk-upload with multipart/form-data: file, employee_id.
 * CSV columns: Category, Sub-Category, Sub-Sub-Category, Tools, L1, L2, L3.
 * @param {File} file - CSV or Excel file
 * @param {number} employeeId - Required (db employee id, must have dept/admin role)
 * @returns {Promise<Object>} API response with created, skipped_existing, faulty_rows, etc.
 */
export const uploadSkillCSV = async (file, employeeId) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("employee_id", String(employeeId));
  const response = await axios.post(`${BASE_URL}add_skill_v2/bulk-upload`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
};
