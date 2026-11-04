import React from "react";
import { FiUser } from "react-icons/fi";
import StatusPill from "../../shared/components/StatusPill";
import { ENROLLMENT_STATUS_ICONS } from "../../training-batch/services/trainingUtils";

const PENDING_APPROVAL_COLOR = { "pending approval": "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" };

/**
 * One nominee row inside a TrainingBatchGroup — name-first, no avatar
 * (same convention as EmployeeRow). Informational only: a pending
 * nomination-approval request shows as an amber "Pending Approval" pill,
 * a settled record shows its real training_status pill. No approve/reject
 * actions here — those live only in the dedicated approvals banner/queue,
 * not duplicated inside this training-status list.
 *
 * Props: { nominee }
 */
export default function TrainingBatchNomineeRow({ nominee }) {
  const { employeeName, trainingStatus, pendingRequestId } = nominee;

  return (
    <div className="flex items-center gap-2.5 py-1.5 px-2.5 rounded-lg bg-gray-50 dark:bg-gray-900/30">
      <FiUser className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500" />
      <p className="min-w-0 flex-1 text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{employeeName}</p>
      <StatusPill
        status={pendingRequestId ? "Pending Approval" : trainingStatus}
        size="sm"
        colorMap={pendingRequestId ? PENDING_APPROVAL_COLOR : undefined}
        icon={ENROLLMENT_STATUS_ICONS[String(pendingRequestId ? "pending approval" : trainingStatus).toLowerCase()]}
      />
    </div>
  );
}
