import React, { createContext, useContext, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { useAuth } from "../hooks/useAuth";
import { BASE_URL } from "../config/apiConfig";

const OverviewContext = createContext(null);

/** API entity types for comments (training | skill | certificate). */
export const ENTITY_TYPES = Object.freeze({
  TRAINING: "training",
  SKILL: "skill",
  CERTIFICATION: "certificate",
});

/** Map overview node label to API entity type. Use when saving a comment from a node. */
export const nodeLabelToEntityType = (label) => {
  if (!label || typeof label !== "string") return ENTITY_TYPES.SKILL;
  const l = label.trim();
  if (l === "Training") return ENTITY_TYPES.TRAINING;
  if (l === "Certification") return ENTITY_TYPES.CERTIFICATION;
  return ENTITY_TYPES.SKILL;
};

/** Node labels that belong to each entity type (for updating hierarchy after save). */
const ENTITY_TYPE_LABELS = {
  [ENTITY_TYPES.TRAINING]: ["Training"],
  [ENTITY_TYPES.SKILL]: [
    "Skill", "Category", "Subcategory", "Sub-Subcategory", "Tool", "Framework",
    "Domain", "Discipline",
  ],
  [ENTITY_TYPES.CERTIFICATION]: ["Certification"],
};

/**
 * Transforms a single employee/manager node from the new API response format
 * into the {label, name, id, children, ...} tree format the graph expects.
 * Recursive — also transforms nested associates.
 */
function transformApiNode(apiData) {
  if (!apiData) return null;

  const skillsData = apiData.skills || {};
  const certsData = apiData.certifications || {};
  const trainingsData = apiData.trainings || {};
  const associatesData = apiData.associates || {};

  // Build base employee/manager node
  const empNode = {
    id: apiData.id,
    label: apiData.role === "Manager" ? "Manager" : "Employee",
    name: apiData.name,
    email: apiData.email,
    empId: apiData.empId,
    role: apiData.role,
    // summary counts shown in tooltip
    skillCount: skillsData.frameworkCount || 0,
    certCount: certsData.certificationCount || 0,
    trainingCount: trainingsData.trainingCount || 0,
    skillCategoryCount: skillsData.domainCount || 0,
    skillSubcategoryCount: skillsData.disciplineCount || 0,
    skillSubSubcategoryCount: skillsData.skillAreaCount || 0,
    skillToolCount: skillsData.frameworkCount || 0,
    children: [],
  };

  // ── Skills section ──────────────────────────────────────────
  const skillArray = skillsData.skillArray || [];
  if (skillArray.length > 0) {
    const domainNodes = skillArray.map((domain) => ({
      id: domain.id,
      label: "Domain",
      name: domain.domainName,
      childCount: (domain.disciplines || []).length,
      children: (domain.disciplines || []).map((disc) => ({
        id: disc.id,
        label: "Discipline",
        name: disc.disciplineName,
        childCount: (disc.skillAreas || []).length,
        children: (disc.skillAreas || []).map((area) => ({
          id: area.id,
          label: "Skill",
          name: area.skillArea,
          childCount: (area.frameworks || []).length,
          children: (area.frameworks || []).map((fw) => ({
            id: fw.id,
            label: "Framework",
            name: fw.frameworkName,
            levelSelected: fw.levelSelected,
            approvalStatus: fw.approvalStatus,
            skillHierarchyId: fw.skillHierarchyId,
            children: [],
          })),
        })),
      })),
    }));

    empNode.children.push({
      id: `skills-${apiData.id}`,
      label: "SkillsSection",
      name: `Skills (${skillsData.frameworkCount || 0})`,
      children: domainNodes,
    });
  }

  // ── Certifications section ──────────────────────────────────
  const certArray = certsData.certificationArray || [];
  if (certArray.length > 0) {
    empNode.children.push({
      id: `certs-${apiData.id}`,
      label: "CertificationsSection",
      name: `Certifications (${certArray.length})`,
      children: certArray.map((cert) => ({
        id: cert.mappingId ?? cert.employeeCertificateId,
        label: "Certification",
        name: cert.certName,
        certProvider: cert.certProvider,
        certLevel: cert.certLevel,
        validYears: cert.validYears,
        issuedDate: cert.issuedDate,
        expiryDate: cert.expiryDate,
        approvalStatus: cert.approvalStatus || "Approved",
        children: [],
      })),
    });
  }

  // ── Trainings section ───────────────────────────────────────
  const trainingArray = trainingsData.trainingArray || [];
  if (trainingArray.length > 0) {
    empNode.children.push({
      id: `trainings-${apiData.id}`,
      label: "TrainingsSection",
      name: `Trainings (${trainingArray.length})`,
      children: trainingArray.map((t) => ({
        id: t.employeeTrainingId,
        label: "Training",
        name: t.moduleName,
        module: t.moduleName,
        status: t.trainingStatus,
        period: t.batch,          // "YYYY-MM" e.g. "2023-08"
        area: t.areaName,
        sub_area: t.subAreaName,
        course_level: t.courseLevel,
        start_date: t.startDate,
        end_date: t.endDate,
        type: t.employeeType,
        employee_id: t.employeeId ?? apiData.id,
        employee_comment: t.employeeComment,
        manager_comment: t.managerComment,
        department_comment: t.departmentComment,
        children: [],
      })),
    });
  }

  // ── Associates section ──────────────────────────────────────
  // The API uses associateArray1 / associateArray2 / … depending on depth
  const assocKey = Object.keys(associatesData).find((k) =>
    k.startsWith("associateArray")
  );
  const assocArray = assocKey ? associatesData[assocKey] || [] : [];
  if (assocArray.length > 0) {
    empNode.children.push({
      id: `associates-${apiData.id}`,
      label: "AssociatesSection",
      name: `Associates (${assocArray.length})`,
      children: assocArray.map(transformApiNode).filter(Boolean),
    });
  }

  return empNode;
}

export const OverviewProvider = ({ children }) => {
  const { user } = useAuth();
  const [overviewHierarchy, setOverviewHierarchy] = useState(null);
  const [loading, setLoading] = useState(false);

  const getOverviewHierarchy = async () => {
    // Backend expects employee table id (primary key). Prefer dbEmployeeId when available.
    const rawId = user?.dbEmployeeId ?? user?.employeeId;
    if (rawId == null || rawId === "") {
      toast.error("Employee ID not available.");
      return null;
    }

    const toastId = toast.loading("Loading overview...");
    setLoading(true);

    try {
      const id = typeof rawId === "string" ? parseInt(rawId, 10) : Number(rawId);
      if (Number.isNaN(id)) {
        toast.error("Invalid employee ID.", { id: toastId });
        return null;
      }

      const response = await axios.post(
        `${BASE_URL}get_combined_hierarchy_v2`,
        { employeeId: id },
        { headers: { "Content-Type": "application/json" } }
      );

      if (response.data) {
        const transformed = transformApiNode(response.data);
        setOverviewHierarchy([transformed]);
        return transformed;
      } else {
        toast.error("No hierarchy data found.", { id: toastId });
        return null;
      }
    } catch (error) {
      console.error("Error fetching overview:", error);
      toast.error(
        error?.response?.data?.error ||
          "Failed to load overview. Please try again.",
        { id: toastId }
      );
      return null;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Save a comment for any entity (training, skill, or certification).
   * @param {string|number} entityId - ID of the entity (trainingId, skillId, or certificationId)
   * @param {string} entityType - One of "training" | "skill" | "certification"
   * @param {string} comment - Comment text
   * @param {string|number} employeeId - Employee (table id) the comment is about
   */
  const saveComment = async (entityId, entityType, comment, employeeId) => {
    if (entityId == null || entityId === "") {
      toast.error("Missing entity identifier for comment.");
      return null;
    }
    if (!employeeId) {
      toast.error("Employee information not available for this comment.");
      return null;
    }
    const commentByEmployeeId = overviewHierarchy?.[0]?.id;
    if (!commentByEmployeeId) {
      toast.error("Unable to identify commenter. Please refresh and try again.");
      return null;
    }
    const commentText = (comment ?? "").trim();
    if (!commentText) {
      toast.error("Please enter a comment.");
      return null;
    }

    const allowedTypes = [ENTITY_TYPES.TRAINING, ENTITY_TYPES.SKILL, ENTITY_TYPES.CERTIFICATION];
    const normalizedType = allowedTypes.includes(entityType) ? entityType : ENTITY_TYPES.SKILL;

    const toastId = toast.loading("Saving comment...");

    try {
      const response = await axios.post(
        `${BASE_URL}manage_comments_v2`,
        {
          employeeId: employeeId,
          commentBy: commentByEmployeeId,
          entityId: entityId,
          entityType: normalizedType,
          comment: commentText,
        },
        { headers: { "Content-Type": "application/json" } }
      );

      const commentType =
        response?.data?.commentType &&
        typeof response.data.commentType === "string"
          ? response.data.commentType
          : null;

      const fieldMap = {
        Employee: "employee_comment",
        Manager: "manager_comment",
        Department: "department_comment",
      };

      const targetField = commentType ? fieldMap[commentType] : null;
      const labelsForType = ENTITY_TYPE_LABELS[normalizedType] || [];

      setOverviewHierarchy((prev) => {
        if (!prev) return prev;

        const next = JSON.parse(JSON.stringify(prev));

        const updateNode = (node) => {
          if (!node) return;
          const idMatch = node.id === entityId || String(node.id) === String(entityId);
          const labelMatch = labelsForType.length === 0 || labelsForType.includes(node.label);
          if (idMatch && labelMatch) {
            node.comment = commentText;
            if (targetField) {
              node[targetField] = commentText;
            }
          }
          if (Array.isArray(node.children)) {
            node.children.forEach(updateNode);
          }
        };

        next.forEach(updateNode);
        return next;
      });

      toast.success("Comment saved successfully.", { id: toastId });
      return response.data;
    } catch (error) {
      console.error("Error saving comment:", error);
      const data = error?.response?.data;
      const msg =
        (typeof data?.error === "string" ? data.error : null) ||
        (data?.details ? `${data.error || "Error"}: ${data.details}` : null) ||
        error?.message ||
        "Failed to save comment. Please try again.";
      toast.error(msg, { id: toastId, duration: 6000 });
      return null;
    }
  };

  return (
    <OverviewContext.Provider
      value={{
        overviewHierarchy,
        loading,
        getOverviewHierarchy,
        setOverviewHierarchy,
        saveComment,
      }}
    >
      {children}
    </OverviewContext.Provider>
  );
};

export const useOverview = () => useContext(OverviewContext);
