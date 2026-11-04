import axios from "axios";
import { BASE_URL } from "../config/apiConfig";

/**
 * Fetches employee skills hierarchy for a given email
 * @param {string} email - The employee email address
 * @returns {Promise<Object>} - The employee skills hierarchy data
 */
export const fetchEmployeeSkillsHierarchy = async (email) => {
  try {
    if (!email || email.trim() === "") {
      throw new Error("Email cannot be empty");
    }

    const response = await axios.get(`${BASE_URL}get_employee_skills_hierarchy_v2`, {
      params: {
        email: email.trim().toLowerCase(),
      },
    });

    return response.data;
  } catch (error) {
    console.error("Employee skills hierarchy API error:", error);
    throw error;
  }
};

