import axios from "axios";
import { BASE_URL } from "../config/apiConfig";

/**
 * Fetches skill hierarchy link data
 * @returns {Promise<Array>} - The skill hierarchy link data
 */
export const fetchSkillHierarchyLink = async () => {
  try {
    const response = await axios.get(`${BASE_URL}get_skill_hierarchy_link_v2`);
    return response.data;
  } catch (error) {
    console.error("Skill hierarchy link API error:", error);
    throw error;
  }
};

