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

const CertificateContext = createContext();

export const CertificateProvider = ({ children }) => {
  const [masterCertificates, setMasterCertificates] = useState([]);
  const [otherCertificate, setOtherCertificate] = useState(null);
  const [customCertificates, setCustomCertificates] = useState([]);
  const [employeeCertificates, setEmployeeCertificates] = useState([]);
  const [isMasterLoading, setIsMasterLoading] = useState(false);
  const [isEmployeeLoading, setIsEmployeeLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [requestData, setRequestData] = useState(null);
  const [isRequestLoading, setIsRequestLoading] = useState(false);

  const fetchToastId = useRef(null);
  const saveToastId = useRef(null);
  const lastFetchedEmail = useRef(null);
  const fetchingEmailRef = useRef(null); // Track which email is currently being fetched
  const fetchedEmailsSet = useRef(new Set()); // Track all emails we've attempted to fetch

  // 🔹 Fetch master certificates once
  useEffect(() => {
    const fetchMasterCertificates = async () => {
      try {
        setIsMasterLoading(true);
        
        const response = await axios.get(`${BASE_URL}get_certificate_mapping_v2`);
        
        // Handle both array response and object with results/count
        // Ensure certificates is always an array
        let certificates = [];
        if (Array.isArray(response.data)) {
          certificates = response.data;
        } else if (response.data?.results && Array.isArray(response.data.results)) {
          certificates = response.data.results;
        } else if (response.data?.error) {
          console.error("Error from API:", response.data.error);
          toast.error(`Failed to fetch master certificates: ${response.data.error}`);
          setMasterCertificates([]);
          return;
        } else {
          certificates = [];
        }

        const otherCert = certificates.find(
          (cert) => cert.certName?.toLowerCase() === "other"
        );

        setOtherCertificate(otherCert || null);
        setMasterCertificates(certificates);
        
        if (certificates.length === 0) {
          console.warn("No master certificates found. Check if endpoint is working correctly.");
        }
      } catch (err) {
        console.error("Failed to fetch master certificates:", err);
        console.error("Error details:", err.response?.data || err.message);
        toast.error(err.response?.data?.error || "Failed to fetch master certificates.");
        setMasterCertificates([]);
      } finally {
        setIsMasterLoading(false);
      }
    };
    fetchMasterCertificates();
  }, []);

  // 🔹 Fetch employee certificates
  const fetchEmployeeCertificates = async (email, force = false) => {
    if (!email) return;
    
    const normalizedEmail = email.toLowerCase();
    
    // Prevent duplicate calls: check if already loading for this email or already fetched
    if (fetchingEmailRef.current === normalizedEmail) {
      // Already fetching for this email, skip
      return;
    }
    
    // If we've already attempted to fetch for this email, don't fetch again
    // This works even if the user has 0 certificates (length === 0)
    if (!force && fetchedEmailsSet.current.has(normalizedEmail)) {
      // Already fetched for this email (regardless of whether we have data), don't fetch again
      return;
    }

    // Mark that we're fetching for this email BEFORE starting the fetch
    fetchingEmailRef.current = normalizedEmail;
    lastFetchedEmail.current = normalizedEmail;
    fetchedEmailsSet.current.add(normalizedEmail); // Mark that we've attempted to fetch for this email

    if (!fetchToastId.current) {
      fetchToastId.current = toast.loading("Loading employee certificates...", {
        duration: Infinity,
      });
    }

    try {
      setIsEmployeeLoading(true);

      const response = await axios.post(
        `${BASE_URL}get_employee_certificate_v2`,
        { email }
      );

      const fetched = response.data.certificates || [];

      // 🔍 Custom certificates = same mappingId but NOT named "Other"
      // Only filter if otherCertificate exists and has mappingId
      let custom = [];
      let original = fetched;
      
      if (otherCertificate?.mappingId) {
        custom = fetched.filter(
          (c) =>
            c.mappingId === otherCertificate.mappingId && c.certificateName !== "Other"
        );

        original = fetched.filter(
          (c) =>
            c.mappingId !== otherCertificate.mappingId || c.certificateName === "Other"
        );
      } else {
        // If otherCertificate not found, treat all as original certificates
        console.warn("Other certificate not found in master certificates. All certificates will be treated as original.");
        original = fetched;
        custom = [];
      }

      setEmployeeCertificates(original);
      setCustomCertificates(custom);
      toast.dismiss(fetchToastId.current);
    } catch (err) {
      // On error, remove from fetched set so it can be retried if needed
      fetchedEmailsSet.current.delete(normalizedEmail);
      
      if (err.response && err.response.status === 404) {
        toast.error("Previous certificates not found", {
          id: fetchToastId.current,
          duration: 8000,
        });
      } else {
        console.error("Failed to fetch employee certificates:", err);
        setEmployeeCertificates([]);
        setCustomCertificates([]);
        toast.error("Failed to load employee certificates", {
          id: fetchToastId.current,
          duration: 8000,
        });
      }
    } finally {
      setIsEmployeeLoading(false);
      fetchToastId.current = null;
      // Clear the fetching flag
      if (fetchingEmailRef.current === normalizedEmail) {
        fetchingEmailRef.current = null;
      }
    }
  };

  // 🔹 Save employee certificates
  const saveEmployeeCertificates = async (
    employeeInfo,
    selectedCertificates,
    managerEmail = ""
  ) => {
    if (!employeeInfo?.email) {
      toast.error("Employee Email is required", { duration: 8000 });
      return;
    }

    if (!saveToastId.current) {
      saveToastId.current = toast.loading("Saving employee certificates...", {
        duration: Infinity,
      });
    }

    try {
      setIsSaving(true);

      // ✅ Send the selected certificates directly to v2 API
      await axios.post(
        `${BASE_URL}save_employee_certificate_v2`,
        {
          email: employeeInfo.email.toLowerCase(),
          managerEmail:
            employeeInfo.managerEmail?.toLowerCase() ||
            managerEmail?.toLowerCase() ||
            "",
          certificates: selectedCertificates.map((cert) => ({
            certProvider: cert.certProvider,
            certName: cert.certName,
            certLevel: cert.certLevel || null,
            yearAchieved: cert.yearAchieved || null,
            expiryDate: cert.expiryDate || null,
            verified: cert.verified ?? false,
            certIdExternal: cert.certIdExternal || null,
          })),
        },
        { headers: { "Content-Type": "application/json" } }
      );

      // ✅ Refresh employee certificate list (force: bypasses the already-fetched-this-email guard above)
      await fetchEmployeeCertificates(employeeInfo.email, true);

      toast.success("Employee certificates saved successfully!", {
        id: saveToastId.current,
        duration: 5000,
      });
    } catch (error) {
      console.error("Failed to save employee certificates:", error);
      toast.error(
        error.response?.data?.error ||
          "Failed to save employee certificates. Please try again.",
        { id: saveToastId.current, duration: 8000 }
      );
    } finally {
      setIsSaving(false);
      saveToastId.current = null;
    }
  };

  const clearEmployeeCertificates = () => {
    setEmployeeCertificates([]);
  };

  // 🔹 Fetch pending certificate requests (for review)
  const fetchCertificateRequests = async (userEmail) => {
    const toastId = toast.loading("Fetching certificate requests...", {
      duration: Infinity,
    });

    setIsRequestLoading(true);
    try {
      if (!userEmail) {
        toast.error("User email is required", { id: toastId, duration: 5000 });
        setIsRequestLoading(false);
        return;
      }

      const res = await axios.get(`${BASE_URL}get_certificate_requests`, {
        params: { email: userEmail },
      });

      if (res.status === 200) {
        setRequestData(res.data);
        toast.success("Certificate requests fetched successfully!", {
          id: toastId,
          duration: 3000,
        });
      } else {
        toast.error("Failed to fetch certificate requests.", {
          id: toastId,
          duration: 5000,
        });
      }
    } catch (error) {
      console.error("Error fetching certificate requests:", error);
      toast.error(
        error?.response?.data?.error ||
          "An unexpected error occurred while fetching certificate requests.",
        { id: toastId, duration: 5000 }
      );
    } finally {
      setIsRequestLoading(false);
    }
  };

  // 🔹 Review (Approve / Reject) certificates
  const reviewCertificates = async (
    certIds,
    approvedByEmail,
    action,
    reason
  ) => {
    const toastId = toast.loading(
      action === "approve"
        ? "Approving certificates..."
        : "Rejecting certificates..."
    );

    try {
      if (!certIds?.length || !approvedByEmail || !action) {
        toast.error("Missing required fields.", { id: toastId });
        return;
      }

      const payload = {
        approvedByEmail,
        action,
        reason: action === "reject" ? reason || "No reason provided" : null,
        certificates: certIds.map((id) => ({ empCertId: id })),
      };

      const res = await axios.post(`${BASE_URL}review_certificate`, payload);

      if (res.status === 200) {
        // ✅ Optimistic UI update
        setRequestData((prev) =>
          prev.map((emp) => ({
            ...emp,
            certificates: emp.certificates?.map((c) =>
              certIds.includes(c.certId)
                ? {
                    ...c,
                    Status: action === "approve" ? "Approved" : "Rejected",
                    RejectReason: action === "reject" ? reason : null,
                    verified: action === "approve",
                  }
                : c
            ),
          }))
        );

        toast.success(
          res.data.message || "Certificates reviewed successfully!",
          {
            id: toastId,
          }
        );
      } else {
        toast.error("Failed to review certificates.", { id: toastId });
      }
    } catch (err) {
      console.error("❌ Error reviewing certificates:", err);
      toast.error("Unexpected error", { id: toastId });
    }
  };

  const downloadCertificateMatrix = async () => {
    const toastId = toast.loading("Preparing Certificates master file...", {
      duration: Infinity,
    });

    try {
      const response = await axios.get(`${BASE_URL}get_master_file_v2`, {
        params: { type: "certificates" }, // always certificates
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

      const filename = `Master_Certificates${ext}`;

      const link = document.createElement("a");
      link.href = window.URL.createObjectURL(blob);
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();

      toast.success("Certificates master file downloading!", {
        id: toastId,
        duration: 5000,
      });
    } catch (error) {
      console.error(error);
      toast.error("Failed to download Certificates master file", {
        id: toastId,
        duration: 8000,
      });
    }
  };

  return (
    <CertificateContext.Provider
      value={{
        masterCertificates,
        employeeCertificates,
        requestData,
        otherCertificate,
        customCertificates,
        setCustomCertificates,
        reviewCertificates,
        setRequestData,
        fetchEmployeeCertificates,
        saveEmployeeCertificates,
        clearEmployeeCertificates,
        fetchCertificateRequests,
        downloadCertificateMatrix,
        isMasterLoading,
        isEmployeeLoading,
        isSaving,
        isRequestLoading,
      }}
    >
      {children}
    </CertificateContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useCertificates = () => useContext(CertificateContext);
