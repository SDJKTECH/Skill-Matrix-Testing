import axios from "axios";
import { BASE_URL } from "../config/apiConfig";

/**
 * Fetches aggregated employee skill info for home dashboard.
 * @param {number|string} employeeId - The employee's numeric ID from auth/user profile.
 * @returns {Promise<{active_skills_count: number, pending_approval_count: number, recent_certificate_name: string | null}>}
 */
export const fetchEmployeeSkillsInfo = async (employeeId) => {
  try {
    if (!employeeId) {
      throw new Error("Employee ID is required to fetch skills info");
    }

    const response = await axios.get(`${BASE_URL}get_employee_skills_info`, {
      params: {
        employee_id: employeeId,
      },
    });

    return response.data;
  } catch (error) {
    console.error("Employee skills info API error:", error);
    throw error;
  }
};

