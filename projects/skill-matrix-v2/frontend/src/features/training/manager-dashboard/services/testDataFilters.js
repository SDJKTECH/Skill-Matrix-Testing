// Naming convention for identifying seed/QA fixture data that must NEVER
// reach a manager-facing (or any production-facing) view — the shared dev
// DB (skill_matrix_v2_qa) accumulates this from two different sources and
// this file is the one place both get recognized, so a future list built
// off training/cert records doesn't have to reinvent the check:
//
//   1. Systematically-tagged bulk seed data — dev-tools/ad-hoc/
//      insert_dummy_training_data.py's --bulk mode prefixes every
//      area/sub-area/module name it creates with "DUMMY_QA_" (e.g.
//      "DUMMY_QA_Module_1"). Checked as a case-insensitive PREFIX match.
//   2. Ad-hoc placeholder names typed directly during manual QA (e.g.
//      literally "Test", "Sample") — no systematic tag, so these are
//      caught by an EXACT match against the full (trimmed, casefolded)
//      name. Deliberately NOT a substring match: substring matching would
//      silently drop real training topics that legitimately contain these
//      words (e.g. "Penetration Testing", "A/B Testing Fundamentals",
//      "Sample-Based Statistics") — a false positive there is worse than
//      an unmatched piece of ad-hoc fixture data slipping through.
//
// New seed/fixture data should follow one of these two conventions (tag
// bulk-generated names with SEED_TAG_PREFIX, or add a one-off placeholder
// name to PLACEHOLDER_NAMES here) rather than inventing a third pattern —
// that's what keeps this the single, reliable place every manager-facing
// list can filter against.
const SEED_TAG_PREFIX = "DUMMY_QA_";
const PLACEHOLDER_NAMES = new Set(["test", "sample", "placeholder", "tbd", "todo", "demo", "dummy", "n/a", "na", "example"]);

export function isTestOrPlaceholderName(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return false;
  if (trimmed.toUpperCase().startsWith(SEED_TAG_PREFIX)) return true;
  return PLACEHOLDER_NAMES.has(trimmed.toLowerCase());
}

/**
 * True if a normalized training or certification record should never
 * render in a manager-facing view — checks every human-readable name field
 * a record can carry (module/area name for trainings, cert name/provider
 * for certifications), since seed data can land on any of them.
 */
export function isTestOrPlaceholderRecord(record) {
  return (
    isTestOrPlaceholderName(record?.moduleName) ||
    isTestOrPlaceholderName(record?.areaName) ||
    isTestOrPlaceholderName(record?.certName) ||
    isTestOrPlaceholderName(record?.certProvider)
  );
}
