// Turns a date ("YYYY-MM-DD" or "YYYY-MM") into a quarter like "2026-Q1".
// The year starts in April: Q1 = Apr-Jun. Jan-Mar belongs to the year
// before, so sorting the text newest-first still works. Returns null if the
// date cannot be read.
export function getTrainingQuarterFromDate(dateOrMonth) {
  const match = String(dateOrMonth || "").match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (!match) return null;
  const [, yearStr, monthStr] = match;
  const month = Number(monthStr);
  const fiscalYear = month <= 3 ? Number(yearStr) - 1 : Number(yearStr);
  const quarter = Math.floor(((month - 4 + 12) % 12) / 3) + 1;
  return `${fiscalYear}-Q${quarter}`;
}
