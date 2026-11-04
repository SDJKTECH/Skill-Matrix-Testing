import React, { useState, useEffect } from "react";
import { useSkills } from "../context/SkillContext";
import { useAuth } from "../hooks/useAuth";
import { FaQuestion } from "react-icons/fa";
import LevelDetailModal from "./LevelDetailModal";
import { getHeaderName } from "../helper/utility";
import { SiTarget } from "react-icons/si";

function SkillRequestList() {
  const {
    masterSkills,
    requestData,
    setRequestData,
    reviewSkill,
    isRequestLoading,
    fetchEmployeeRequests,
  } = useSkills();
  const { user } = useAuth();

  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [selectedSkills, setSelectedSkills] = useState([]);
  const [open, setOpen] = useState(false);
  const [modalLevels, setModalLevels] = useState(null);

  // ✅ New state for dialogs
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [reasonText, setReasonText] = useState("");

  useEffect(() => {
    if (user) {
      fetchEmployeeRequests(user);
    }
  }, [user]);

  const selectedEmployee =
    requestData?.find((req) => req.id === selectedEmployeeId) || null;

  // ✅ Individual select toggle
  const handleSkillSelect = (skillId) => {
    setSelectedSkills((prev) =>
      prev.includes(skillId)
        ? prev.filter((id) => id !== skillId)
        : [...prev, skillId]
    );
  };

  // ✅ Select all toggle
  const handleSelectAll = (checked, skills) => {
    if (checked) {
      const allIds = skills
        .filter((sk) => sk.status === "Pending" && sk.Level === "L3")
        .map((sk) => sk.skillId);
      setSelectedSkills(allIds);
    } else {
      setSelectedSkills([]);
    }
  };

  // ✅ Action handlers
  const handleBulkAction = async (action) => {
    if (!selectedSkills.length) return;

    // Show confirmation or rejection dialog
    if (action === "reject") {
      setShowRejectDialog(true);
      return;
    }

    // Approve case
    const totalPending = selectedEmployee.skills.filter(
      (s) => s.status === "Pending" && s.Level === "L3"
    ).length;

    // Show confirmation if approving all
    if (selectedSkills.length === totalPending) {
      setShowConfirmDialog(true);
    } else {
      await executeAction("approve");
    }
  };

  // ✅ Execute review
  const executeAction = async (action, reason = null) => {
    await reviewSkill(selectedSkills, user.dbEmployeeId, action, reason);

    // Optimistic UI update
    setRequestData((prev) =>
      prev.map((req) => ({
        ...req,
        skills: req.skills.map((sk) =>
          selectedSkills.includes(sk.skillId)
            ? {
                ...sk,
                status: action === "approve" ? "Approved" : "Rejected",
                Level: action === "approve" ? "L3" : "L2",
                reason: action === "reject" ? reason : null,
              }
            : sk
        ),
      }))
    );

    setSelectedSkills([]);
    setShowRejectDialog(false);
    setShowConfirmDialog(false);
    setReasonText("");
  };

  if (isRequestLoading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <p className="text-gray-500 dark:text-gray-400 animate-pulse">
          Loading requests...
        </p>
      </div>
    );
  }

  if (!requestData?.length) {
    return (
      <div className="text-gray-500 dark:text-gray-400 p-4">
        No pending requests to display.
      </div>
    );
  }

  const pendingEmployees = requestData.filter((req) =>
    req.skills?.some((sk) => sk.Level === "L3" && sk.status === "Pending")
  );

  const sidebarEmployees = pendingEmployees.some(
    (emp) => emp.id === selectedEmployeeId
  )
    ? pendingEmployees
    : [
        ...pendingEmployees,
        requestData.find((req) => req.id === selectedEmployeeId),
      ].filter(Boolean);

  return (
    <div className="flex flex-col md:flex-row w-full h-[75vh] rounded-lg overflow-hidden shadow-lg border border-gray-300 dark:border-gray-700">
      {/* Sidebar */}
      <div className="md:min-w-1/5 bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 overflow-y-auto overscroll-y-contain hide-scrollbar md:h-full h-auto">
        <h2 className="text-lg font-semibold px-3 py-2 border-b-4 border-gray-300 dark:border-gray-700 sticky top-0 bg-gray-50 dark:bg-gray-800 z-10 shadow-sm">
          Pending Requests
        </h2>
        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
          {sidebarEmployees.length === 0 ? (
            <li className="p-3 text-sm text-gray-500 dark:text-gray-400">
              No pending approvals
            </li>
          ) : (
            sidebarEmployees.map((emp) => (
              <li
                key={emp.id}
                className={`px-3 py-2 cursor-pointer transition-colors ${
                  selectedEmployeeId === emp.id
                    ? "bg-blue-100 dark:bg-blue-900"
                    : "hover:bg-gray-100 dark:hover:bg-gray-700"
                }`}
                onClick={() => setSelectedEmployeeId(emp.id)}
              >
                <p className="font-medium text-sm">{emp.employee}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {
                    emp.skills.filter(
                      (sk) => sk.Level === "L3" && sk.status === "Pending"
                    ).length
                  }{" "}
                  expert skill(s) pending
                </p>
              </li>
            ))
          )}
        </ul>
      </div>

      {/* Main Content */}
      <div className="flex-1 bg-gray-50 dark:bg-gray-900 px-3 py-2 md:overflow-auto overflow-visible">
        {!selectedEmployee ? (
          <p className="text-gray-500 dark:text-gray-400">
            Select an employee to review expert skills
          </p>
        ) : (
          <>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">
                {selectedEmployee.employee} - Expert Skill Requests
              </h2>
              <div className="flex gap-3">
                <button
                  onClick={() => handleBulkAction("approve")}
                  disabled={selectedSkills.length === 0 || isRequestLoading}
                  className={`px-4 py-2 rounded-lg shadow-md   dark:shadow-gray-600 transition-colors font-medium ${
                    selectedSkills.length === 0 || isRequestLoading
                      ? " bg-transparent cursor-not-allowed text-gray-300 dark:bg-gray-800"
                      : " text-green-700 dark:text-green-400 ring-2 ring-green-500 dark:ring-green-400 hover:bg-green-200 dark:hover:bg-green-800"
                  }`}
                >
                  {selectedEmployee &&
                  selectedSkills.length ===
                    selectedEmployee.skills.filter(
                      (s) => s.status === "Pending" && s.Level === "L3"
                    ).length
                    ? "Approve All"
                    : `Approve   `}
                </button>

                <button
                  onClick={() => handleBulkAction("reject")}
                  disabled={selectedSkills.length === 0 || isRequestLoading}
                  className={`px-4 py-2 rounded-lg shadow-md dark:shadow-gray-600 transition-colors font-medium ${
                    selectedSkills.length === 0 || isRequestLoading
                      ? " bg-transparent cursor-not-allowed text-gray-300 dark:bg-gray-800"
                      : " text-red-700 dark:text-red-400 ring-2 ring-red-500 dark:ring-red-400 hover:bg-red-200 dark:hover:bg-red-800"
                  }`}
                >
                  {selectedEmployee &&
                  selectedSkills.length ===
                    selectedEmployee.skills.filter(
                      (s) => s.status === "Pending" && s.Level === "L3"
                    ).length
                    ? "Reject All"
                    : "Reject"}
                </button>
              </div>
            </div>

            <div className="w-full mb-6 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <div className="max-h-[450px] overflow-auto hide-scrollbar">
                {/* Add horizontal scroll wrapper for mobile */}
                <div className="overflow-x-auto md:overflow-x-visible">
                  <table className="w-full table-auto md:table-fixed border-collapse">
                    <thead className="bg-gray-100 dark:bg-gray-800 sticky top-0 z-10">
                      <tr>
                        <th className="w-[15%] px-4 py-2 text-left">
                          {getHeaderName("Category")}
                        </th>
                        <th className="w-[20%] px-4 py-2 text-left">
                          {getHeaderName("Sub-Category")}
                        </th>
                        <th className="w-[20%] px-4 py-2 text-left">
                          {getHeaderName("Sub-Sub-Category")}
                        </th>

                        <th className="w-[20%] px-4 py-2 text-left">
                          {getHeaderName("Tools")}
                        </th>
                        <th className="w-[8%] px-4 py-2 text-left">Status</th>
                        <th className="w-[5%] text-center"></th>
                        <th className="w-[5%] text-center" title="Select All">
                          <input
                            type="checkbox"
                            checked={
                              selectedEmployee.skills
                                .filter(
                                  (sk) =>
                                    sk.Level === "L3" && sk.status === "Pending"
                                )
                                .every((sk) =>
                                  selectedSkills.includes(sk.skillId)
                                ) && selectedEmployee.skills.length > 0
                            }
                            onChange={(e) =>
                              handleSelectAll(
                                e.target.checked,
                                selectedEmployee.skills
                              )
                            }
                          />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedEmployee.skills.map((skill) => (
                        <tr
                          key={skill.skillId}
                          className="border-t border-gray-200 dark:border-gray-600"
                        >
                          <td
                            className="px-4 py-2 truncate"
                            title={skill.Category}
                          >
                            {skill.Category}
                          </td>
                          <td
                            className="px-4 py-2 truncate"
                            title={skill["Sub-Category"]}
                          >
                            {skill["Sub-Category"]}
                          </td>
                          <td
                            className="px-4 py-2 truncate"
                            title={skill["Sub-Sub-Category"]}
                          >
                            {skill["Sub-Sub-Category"]}
                          </td>
                          <td
                            className="px-4 py-2 truncate cursor-pointer"
                            title={skill.Tools}
                            onClick={() =>
                              navigator.clipboard.writeText(skill.Tools)
                            }
                          >
                            {skill.Tools}
                          </td>

                          <td className="px-4 py-2 font-medium ">
                            <SiTarget
                              className={
                                "h-4 w-4 " +
                                (skill.status == "Pending"
                                  ? "text-yellow-600"
                                  : skill.status === "Approved"
                                  ? "text-green-600"
                                  : "text-red-600")
                              }
                              title={skill.status}
                            />
                          </td>

                          {/* <td
                              className="px-4 py-2 font-medium"
                              title={skill.status}
                            >
                              <span
                                className={
                                  skill.status === "Pending"
                                    ? "text-yellow-600"
                                    : skill.status === "Approved"
                                    ? "text-green-600"
                                    : "text-red-600"
                                }
                              >
                                {skill.status}
                              </span>
                            </td> */}
                          <td className="text-center">
                            <button
                              onClick={() => {
                                // Use skillhierarchy_id to match with master skills
                                const matched = masterSkills.find(
                                  (m) => 
                                    skill.skillhierarchy_id && m.skillhierarchy_id === skill.skillhierarchy_id
                                );
                                if (matched)
                                  setModalLevels({
                                    L1: matched.L1 || "-",
                                    L2: matched.L2 || "-",
                                    L3: matched.L3 || "-",
                                  });
                                setOpen(true);
                              }}
                              className="rounded-full text-blue-500 hover:bg-blue-100 dark:text-blue-400 dark:hover:bg-slate-700 transition-colors duration-200"
                            >
                              <FaQuestion className="h-4" />
                            </button>
                          </td>
                          <td className="text-center">
                            {skill.status === "Pending" && (
                              <input
                                type="checkbox"
                                checked={selectedSkills.includes(skill.skillId)}
                                onChange={() =>
                                  handleSkillSelect(skill.skillId)
                                }
                              />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ✅ Reject Reason Modal */}
      {showRejectDialog && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-96">
            <h3 className="text-lg font-semibold mb-3">Reject Skills</h3>
            <textarea
              className="w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600"
              rows={4}
              placeholder="Enter rejection reason"
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="px-4 py-2 bg-gray-300 dark:bg-gray-600 rounded-md"
                onClick={() => {
                  setShowRejectDialog(false);
                  setReasonText("");
                }}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                onClick={() => executeAction("reject", reasonText)}
              >
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ Approve All Confirmation */}
      {showConfirmDialog && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50">
          <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700">
            <h3 className="text-xl font-semibold mb-3 text-gray-900 dark:text-gray-100">
              Approve All Skills?
            </h3>

            <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
              You are about to approve all selected L3 skills for{" "}
              <strong className="text-gray-900 dark:text-gray-100">
                {selectedEmployee.employee}
              </strong>
              .
            </p>

            <div className="flex justify-center gap-3 mb-5">
              <button
                className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 transition-colors"
                onClick={() => setShowConfirmDialog(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 transition-colors shadow-sm"
                onClick={() => executeAction("approve")}
              >
                Confirm Approve
              </button>
            </div>

            {/* 🔹 Styled Disclaimer */}
            <div className="mt-3 px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-md text-left">
              <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                <span className="font-medium text-gray-700 dark:text-gray-200">
                  Disclaimer:
                </span>{" "}
                By approving this skill request, you acknowledge that you have
                verified the associated expertise and confirm the accuracy and
                relevance of this endorsement. Please ensure all validations are
                complete before proceeding.
              </p>
            </div>
          </div>
        </div>
      )}

      <LevelDetailModal
        open={open}
        onClose={() => setOpen(false)}
        title="Level Details"
        levels={modalLevels || { L1: "-", L2: "-", L3: "-" }}
      />
    </div>
  );
}

export default SkillRequestList;
