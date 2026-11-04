// Year derivation/filtering for the Employee Training Progress widget.
// Kept separate from trainingStatusBuckets.js (single responsibility) and
// from helper/hierarchyUtils.js (this is an Employee-only concern for now,
// not hierarchy-aware — see the plan's decision to keep the Manager side
// all-time). Year is derived from a training's Start Date, matching the
// "Assigned" bucket's own semantics (assignment/start time).

export const ALL_YEARS = "all";

/** Returns the calendar year (number) a training's startDate falls in, or null if missing/invalid. */
export function getTrainingYear(training) {
  const raw = training?.startDate || training?.start_date;
  if (!raw) return null;
  const date = new Date(raw);
  if (isNaN(date.getTime())) return null;
  return date.getFullYear();
}

/** Distinct years present in a training array, sorted newest first. */
export function getAvailableYears(trainingArray = []) {
  const years = new Set();
  for (const training of trainingArray) {
    const year = getTrainingYear(training);
    if (year != null) years.add(year);
  }
  return [...years].sort((a, b) => b - a);
}

/**
 * Filters a training array down to one calendar year; ALL_YEARS passes
 * everything through. A training with no resolvable year (no start_date —
 * real for a self-nominated/approved record, since neither
 * requestTrainingNomination's POST nor reviewTrainingNominations' PUT sets
 * one; see addTrainingV2Api.js) always passes too, rather than being
 * excluded from every specific-year filter including the CURRENT_YEAR
 * default. Without this, an approved-but-unscheduled training is fully
 * present in the underlying data (visible in Open Enrollment's own status
 * badge, which reads the same fetch unfiltered) yet silently missing from
 * the default My Trainings view with no indication why — found via a real
 * bug report, not a hypothetical: this exact scenario.
 */
export function filterTrainingsByYear(trainingArray = [], year) {
  if (year === ALL_YEARS || year == null) return trainingArray;
  return trainingArray.filter((training) => {
    const trainingYear = getTrainingYear(training);
    return trainingYear === null || trainingYear === year;
  });
}
