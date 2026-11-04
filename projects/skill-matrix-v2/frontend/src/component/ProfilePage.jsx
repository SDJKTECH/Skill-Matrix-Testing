import React, { useMemo, useState, useEffect } from "react";
import {
  FiUser,
  FiAward,
  FiCheckCircle,
  FiTarget,
  FiStar,
  FiBriefcase,
  FiMail,
  FiEdit,
  FiCheck,
  FiX,
  FiUpload,
} from "react-icons/fi";
import { useAuth } from "../hooks/useAuth";
import { useSkills } from "../context/SkillContext";
import { useCertificates } from "../context/CertificateContext";
import { useSkillMatrixNav } from "../context/SkillMatrixNavContext";
import { FilePond, registerPlugin } from "react-filepond";
import "filepond/dist/filepond.min.css";
import FilePondPluginFileValidateType from "filepond-plugin-file-validate-type";
import FilePondPluginFileValidateSize from "filepond-plugin-file-validate-size";

registerPlugin(FilePondPluginFileValidateType, FilePondPluginFileValidateSize);

function ProfilePage() {
  const { user, updateManagerEmail, uploadCV, uploading } = useAuth();
  const { employeeSkills } = useSkills();
  const { employeeCertificates } = useCertificates();
  const { setActiveTab } = useSkillMatrixNav();
  
  const [editMode, setEditMode] = useState(false);
  const [managerEmail, setManagerEmail] = useState(user?.managerEmail || "");
  const [cvFile, setCvFile] = useState(null);
  const [error, setError] = useState("");
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Update managerEmail when user changes
  useEffect(() => {
    setManagerEmail(user?.managerEmail || "");
  }, [user?.managerEmail]);

  // Calculate profile statistics
  const stats = useMemo(() => {
    const approvedSkills = employeeSkills.filter(
      (s) => (s.Status || s.approval_status || "").toLowerCase() === "approved"
    );
    
    const skillsByLevel = {
      L1: approvedSkills.filter((s) => (s.Level || s.level || "").toUpperCase() === "L1").length,
      L2: approvedSkills.filter((s) => (s.Level || s.level || "").toUpperCase() === "L2").length,
      L3: approvedSkills.filter((s) => (s.Level || s.level || "").toUpperCase() === "L3").length,
    };

    const approvedCerts = employeeCertificates.filter(
      (c) => (c.approvalStatus || c.approval_status || "").toLowerCase() === "approved"
    );

    // Calculate profile completion
    const completionItems = [
      { name: "Skills", completed: approvedSkills.length > 0, weight: 0.3 },
      { name: "Certificates", completed: approvedCerts.length > 0, weight: 0.2 },
      { name: "CV Upload", completed: !!user?.cvUrl, weight: 0.2 },
      { name: "Manager Email", completed: !!user?.managerEmail, weight: 0.15 },
      { name: "Profile Photo", completed: !!user?.photoUrl && !user?.photoUrl.includes("ui-avatars"), weight: 0.15 },
    ];
    const completionPercentage = Math.round(
      completionItems.reduce((sum, item) => sum + (item.completed ? item.weight : 0), 0) * 100
    );

    // Recent achievements - combine skills and certificates, sorted by date
    const allAchievements = [
      ...approvedCerts.map((cert) => ({
        type: "certificate",
        name: cert.certificateName || cert.certName || "Certificate",
        date: cert.updated_at || cert.UpdatedAt || cert.created_at || cert.CreatedAt || cert.certificateDate || cert.certDate || new Date(0),
        data: cert,
      })),
      ...approvedSkills.map((skill) => {
        // Build skill title like in HomeScreen
        const parts = [];
        if (skill.domain_name || skill.Domain) parts.push(skill.domain_name || skill.Domain);
        if (skill.discipline_name || skill.Discipline) parts.push(skill.discipline_name || skill.Discipline);
        if (skill.skill_area || skill.SkillArea) parts.push(skill.skill_area || skill.SkillArea);
        if (skill.framework_name || skill.Framework) parts.push(skill.framework_name || skill.Framework);
        const level = skill.Level || skill.level || skill.level_selected || "";
        const skillTitle = parts.length > 0 
          ? `${parts.join(" • ")}${level ? ` (${level})` : ""}`
          : skill.skill_name || skill.SkillName || "Skill";
        
        return {
          type: "skill",
          name: skillTitle,
          date: skill.updated_at || skill.UpdatedAt || skill.created_at || skill.CreatedAt || new Date(0),
          data: skill,
        };
      }),
    ]
      .sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        return dateB - dateA;
      })
      .slice(0, 5); // Show top 5 most recent

    return {
      totalSkills: approvedSkills.length,
      skillsByLevel,
      totalCertificates: approvedCerts.length,
      completionPercentage,
      completionItems,
      recentAchievements: allAchievements,
    };
  }, [employeeSkills, employeeCertificates, user]);

  const displayName = user?.displayName || "User";
  const firstName = displayName.split(" ")[0];
  const jobTitle = user?.jobTitle || "Employee";
  const department = user?.department || "Not specified";
  const email = user?.mail || user?.userPrincipalName || "";
  const employeeId = user?.employeeId || user?.dbEmployeeId || "";

  // Get user's photo or generate avatar
  const photoUrl = user?.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&rounded=true&bold=true&background=2563eb&color=fff`;

  const handleSaveManagerEmail = () => {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

    if (!emailRegex.test(managerEmail)) {
      setError("Please enter a valid manager email");
      return;
    }

    setError("");
    updateManagerEmail(managerEmail);
    setEditMode(false);
  };

  return (
    <div className="flex flex-col h-full min-h-0 gap-6 p-6 text-gray-800 dark:text-gray-200 overflow-y-auto bg-gray-50 dark:bg-gray-900">
      {/* Header Section */}
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-1">
          My Profile
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Your professional profile and achievements
        </p>
      </div>

      {/* Personal Overview Card */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6 shrink-0">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Profile Photo */}
          <div className="flex-shrink-0">
            <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-blue-100 dark:border-blue-900/40 shadow-md">
              <img
                src={photoUrl}
                alt={displayName}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&rounded=true&bold=true&background=2563eb&color=fff`;
                }}
              />
            </div>
          </div>

          {/* Personal Info */}
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {displayName}
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 mb-4">{jobTitle}</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <FiBriefcase className="h-4 w-4" />
                <span>{department}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <FiMail className="h-4 w-4" />
                <span className="truncate">{email}</span>
              </div>
              {employeeId && (
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <FiUser className="h-4 w-4" />
                  <span>ID: {employeeId}</span>
                </div>
              )}
            </div>

            {/* Profile Completion */}
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Profile Completion
                </span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  {stats.completionPercentage}%
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                <div
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${stats.completionPercentage}%` }}
                ></div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Complete your profile to unlock more features
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 shrink-0">
        {/* Recent Activity */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <FiCheckCircle className="h-5 w-5" />
            Recent Activity
          </h2>
          <div className="space-y-3">
            {stats.recentAchievements.length > 0 ? (
              stats.recentAchievements.map((achievement, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    achievement.type === "certificate"
                      ? "bg-amber-50 dark:bg-amber-900/20"
                      : "bg-blue-50 dark:bg-blue-900/20"
                  }`}>
                    {achievement.type === "certificate" ? (
                      <FiAward className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    ) : (
                      <FiCheckCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {achievement.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {achievement.type === "certificate" ? "Certificate added" : "Skill added"}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                No recent activity yet. Start adding skills and certificates!
              </p>
            )}
          </div>
        </div>

        {/* Profile Details */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <FiUser className="h-5 w-5" />
            Profile Details
          </h2>
          <div className="space-y-4">
            {/* Employee ID */}
            {employeeId && (
              <div className="flex flex-col">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Employee ID
                </label>
                <input
                  type="text"
                  value={employeeId}
                  disabled
                  className="p-2 border rounded-md bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 text-sm"
                />
              </div>
            )}

            {/* Email */}
            <div className="flex flex-col">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Email
              </label>
              <input
                type="text"
                value={email}
                disabled
                className="p-2 border rounded-md bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 text-sm"
              />
            </div>

            {/* Job Title */}
            <div className="flex flex-col">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Job Title
              </label>
              <input
                type="text"
                value={jobTitle}
                disabled
                className="p-2 border rounded-md bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 text-sm"
              />
            </div>

            {/* Department */}
            <div className="flex flex-col">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Department
              </label>
              <input
                type="text"
                value={department}
                disabled
                className="p-2 border rounded-md bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 text-sm"
              />
            </div>

            {/* Manager Email - Editable */}
            <div className="flex flex-col">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Manager Email
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="email"
                  value={managerEmail}
                  disabled={!editMode}
                  onChange={(e) => setManagerEmail(e.target.value)}
                  className={`flex-1 p-2 border rounded-md text-gray-800 dark:text-gray-100 transition text-sm ${
                    editMode
                      ? "bg-white dark:bg-gray-700 border-blue-400 focus:ring-1 focus:ring-blue-400"
                      : "bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-700"
                  }`}
                />
                {!editMode ? (
                  <FiEdit
                    className="text-blue-500 cursor-pointer hover:text-blue-600 transition"
                    size={20}
                    onClick={() => setEditMode(true)}
                  />
                ) : (
                  <>
                    <FiCheck
                      className="text-green-500 cursor-pointer hover:text-green-600 transition"
                      size={20}
                      onClick={handleSaveManagerEmail}
                      title="Save"
                    />
                    <FiX
                      className="text-gray-500 cursor-pointer hover:text-red-500 transition"
                      size={20}
                      onClick={() => {
                        setError("");
                        setEditMode(false);
                        setManagerEmail(user?.managerEmail || "");
                      }}
                      title="Cancel"
                    />
                  </>
                )}
              </div>
              {error && (
                <span className="text-red-500 text-xs mt-1">{error}</span>
              )}
            </div>

            {/* CV Section */}
            <div className="flex items-center gap-3 pt-2">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0">
                Curriculum Vitae (CV):
              </label>
              {user?.cvUrl ? (
                <a
                  href={user.cvUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-700 underline text-sm font-medium shrink-0"
                >
                  View CV
                </a>
              ) : (
                <span className="text-xs text-gray-500 shrink-0">
                  No CV uploaded
                </span>
              )}
              <FiUpload
                className="text-blue-500 cursor-pointer hover:text-blue-600 transition shrink-0"
                size={20}
                onClick={() => setShowUploadModal(true)}
                title="Upload CV"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Profile Completion Checklist */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6 shrink-0">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <FiTarget className="h-5 w-5" />
          Complete Your Profile
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {stats.completionItems.map((item, idx) => (
            <div key={idx} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
              {item.completed ? (
                <FiCheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
              ) : (
                <div className="h-5 w-5 rounded-full border-2 border-gray-300 dark:border-gray-600 flex-shrink-0" />
              )}
              <span className={`text-sm ${item.completed ? "text-gray-700 dark:text-gray-300" : "text-gray-500 dark:text-gray-500"}`}>
                {item.name}
              </span>
              {!item.completed && (
                <button
                  onClick={() => {
                    if (item.name === "Skills") setActiveTab("skills");
                    else if (item.name === "Certificates") setActiveTab("certs");
                    // CV and Manager Email can be handled via ProfileModal
                  }}
                  className="ml-auto text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Add →
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ProfilePage;
