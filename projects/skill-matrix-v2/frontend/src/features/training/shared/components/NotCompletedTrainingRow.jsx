import React from "react";
import BatchLink from "./BatchLink";

export const NO_REASON = "No reason provided";

// A training's reason in muted text, or a muted italic fallback.
export function TrainingReason({ text }) {
  return text ? (
    <span className="text-gray-600 dark:text-gray-300 break-words">{text}</span>
  ) : (
    <span className="italic text-gray-500 dark:text-gray-400">{NO_REASON}</span>
  );
}

/**
 * One numbered row in NotCompletedSummary's details: index, name, batch
 * link, reason. On sm+ it sits on the parent list's four subgrid columns, so
 * columns line up across rows. On mobile: stacked, no index.
 */
export default function NotCompletedTrainingRow({ index, training, onViewBatch }) {
  return (
    <li className="grid gap-x-4 gap-y-0.5 py-1.5 sm:col-span-4 sm:grid-cols-subgrid sm:items-baseline">
      <span
        aria-hidden="true"
        className="hidden sm:inline-flex h-4 w-4 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-[10px] font-medium text-gray-600 dark:text-gray-300"
      >
        {index}
      </span>
      <span className="font-medium text-gray-900 dark:text-gray-100 break-words">{training.moduleName}</span>
      {training.batch && onViewBatch ? (
        <BatchLink batchNum={training.batch} onClick={onViewBatch} className="justify-self-start whitespace-nowrap" />
      ) : (
        <span className="hidden sm:block" aria-hidden="true" />
      )}
      <TrainingReason text={training.statusRemarks} />
    </li>
  );
}
