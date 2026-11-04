import { useState } from "react";
import SkillRequestList from "./SkillRequestList";
import CertificateRequestList from "./CertificateRequestList";

export default function RequestList() {
  const [activeTab, setActiveTab] = useState("skills");

  return (
    <div className="w-full h-full">
      <div className="w-full mb-1 flex">
        <div className="mx-auto text-xs text-gray-700 dark:text-gray-300 text-left sm:text-center bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md px-3 py-2 inline-block sm:max-w-fit whitespace-nowrap">
          <span className="text-red-600 dark:text-red-500 font-semibold">
            Disclaimer:&nbsp;
          </span>
          By approving requests, you acknowledge that you have verified the
          associated expertise and confirm the accuracy and relevance of this
          endorsement.
        </div>
      </div>

      <SkillRequestList />
      {/* Tabs Header */}
      {/* <div className="flex gap-3 mb-3 border-b border-gray-300 dark:border-gray-700">
        <button
          onClick={() => setActiveTab("skills")}
          className={`px-3 py-1.5 text-sm font-semibold transition-colors rounded-t-md ${
            activeTab === "skills"
              ? "border-b-2 border-blue-500 text-blue-600 bg-gray-100 dark:bg-gray-800"
              : "text-gray-500 hover:text-blue-500"
          }`}
        >
          Skill Requests
        </button>
        <button
          onClick={() => setActiveTab("certificates")}
          className={`px-3 py-1.5 text-sm font-semibold transition-colors rounded-t-md ${
            activeTab === "certificates"
              ? "border-b-2 border-blue-500 text-blue-600 bg-gray-100 dark:bg-gray-800"
              : "text-gray-500 hover:text-blue-500"
          }`}
        >
          Certificate Requests
        </button>
      </div> */}

      {/* Tab Content */}
      {/* <div className="mt-2 text-sm">
        {activeTab === "skills" && <SkillRequestList compact />}
        {activeTab === "certificates" && <CertificateRequestList compact />}
      </div> */}
    </div>
  );
}
