import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
} from "react";

import axios from "axios";
import toast from "react-hot-toast";
import { BASE_URL } from "../config/apiConfig";

// Context file - exports both Provider component and hook (standard pattern)
const SkillContext = createContext();

// Helper function to map levelselected to Level format (L1, L2, L3)
const mapLevelSelectedToLevel = (levelSelected) => {
  if (!levelSelected) return null;
  
  const levelLower = levelSelected.toLowerCase().trim();
  
  // Handle common variations
  if (levelLower === "l1" || levelLower === "beginner" || levelLower === "basic") {
    return "L1";
  }
  if (levelLower === "l2" || levelLower === "intermediate" || levelLower === "intemediate") {
    return "L2";
  }
  if (levelLower === "l3" || levelLower === "expert" || levelLower === "advanced") {
    return "L3";
  }
  
  // Default fallback
  return levelSelected.toUpperCase();
};

export const SkillProvider = ({ children }) => {
  const [masterSkills, setMasterSkills] = useState([]);
  const [employeeSkills, setEmployeeSkills] = useState([]);
  const [isMasterLoading, setIsMasterLoading] = useState(false);
  const [isEmployeeLoading, setIsEmployeeLoading] = useState(false);
  const [isRequestLoading, setIsRequestLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [requestData, setRequestData] = useState(null);
  const fetchToastId = useRef(null);
  const saveToastId = useRef(null);
  const lastFetchedEmail = useRef(null);

  // 🔹 Fetch master skills: try get_skill_hierarchy_link_v2 first, fallback to add_skill_v2 GET (same shape)
  useEffect(() => {
    const fetchMasterSkills = async () => {
      try {
        setIsMasterLoading(true);
        let skillsData = [];
        try {
          const response = await axios.get(`${BASE_URL}get_skill_hierarchy_link_v2`);
          if (Array.isArray(response.data)) {
            skillsData = response.data;
          } else if (response.data?.results && Array.isArray(response.data.results)) {
            skillsData = response.data.results;
          } else if (response.data?.data && Array.isArray(response.data.data)) {
            skillsData = response.data.data;
          }
        } catch (linkErr) {
          console.warn("get_skill_hierarchy_link_v2 failed, trying add_skill_v2:", linkErr?.message);
        }
        // Fallback: add_skill_v2 GET returns same shape (skillhierarchy_id, domain_name, L1, L2, L3, etc.)
        if (skillsData.length === 0) {
          try {
            const fallback = await axios.get(`${BASE_URL}add_skill_v2`);
            const data = fallback.data;
            if (data?.results && Array.isArray(data.results)) {
              skillsData = data.results;
            } else if (Array.isArray(data)) {
              skillsData = data;
            }
            if (skillsData.length > 0) {
              console.log("Master skills loaded from add_skill_v2 fallback:", skillsData.length);
            }
          } catch (fallbackErr) {
            console.error("add_skill_v2 fallback failed:", fallbackErr);
          }
        }
        setMasterSkills(skillsData);
        if (skillsData.length === 0) {
          toast.error("Could not load master skills. Check that get_skill_hierarchy_link_v2 or add_skill_v2 is running.");
        }
      } catch (err) {
        console.error("Failed to fetch master skills:", err);
        setMasterSkills([]);
      } finally {
        setIsMasterLoading(false);
      }
    };
    fetchMasterSkills();
  }, []);

  // Expose refetch so Add Skill screen can retry when opening with empty master skills
  const refetchMasterSkills = async () => {
    if (isMasterLoading) return;
    try {
      setIsMasterLoading(true);
      let skillsData = [];
      try {
        const response = await axios.get(`${BASE_URL}get_skill_hierarchy_link_v2`);
        if (Array.isArray(response.data)) skillsData = response.data;
        else if (response.data?.results && Array.isArray(response.data.results)) skillsData = response.data.results;
        else if (response.data?.data && Array.isArray(response.data.data)) skillsData = response.data.data;
      } catch {
        /* try fallback */
      }
      if (skillsData.length === 0) {
        try {
          const fallback = await axios.get(`${BASE_URL}add_skill_v2`);
          const data = fallback.data;
          if (data?.results && Array.isArray(data.results)) skillsData = data.results;
          else if (Array.isArray(data)) skillsData = data;
        } catch {
          /* ignore */
        }
      }
      setMasterSkills(skillsData);
    } finally {
      setIsMasterLoading(false);
    }
  };

  // 🔹 Fetch employee skills using functionsV2
  const fetchEmployeeSkills = async (email, force = false) => {
    if (!email) return;
    
    const normalizedEmail = email.toLowerCase();
    
    // Prevent duplicate calls if already loading or if we just fetched for this email
    if (isEmployeeLoading) return;
    if (!force && lastFetchedEmail.current === normalizedEmail && employeeSkills.length > 0) {
      // Already fetched for this email and have data, don't fetch again
      return;
    }

    if (!fetchToastId.current) {
      fetchToastId.current = toast.loading("Loading employee skills...", {
        duration: Infinity,
      });
    }
    
    lastFetchedEmail.current = normalizedEmail;

    try {
      setIsEmployeeLoading(true);
      // Use the new functionsV2 endpoint
      const response = await axios.post(`${BASE_URL}get_employee_skill_v2`, {
        email,
      });
      
      // Transform the API response - use skillhierarchy_id directly
      const skills = response.data.skills || [];
      const transformedSkills = skills.map((skill) => {
        // Map level_selected to Level format (L1, L2, L3)
        const level = mapLevelSelectedToLevel(skill.level_selected);
        
        return {
          ...skill,
          skillhierarchy_id: skill.skillhierarchy_id,
          // Map level_selected to Level for frontend compatibility
          Level: level,
          // Map approval_status to Status for frontend compatibility
          Status: skill.approval_status || null,
          // Map rejection_reason to RejectReason for frontend compatibility
          RejectReason: skill.rejection_reason || null,
        };
      });
      
      setEmployeeSkills(transformedSkills);
      toast.dismiss(fetchToastId.current);
    } catch (err) {
      if (err.response && err.response.status === 404) {
        toast.error("Previous skills not found ", {
          id: fetchToastId.current,
          duration: 8000,
        });
      } else {
        console.error("Failed to fetch employee skills:", err);
        setEmployeeSkills([]);
        toast.error("Failed to load employee skills", {
          id: fetchToastId.current,
          duration: 8000,
        });
      }
    } finally {
      setIsEmployeeLoading(false);
      fetchToastId.current = null; // reset
    }
  };

  // 🔹 Save employee skills using v2 endpoint
  const saveEmployeeSkills = async (
    employeeInfo,
    processedData,
    selectedRadios,
    managerEmail = ""
  ) => {
    if (!employeeInfo?.email) {
      toast.error("Employee Email is required", { duration: 8000 });
      return;
    }

    if (!saveToastId.current) {
      saveToastId.current = toast.loading("Saving employee skills...", {
        duration: Infinity,
      });
    }

    try {
      setIsSaving(true);
      // Use the new v2 save endpoint
      await axios.post(
        `${BASE_URL}save_employee_skill_v2`,
        {
          email: employeeInfo.email.toLowerCase(),
          managerEmail:
            employeeInfo.managerEmail.toLowerCase() ||
            managerEmail.toLowerCase(),
          skills: processedData
            .filter((row) => selectedRadios[row.skillhierarchy_id])
            .map((row) => ({
              Level: selectedRadios[row.skillhierarchy_id].Level,
              skillhierarchy_id: row.skillhierarchy_id,
            })),
        },
        { headers: { "Content-Type": "application/json" } }
      );
      // Refresh employee skills after saving (force: bypasses the already-fetched-this-email guard above)
      await fetchEmployeeSkills(employeeInfo?.email, true);
      toast.success("Employee skills saved successfully!", {
        id: saveToastId.current,
        duration: 5000,
      });
    } catch (error) {
      console.error("Failed to save employee details:", error);
      toast.error(
        error.response?.data?.error ||
          "Failed to save employee details. Please try again.",
        { id: saveToastId.current, duration: 8000 }
      );
    } finally {
      setIsSaving(false);
      saveToastId.current = null; // reset
    }
  };

  const clearEmployeeSkills = () => {
    setEmployeeSkills([]);
  };

  const fetchEmployeeRequests = async (user) => {
    const toastId = toast.loading("Fetching user data...", {
      duration: Infinity,
    });

    setIsRequestLoading(true); // ✅ start loading

    try {
      if (!user?.dbEmployeeId) {
        toast.error("Employee ID is required", { id: toastId, duration: 5000 });
        setIsRequestLoading(false);
        return;
      }

      if (!user?.isManager) {
        toast.error("Only managers can view pending requests", { id: toastId, duration: 5000 });
        setIsRequestLoading(false);
        return;
      }

      // Ensure managerId is a valid number
      const managerId = user?.dbEmployeeId || user?.employeeId;
      const numericManagerId = managerId ? Number(managerId) : null;
      
      if (!numericManagerId || isNaN(numericManagerId)) {
        toast.error("Invalid manager ID. Cannot fetch pending requests.", {
          id: toastId,
          duration: 5000,
        });
        setIsRequestLoading(false);
        return;
      }

      const res = await axios.get(`${BASE_URL}get_pending_skill_request_v2`, {
        params: { 
          managerId: String(numericManagerId),
          isManager: String(user.isManager)
        },
        paramsSerializer: {
          indexes: null // Don't use array format
        }
      });

      if (res.status === 200) {
        // Ensure response data is always an array
        const data = Array.isArray(res.data) ? res.data : [];
        setRequestData(data);
        toast.success("User data fetched successfully!", {
          id: toastId,
          duration: 3000,
        });
      } else {
        toast.error("Failed to fetch user data. Please try again.", {
          id: toastId,
          duration: 5000,
        });
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
      toast.error(
        error?.response?.data?.error ||
          "An unexpected error occurred while fetching user data.",
        { id: toastId, duration: 5000 }
      );
    } finally {
      setIsRequestLoading(false); // ✅ stop loading
    }
  };
  // 🔹 Download Skill Matrix
  const downloadSkillMatrix = async () => {
    const toastId = toast.loading("Preparing Skills master file...", {
      duration: Infinity,
    });

    try {
      const response = await axios.get(`${BASE_URL}get_master_file_v2`, {
        params: { type: "skills" }, // always skills
        responseType: "blob", // important for file download
      });

      const blob = new Blob([response.data], { type: response.data.type });

      // Determine file extension
      let ext = ".csv"; // default
      if (
        blob.type ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      ) {
        ext = ".xlsx";
      } else if (blob.type === "application/vnd.ms-excel") {
        ext = ".xls";
      }

      const filename = `Master_Skills${ext}`;

      const link = document.createElement("a");
      link.href = window.URL.createObjectURL(blob);
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();

      toast.success("Skills master file downloading!", {
        id: toastId,
        duration: 5000,
      });
    } catch (error) {
      console.error(error);
      toast.error("Failed to download Skills master file", {
        id: toastId,
        duration: 8000,
      });
    }
  };

  const reviewSkill = async (skillIds, reviewedByEmployeeId, action, reason) => {
    const toastId = toast.loading(
      action === "approve" ? "Approving skills..." : "Rejecting skills..."
    );

    try {
      if (!skillIds?.length || !reviewedByEmployeeId || !action) {
        toast.error("Missing required fields.", { id: toastId });
        return;
      }

      const payload = {
        reviewedByEmployeeId,
        action,
        reason: action === "reject" ? reason || "No reason provided" : null,
        skills: skillIds.map((id) => ({ empSkillId: id })),
      };

      const res = await axios.post(`${BASE_URL}review_skill_request_v2`, payload);

      if (res.status === 200) {
        // ✅ Optimistic UI update for all reviewed skills
        setRequestData((prev) =>
          prev.map((emp) => ({
            ...emp,
            skills: emp.skills?.map((sk) =>
              skillIds.includes(sk.skillId)
                ? {
                    ...sk,
                    Status: action === "approve" ? "Approved" : "Rejected",
                    RejectReason: action === "reject" ? reason : null,
                    Level: action === "approve" ? "L3" : "L2",
                  }
                : sk
            ),
          }))
        );

        toast.success(res.data.message || "Skills reviewed successfully!", {
          id: toastId,
        });
      } else {
        toast.error("Failed to review skills.", { id: toastId });
      }
    } catch (err) {
      console.error("❌ Error reviewing skills:", err);
      toast.error("Unexpected error", { id: toastId });
    }
  };

  return (
    <SkillContext.Provider
      value={{
        masterSkills,
        employeeSkills,
        requestData,
        reviewSkill,
        setRequestData,
        fetchEmployeeSkills,
        saveEmployeeSkills,
        clearEmployeeSkills,
        downloadSkillMatrix,
        fetchEmployeeRequests,
        refetchMasterSkills,
        isMasterLoading,
        isEmployeeLoading,
        isSaving,
        isRequestLoading,
      }}
    >
      {children}
    </SkillContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useSkills = () => useContext(SkillContext);
