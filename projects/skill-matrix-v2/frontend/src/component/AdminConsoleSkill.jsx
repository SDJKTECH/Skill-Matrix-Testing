import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { useAuth } from "../hooks/useAuth";
import {
  fetchSkillHierarchies,
  getUniqueFilterOptions,
  addSkillHierarchyBatch,
  uploadSkillCSV,
} from "../helper/addSkillV2Api";
import SkillFilterDropdown from "./FilterDropdown";

const emptyRow = () => ({
  domain_name: "",
  discipline_name: "",
  skill_area: "",
  framework_name: "",
  basic: "",
  intermediate: "",
  expert: "",
});

const SKILLS_TEMPLATE_URL = "/skills_template.xlsx";

function AdminConsoleSkill() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [csvFile, setCsvFile] = useState(null);
  const [filterOptions, setFilterOptions] = useState({
    domains: [],
    disciplines: [],
    skillAreas: [],
    frameworks: [],
    l1: [],
    l2: [],
    l3: [],
  });
  const [skillRows, setSkillRows] = useState([emptyRow()]);

  const loadHierarchies = async () => {
    setLoading(true);
    try {
      const results = await fetchSkillHierarchies();
      setFilterOptions(getUniqueFilterOptions(results));
    } catch (err) {
      console.error("Failed to load skill hierarchies:", err);
      toast.error(err.response?.data?.error || "Failed to load filter options.");
      setFilterOptions({ domains: [], disciplines: [], skillAreas: [], frameworks: [], l1: [], l2: [], l3: [] });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHierarchies();
  }, []);

  const handleAddRow = () => {
    setSkillRows((rows) => [...rows, emptyRow()]);
  };

  const handleRemoveRow = (index) => {
    setSkillRows((rows) => (rows.length > 1 ? rows.filter((_, i) => i !== index) : rows));
  };

  const handleRowChange = (index, field, value) => {
    setSkillRows((rows) =>
      rows.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  };

  const handleSave = async () => {
    const validRows = skillRows.filter(
      (r) =>
        r.domain_name &&
        r.discipline_name &&
        r.skill_area &&
        r.framework_name
    );
    if (validRows.length === 0) {
      toast.error("Please fill at least one skill (Domain, Discipline, Skill Area, Framework).");
      return;
    }
    const employeeId = user?.dbEmployeeId ?? user?.employeeId;
    if (!employeeId) {
      toast.error("User not identified. Please log in again.");
      return;
    }
    const payload = validRows.map((r) => ({
      domain_name: r.domain_name,
      discipline_name: r.discipline_name,
      skill_area: r.skill_area,
      framework_name: r.framework_name,
      ...(r.basic && { basic: r.basic }),
      ...(r.intermediate && { intermediate: r.intermediate }),
      ...(r.expert && { expert: r.expert }),
    }));
    setSaving(true);
    try {
      const res = await addSkillHierarchyBatch(employeeId, payload);
      const summary = res?.summary || {};
      const created = summary.created ?? 0;
      const skipped = summary.already_exists ?? 0;
      toast.success(
        `Saved: ${created} created, ${skipped} already existed.`
      );
      setSkillRows([emptyRow()]);
      await loadHierarchies();
    } catch (err) {
      if (err.response?.status === 409) toast.error("One or more skill hierarchies already exist.");
      else if (err.response?.status === 403) toast.error("You don't have permission to add skills.");
      else toast.error(err.response?.data?.error || err.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const handleUploadCSV = async () => {
    if (!csvFile) {
      toast.error("Please select a CSV or Excel file first.");
      return;
    }
    const employeeId = user?.dbEmployeeId ?? user?.employeeId;
    if (!employeeId) {
      toast.error("User not identified. Please log in again.");
      return;
    }
    setUploading(true);
    try {
      const res = await uploadSkillCSV(csvFile, employeeId);
      const created = res?.created ?? 0;
      const skipped = res?.skipped_existing ?? 0;
      const faulty = res?.faulty_rows_count ?? 0;
      toast.success(
        `Upload complete: ${created} created, ${skipped} already existed${faulty ? `, ${faulty} row(s) skipped (invalid/duplicate)` : ""}.`
      );
      setCsvFile(null);
      await loadHierarchies();
    } catch (err) {
      const msg = err.response?.data?.error || err.message || "Upload failed.";
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Add Skill Hierarchy</h2>
      {loading ? (
        <div className="flex items-center justify-center text-gray-500 dark:text-gray-400 py-8">
          Loading filter options...
        </div>
      ) : (
        <>
          {/* CSV Upload section */}
          <div className="mb-8 p-4 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Upload CSV / Excel</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Required columns: Discipline, Domain, Skill Area, Framework. Mandatory: L1, L2, L3 if new tools are added.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="text-sm text-gray-600 dark:text-gray-400 file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-blue-50 file:text-blue-700 dark:file:bg-blue-900/30 dark:file:text-blue-300 file:text-sm"
                  onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                />
              </label>
              <button
                type="button"
                onClick={handleUploadCSV}
                disabled={uploading || !csvFile}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? "Uploading..." : "Upload"}
              </button>
              <a
                href={SKILLS_TEMPLATE_URL}
                download="skills_template.xlsx"
                className="inline-flex px-4 py-2 rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200 text-sm font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50 no-underline"
              >
                Download template
              </a>
            </div>
          </div>

          {/* Manual add: multiple skill rows */}
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Add skills manually</h3>
          <div className="space-y-3 max-w-4xl">
            {skillRows.map((row, index) => {
              const isNewFramework =
                row.framework_name &&
                !filterOptions.frameworks.some(
                  (f) =>
                    (f || "").toLowerCase() ===
                    (row.framework_name || "").toLowerCase()
                );
              return (
              <div key={index} className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2 items-end">
                  <SkillFilterDropdown
                    label={index === 0 ? "Domain" : ""}
                    options={filterOptions.domains}
                    value={row.domain_name}
                    onChange={(v) => handleRowChange(index, "domain_name", v)}
                    placeholder="Domain"
                  />
                  <SkillFilterDropdown
                    label={index === 0 ? "Discipline" : ""}
                    options={filterOptions.disciplines}
                    value={row.discipline_name}
                    onChange={(v) =>
                      handleRowChange(index, "discipline_name", v)
                    }
                    placeholder="Discipline"
                  />
                  <SkillFilterDropdown
                    label={index === 0 ? "Skill Area" : ""}
                    options={filterOptions.skillAreas}
                    value={row.skill_area}
                    onChange={(v) => handleRowChange(index, "skill_area", v)}
                    placeholder="Skill Area"
                  />
                  <SkillFilterDropdown
                    label={index === 0 ? "Framework" : ""}
                    options={filterOptions.frameworks}
                    value={row.framework_name}
                    onChange={(v) =>
                      handleRowChange(index, "framework_name", v)
                    }
                    placeholder="Framework"
                  />
                  <div className={index === 0 ? "pt-6" : ""}>
                    {skillRows.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(index)}
                        title="Remove row"
                        className="p-2 rounded-lg text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <span className="sr-only">Remove</span>
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    ) : (
                      <span className="inline-block w-9" />
                    )}
                  </div>
                </div>

                {isNewFramework && (
                  <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/40 p-3">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                      {index === 0
                        ? ""
                        : "Level descriptions"}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                      <div>
                        <div className="font-medium text-gray-700 dark:text-gray-300 mb-1">
                          L1 (Basic)
                        </div>
                        <textarea
                          rows={3}
                          value={row.basic}
                          onChange={(e) =>
                            handleRowChange(index, "basic", e.target.value)
                          }
                          placeholder="What should a Basic (L1) practitioner be able to do?"
                          className="w-full px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                        />
                      </div>
                      <div>
                        <div className="font-medium text-gray-700 dark:text-gray-300 mb-1">
                          L2 (Intermediate)
                        </div>
                        <textarea
                          rows={3}
                          value={row.intermediate}
                          onChange={(e) =>
                            handleRowChange(
                              index,
                              "intermediate",
                              e.target.value
                            )
                          }
                          placeholder="What should an Intermediate (L2) practitioner be able to do?"
                          className="w-full px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                        />
                      </div>
                      <div>
                        <div className="font-medium text-gray-700 dark:text-gray-300 mb-1">
                          L3 (Expert)
                        </div>
                        <textarea
                          rows={3}
                          value={row.expert}
                          onChange={(e) =>
                            handleRowChange(index, "expert", e.target.value)
                          }
                          placeholder="What should an Expert (L3) practitioner be able to do?"
                          className="w-full px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
            })}
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={handleAddRow}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-gray-400 dark:border-gray-500 text-gray-600 dark:text-gray-400 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 text-sm font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add another skill
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default AdminConsoleSkill;
