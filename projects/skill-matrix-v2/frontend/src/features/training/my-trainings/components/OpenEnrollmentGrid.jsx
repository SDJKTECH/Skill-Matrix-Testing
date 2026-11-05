import React, { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { FiInbox, FiSearch, FiUser } from "react-icons/fi";
import EntityCard from "../../shared/components/EntityCard";
import EntityCardGrid from "../../shared/components/EntityCardGrid";
import HoverPillLabel from "../../shared/components/HoverPillLabel";
import CardListPagination from "../../shared/components/CardListPagination";
import InlineDecisionPanel from "../../shared/components/InlineDecisionPanel";
import IncompleteTrainingCard from "./IncompleteTrainingCard";
import LoadingSpinner from "../../shared/components/LoadingSpinner";
import { requestTrainingNomination, suggestEmployees, updateTraining } from "../../../../helper/addTrainingV2Api";
import { useAuth } from "../../../../hooks/useAuth";
import { toEntityCardPropsForBatch } from "../services/batchCardAdapter";
import { OPEN_ENROLLMENT_PAGE_SIZE, paginateClient } from "../services/myTrainingsQuery";
import { getNotCompletedTrainings } from "../../shared/config/trainingRecordAdapter";

const NOTE_MAX_LENGTH = 240;

// Glow and badge shine for cards you can still request. One style tag for the page.
// Reduced motion keeps the glow and hides the shine.
const SPARKLE_STYLES = `
  @keyframes oe-glow-pulse {
    0%, 100% { box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.4), 0 0 0 0 rgba(79, 70, 229, 0.3); }
    50% { box-shadow: 0 0 0 1px rgba(79, 70, 229, 0.7), 0 0 18px 5px rgba(37, 99, 235, 0.35); }
  }
  @keyframes oe-badge-shine {
    0%, 15% { left: -30%; opacity: 0; }
    20% { opacity: 1; }
    45%, 100% { left: 130%; opacity: 0; }
  }
  .oe-sparkle-card { animation: oe-glow-pulse 2.8s cubic-bezier(0.45, 0, 0.55, 1) infinite; }
  .oe-sparkle-shine {
    position: absolute;
    top: -60%;
    left: -30%;
    width: 30%;
    height: 220%;
    background: linear-gradient(120deg, transparent, rgba(255, 255, 255, 0.85), transparent);
    transform: rotate(20deg);
    animation: oe-badge-shine 3.4s ease-in-out infinite;
  }
  @media (prefers-reduced-motion: reduce) {
    .oe-sparkle-card { animation: none; box-shadow: 0 0 0 1.5px rgba(79, 70, 229, 0.6); }
    .oe-sparkle-shine { animation: none; opacity: 0; }
  }
`;

/** Open for Enrollment card grid. Items arrive already filtered. 4 cards per page. */
export default function OpenEnrollmentGrid({ items, loading, searchQuery, employeeId, onRefreshNeeded, onViewBatch, trainings = [] }) {
  const { user } = useAuth();
  const [nominatingBatch, setNominatingBatch] = useState(null);
  const [submittingNomination, setSubmittingNomination] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  // Reasons saved this session (shown before the trainings list refetches).
  const [delayReasons, setDelayReasons] = useState({});
  const [blockSignal, setBlockSignal] = useState(0);
  const incompleteTrainings = useMemo(
    () =>
      getNotCompletedTrainings(trainings).map((t) => ({ id: t.id, name: t.moduleName, batch: t.batch, reason: delayReasons[t.id] || t.statusRemarks })),
    [trainings, delayReasons]
  );
  // Manager is stored as an email. Look up the name for the approver line.
  const [managerName, setManagerName] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (!user?.managerEmail) {
      setManagerName(null);
      return;
    }
    suggestEmployees(user.managerEmail)
      .then((results) => {
        if (cancelled) return;
        const match = results.find((r) => (r.email || "").toLowerCase() === user.managerEmail.toLowerCase());
        setManagerName(match?.name || null);
      })
      .catch(() => { if (!cancelled) setManagerName(null); });
    return () => { cancelled = true; };
  }, [user?.managerEmail]);

  // A new search starts back at page 1.
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  // Shown right away; saved to status_remarks so the approving manager sees
  // it. On failure the row falls back to its previously saved reason.
  const saveDelayReason = async (id, text) => {
    const previous = delayReasons[id];
    setDelayReasons((prev) => ({ ...prev, [id]: text }));
    try {
      await updateTraining({ employee_training_id: id, admin_id: employeeId, status_remarks: text });
    } catch (err) {
      setDelayReasons((prev) => ({ ...prev, [id]: previous }));
      toast.error(err?.response?.data?.error || "Couldn't save the reason — please try again.");
    }
  };

  const handleRequest = async (note) => {
    if (!nominatingBatch) return;
    // Submit waits until every incomplete training has a reason.
    if (incompleteTrainings.some((t) => !t.reason)) {
      setBlockSignal((n) => n + 1);
      return;
    }
    setSubmittingNomination(true);
    try {
      await requestTrainingNomination({ employeeId, batch: nominatingBatch, note });
      onRefreshNeeded?.();
      setNominatingBatch(null);
    } catch (err) {
      // Show the server message, including a duplicate request.
      const detail = err?.response?.data?.error;
      toast.error(detail || "Failed to submit request — please try again.");
    } finally {
      setSubmittingNomination(false);
    }
  };

  if (loading && items.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center py-12 text-gray-500 dark:text-gray-400">
        <LoadingSpinner label="Loading open batches..." />
      </div>
    );
  }

  if (!loading && items.length === 0) {
    const hasQuery = Boolean(String(searchQuery || "").trim());
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center py-12">
        {hasQuery ? (
          <>
            <FiSearch className="h-8 w-8 text-gray-300 dark:text-gray-600 mb-2" />
            <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
              No open batches match &ldquo;{searchQuery}&rdquo;
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Try a different search term.</p>
          </>
        ) : (
          <>
            <FiInbox className="h-8 w-8 text-gray-300 dark:text-gray-600 mb-2" />
            <p className="text-sm font-medium text-gray-600 dark:text-gray-300">No batches open for enrollment right now</p>
          </>
        )}
      </div>
    );
  }

  const paged = paginateClient(items, currentPage, OPEN_ENROLLMENT_PAGE_SIZE);

  return (
    <>
      <style>{SPARKLE_STYLES}</style>
      {/* Extra inset for this view only. */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain hide-scrollbar p-2">
        <EntityCardGrid>
          {paged.items.map((item) => {
            const isNominating = nominatingBatch?.batchNum === item.batchNum;
            const cardProps = toEntityCardPropsForBatch(item, { onRequest: setNominatingBatch, onViewBatch });
            return (
              <div key={item.batchNum} className="flex flex-col">
                <EntityCard {...cardProps} minHeightClass="min-h-[320px]" />
                {/* The card is already a button, so View Details is a link laid over the footer. */}
                {cardProps.secondaryAction && (
                  <div className="@container relative">
                    <button
                      type="button"
                      onClick={() => cardProps.secondaryAction.onClick()}
                      aria-label={cardProps.secondaryAction.ariaLabel}
                      className="group absolute left-5 bottom-5 z-20 cursor-pointer"
                    >
                      <HoverPillLabel
                        roundedClassName="rounded-md"
                        revealClassName={
                          cardProps.secondaryAction.tone === "retry"
                            ? "group-hover:bg-amber-50 dark:group-hover:bg-amber-900/20 group-focus-visible:bg-amber-50 dark:group-focus-visible:bg-amber-900/20"
                            : undefined
                        }
                        className={`gap-1 text-[13px] ${
                          cardProps.secondaryAction.tone === "retry"
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-gray-500 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 group-focus-visible:text-blue-600 dark:group-focus-visible:text-blue-400"
                        }`}
                      >
                        <span className={cardProps.secondaryAction.shortLabel ? "@max-[288px]:hidden" : undefined}>{cardProps.secondaryAction.label}</span>
                        {cardProps.secondaryAction.shortLabel && (
                          <span className="hidden @max-[288px]:inline">{cardProps.secondaryAction.shortLabel}</span>
                        )}
                      </HoverPillLabel>
                    </button>
                  </div>
                )}
                {isNominating && (
                  <IncompleteTrainingCard
                    items={incompleteTrainings}
                    totalCount={trainings.length}
                    onViewBatch={onViewBatch}
                    onSaveReason={saveDelayReason}
                    blockSignal={blockSignal}
                  />
                )}
                {isNominating && (
                  <InlineDecisionPanel
                    tone="request"
                    // Approver only. Title, trainer, and seats are already on the card.
                    helper={
                      <span className="inline-flex items-center gap-1">
                        <FiUser className="h-3 w-3 text-gray-400" /> Approver: {managerName || "your manager"}
                      </span>
                    }
                    fieldLabel="Note (required)"
                    required
                    placeholder="Why this training, or anything your manager should know…"
                    maxLength={NOTE_MAX_LENGTH}
                    confirmLabel="Submit request"
                    submittingLabel="Submitting…"
                    submitting={submittingNomination}
                    onCancel={() => setNominatingBatch(null)}
                    onSubmit={handleRequest}
                  />
                )}
              </div>
            );
          })}
        </EntityCardGrid>
      </div>

      <CardListPagination
        page={paged.page}
        totalPages={paged.totalPages}
        total={paged.total}
        pageSize={OPEN_ENROLLMENT_PAGE_SIZE}
        itemLabel="open batches"
        onPrev={() => setCurrentPage((p) => Math.max(1, p - 1))}
        onNext={() => setCurrentPage((p) => p + 1)}
      />
    </>
  );
}
