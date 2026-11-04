// Generic "first non-nullish, non-empty-string value across candidate keys"
// helper — used by every record normalizer/search-field config that reads
// the same logical field under multiple possible raw API key spellings
// (camelCase vs snake_case, legacy vs current name). Previously hand-
// duplicated identically in trainingRecordAdapter.jsx, certRecordAdapter.jsx,
// and myTrainingsQuery.js — promoted here once a third copy appeared, same
// "shared once 2+ consumers need it" convention the rest of shared/ follows.
export function firstDefined(record, ...keys) {
  return keys.map((k) => record?.[k]).find((v) => v !== undefined && v !== null && v !== "");
}
