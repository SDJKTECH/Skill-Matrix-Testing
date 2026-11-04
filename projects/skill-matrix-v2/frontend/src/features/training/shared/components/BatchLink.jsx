import React from "react";
import { FiExternalLink } from "react-icons/fi";
import { FOCUS_RING } from "../config/focusRing";

/**
 * Underlined "open this batch" link with an external-link icon. Shared by
 * the nomination panel's incomplete-trainings list and the manager's
 * Not Completed details. Shows `children`, or the batch number by default.
 */
export default function BatchLink({ batchNum, onClick, className = "", children }) {
  return (
    <button
      type="button"
      onClick={() => onClick(batchNum)}
      title={`Open batch ${batchNum}`}
      className={`text-left text-blue-600 dark:text-blue-400 underline underline-offset-2 decoration-blue-300 hover:decoration-blue-600 hover:text-blue-700 dark:hover:text-blue-300 cursor-pointer rounded ${FOCUS_RING} ${className}`}
    >
      {children ?? batchNum}
      <FiExternalLink className="ml-1 inline h-3 w-3 align-[-1px]" aria-hidden="true" />
    </button>
  );
}
