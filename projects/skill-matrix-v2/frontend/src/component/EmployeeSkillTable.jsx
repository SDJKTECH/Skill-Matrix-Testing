import React, { useState, useEffect, useRef } from "react";
import SkillDataTable from "../component/skillDataTable";
import { useAuth } from "../hooks/useAuth";
import { useSkills } from "../context/SkillContext";
import toast from "react-hot-toast";

const EmployeeSkillTable = () => {
  const { user } = useAuth();
  const { masterSkills, employeeSkills, fetchEmployeeSkills, refetchMasterSkills, isMasterLoading } =
    useSkills();

  const [employeeInfo, setEmployeeInfo] = useState({
    id: user?.employeeId || "",
    email: user?.mail || user?.userPrincipalName || "",
    name: user?.displayName || "",
    dept_name: user?.department || "IFS",
  });

  // ✅ Convert to state
  const [preselectedSkills, setPreselectedSkills] = useState({});

  useEffect(() => {
    if (user) {
      setEmployeeInfo({
        id: user.employeeId || "",
        email: user.mail || user.userPrincipalName || "",
        name: user.displayName || "",
        dept_name: user.department || "IFS",
        managerEmail: user.managerEmail || "",
      });
    }
    if (employeeSkills.length === 0) {
      handleLoadEmployee();
    }
  }, [user]);

  // When Add Skill tab is opened with no master skills, retry loading once (e.g. from add_skill_v2).
  // Guarded by a ref (not isMasterLoading) so a persistently failing backend can't retrigger on every loading-state flip and call the API in an infinite loop.
  const hasRetriedMasterSkills = useRef(false);
  useEffect(() => {
    if (masterSkills.length === 0 && !isMasterLoading && refetchMasterSkills && !hasRetriedMasterSkills.current) {
      hasRetriedMasterSkills.current = true;
      refetchMasterSkills();
    }
  }, [masterSkills.length, isMasterLoading, refetchMasterSkills]);

  useEffect(() => {
    const skillsFromBackend = {};

    employeeSkills.forEach((skill) => {
      if (skill.skillhierarchy_id) {
        skillsFromBackend[skill.skillhierarchy_id] = {
          Level: skill.Level || null,
          Status: skill.Status || skill.approval_status || null,
          RejectReason: skill.RejectReason || skill.rejection_reason || null,
        };
      }
    });

    setPreselectedSkills(skillsFromBackend);
  }, [employeeSkills]);

  const handleLoadEmployee = () => {
    if (!employeeInfo.email) {
      toast.error("Employee email is missing.");
      return;
    }
    fetchEmployeeSkills(employeeInfo.email.toLowerCase());
  };

  if (!user) return null;

  return (
    <div className="relative h-full">
      <div className="h-full min-h-[200px] flex flex-col bg-white/30 backdrop-blur-md border border-white/40 shadow-lg">
        {isMasterLoading ? (
          <p className="m-auto text-gray-600 text-center animate-pulse">
            Loading skills ...
          </p>
        ) : masterSkills.length > 0 ? (
          <div className="flex-1 min-h-0 w-full">
            <SkillDataTable
              data={masterSkills}
              headers={Object.keys(masterSkills[0])}
              employeeInfo={employeeInfo}
              preselectedSkills={preselectedSkills}
            />
          </div>
        ) : (
          <p className="m-auto text-gray-600 text-center">
            No master skills available.
          </p>
        )}
      </div>
    </div>
  );
};

export default EmployeeSkillTable;
