import React, { useState, useEffect, useMemo } from "react";
import toast from "react-hot-toast";
import { useAuth } from "../hooks/useAuth";
import {
  fetchCertificateMappings,
  addCertificate,
  uploadCertificateCSV,
} from "../helper/addCertificateV2Api";
import SkillFilterDropdown from "./FilterDropdown";

const emptyCertRow = () => ({
  certProvider: "",
  certName: "",
  certLevel: "",
  validYears: "",
});

const CERTIFICATES_TEMPLATE_URL = "/certificates_template.xlsx";

function AdminConsoleCertificates() {
  const { user } = useAuth();
  const [certificateList, setCertificateList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [csvFile, setCsvFile] = useState(null);
  const [certRows, setCertRows] = useState([emptyCertRow()]);

  const filterOptions = useMemo(() => {
    const providers = [...new Set(certificateList.map((r) => r.certProvider).filter(Boolean))].sort();
    const names = [...new Set(certificateList.map((r) => r.certName).filter(Boolean))].sort();
    const levels = [...new Set(certificateList.map((r) => r.certLevel).filter(Boolean))].sort();
    return { providers, names, levels };
  }, [certificateList]);

  const loadMappings = async () => {
    setLoading(true);
    try {
      const list = await fetchCertificateMappings();
      setCertificateList(list);
    } catch (err) {
      console.error("Failed to load certificate mappings:", err);
      toast.error(err.response?.data?.error || "Failed to load certificates.");
      setCertificateList([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMappings();
  }, []);

  const handleAddRow = () => {
    setCertRows((rows) => [...rows, emptyCertRow()]);
  };

  const handleRemoveRow = (index) => {
    setCertRows((rows) => (rows.length > 1 ? rows.filter((_, i) => i !== index) : rows));
  };

  const handleRowChange = (index, field, value) => {
    setCertRows((rows) =>
      rows.map((row, i) => {
        if (i !== index) return row;
        const next = { ...row, [field]: value };
        if (field === "certProvider") next.certName = next.certLevel = "";
        if (field === "certName") next.certLevel = "";
        return next;
      })
    );
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
      const res = await uploadCertificateCSV(csvFile, employeeId);
      const created = res?.successful_inserts ?? 0;
      const skipped = res?.skipped_existing ?? 0;
      const errors = res?.errors?.length ?? 0;
      toast.success(
        `Upload complete: ${created} created, ${skipped} already existed${errors ? `, ${errors} row(s) had errors` : ""}.`
      );
      setCsvFile(null);
      await loadMappings();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    const validRows = certRows.filter(
      (r) => r.certProvider?.trim() && r.certName?.trim() && r.certLevel?.trim()
    );
    if (validRows.length === 0) {
      toast.error("Please fill at least one certificate (Provider, Certificate Name, and Level).");
      return;
    }
    const employeeId = user?.dbEmployeeId ?? user?.employeeId;
    if (!employeeId) {
      toast.error("User not identified. Please log in again.");
      return;
    }
    setSaving(true);
    try {
      let created = 0;
      for (const r of validRows) {
        try {
          await addCertificate({
            employee_id: employeeId,
            certProvider: r.certProvider.trim(),
            certName: r.certName.trim(),
            certLevel: r.certLevel.trim(),
            ...(r.validYears !== "" && r.validYears !== undefined
              ? { validYears: Number(r.validYears) || 0 }
              : {}),
          });
          created++;
        } catch (err) {
          toast.error(err.response?.data?.error || err.message || `Row failed: ${r.certName}`);
        }
      }
      if (created > 0) {
        toast.success(`Saved: ${created} certificate(s) added.`);
        setCertRows([emptyCertRow()]);
        await loadMappings();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Add Certificate Hierarchy</h2>
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
              Required columns: Certificate Provider, Certificate Name. Optional: Certificate Level, Valid Years.
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
                href={CERTIFICATES_TEMPLATE_URL}
                download="certificates_template.xlsx"
                className="inline-flex px-4 py-2 rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200 text-sm font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50 no-underline"
              >
                Download template
              </a>
            </div>
          </div>

          {/* Manual add: multiple certificate rows */}
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Add certificates manually</h3>
          <div className="space-y-3 max-w-4xl">
            {certRows.map((row, index) => (
              <div key={index} className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2 items-end">
                  <SkillFilterDropdown
                    label={index === 0 ? "Provider" : ""}
                    options={filterOptions.providers}
                    value={row.certProvider}
                    onChange={(v) => handleRowChange(index, "certProvider", v)}
                    placeholder="Select or add Provider"
                  />
                  <SkillFilterDropdown
                    label={index === 0 ? "Certificate Name" : ""}
                    options={filterOptions.names}
                    value={row.certName}
                    onChange={(v) => handleRowChange(index, "certName", v)}
                    placeholder="Select or add Certificate Name"
                  />
                  <SkillFilterDropdown
                    label={index === 0 ? "Level" : ""}
                    options={filterOptions.levels}
                    value={row.certLevel}
                    onChange={(v) => handleRowChange(index, "certLevel", v)}
                    placeholder="Select or add Level"
                  />
                  <div className="flex flex-col">
                    {index === 0 && (
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Valid (years)</label>
                    )}
                    {index !== 0 && <span className="block h-5 shrink-0" aria-hidden />}
                    <input
                      type="number"
                      min="0"
                      value={row.validYears}
                      onChange={(e) => handleRowChange(index, "validYears", e.target.value)}
                      placeholder="0"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                    />
                  </div>
                  <div className={index === 0 ? "pt-6" : ""}>
                    {certRows.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(index)}
                        title="Remove row"
                        className="p-2 rounded-lg text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <span className="sr-only">Remove</span>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    ) : (
                      <span className="inline-block w-9" />
                    )}
                  </div>
                </div>
                {/* Active flag removed: backend no longer stores per-certificate is_active,
                    so we don't expose it in the UI anymore. */}
              </div>
            ))}
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={handleAddRow}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-gray-400 dark:border-gray-500 text-gray-600 dark:text-gray-400 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 text-sm font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add another certificate
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

export default AdminConsoleCertificates;
