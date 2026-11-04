import { useEffect, useState } from "react";
import { useCertificates } from "../context/CertificateContext";
import { useAuth } from "../hooks/useAuth";

export default function CertificateRequestList() {
  const [selected, setSelected] = useState([]);

  const { user } = useAuth();
  const {
    fetchCertificateRequests,
    employeeCertificates,
    reviewCertificates,
    isEmployeeLoading,
  } = useCertificates();

  useEffect(() => {
    // Fetch only if not already loaded
    if (!employeeCertificates || employeeCertificates.length === 0) {
      fetchCertificateRequests(user.userPrincipalName);
    }
  }, []);

  // Handle Approve / Reject
  const handleReview = async (status) => {
    if (selected.length === 0) return;

    // Filter selected certificates
    const selectedCerts = employeeCertificates.filter((cert) =>
      selected.includes(cert.certHashId)
    );

    await reviewCertificates(selectedCerts, status);
    setSelected([]);
    await fetchCertificateRequests(user.userPrincipalName); // Refresh after review
  };

  return (
    <div className="text-sm">
      <h2 className="text-base font-semibold mb-3">
        Certificate Approval Requests
      </h2>

      {isEmployeeLoading ? (
        <p>Loading...</p>
      ) : employeeCertificates.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">
          No pending certificate requests.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full table-auto border-collapse border border-gray-200 dark:border-gray-700">
            <thead className="bg-gray-100 dark:bg-gray-800">
              <tr>
                <th className="px-2 py-1 border">Select</th>
                <th className="px-2 py-1 border">Employee</th>
                <th className="px-2 py-1 border">Provider</th>
                <th className="px-2 py-1 border">Certificate</th>
                <th className="px-2 py-1 border">Level</th>
                <th className="px-2 py-1 border">Status</th>
              </tr>
            </thead>
            <tbody>
              {employeeCertificates.map((cert) => (
                <tr key={cert.certHashId}>
                  <td className="px-2 py-1 border text-center">
                    <input
                      type="checkbox"
                      checked={selected.includes(cert.certHashId)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelected((prev) => [...prev, cert.certHashId]);
                        } else {
                          setSelected((prev) =>
                            prev.filter((id) => id !== cert.certHashId)
                          );
                        }
                      }}
                    />
                  </td>
                  <td className="px-2 py-1 border">{cert.empName}</td>
                  <td className="px-2 py-1 border">{cert.certProvider}</td>
                  <td className="px-2 py-1 border">{cert.certName}</td>
                  <td className="px-2 py-1 border">{cert.certLevel}</td>
                  <td
                    className={`px-2 py-1 border text-xs font-medium ${
                      cert.approvalStatus === "Pending"
                        ? "text-yellow-600"
                        : cert.approvalStatus === "Approved"
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {cert.approvalStatus}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Action buttons */}
      {selected.length > 0 && (
        <div className="flex gap-3 mt-3">
          <button
            onClick={() => handleReview("Approved")}
            disabled={isEmployeeLoading}
            className="bg-green-500 text-white px-3 py-1.5 rounded-lg hover:bg-green-600 disabled:opacity-50 text-sm"
          >
            Approve
          </button>
          <button
            onClick={() => handleReview("Rejected")}
            disabled={isEmployeeLoading}
            className="bg-red-500 text-white px-3 py-1.5 rounded-lg hover:bg-red-600 disabled:opacity-50 text-sm"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}
