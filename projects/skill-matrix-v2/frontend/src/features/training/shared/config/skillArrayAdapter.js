import { SKILL_LEVEL_LABELS } from "./skillLevels";

// Higher level (more advanced) first, then alphabetically — a manager
// scanning an employee's skill list cares most about what they're already
// strong in, not an arbitrary domain-fetch order.
const LEVEL_SORT_ORDER = { L3: 0, L2: 1, L1: 2 };

/**
 * Flattens the nested domain → discipline → skillArea → framework tree
 * (raw hierarchy `employee.skills.skillArray` shape — see
 * getCombinedHierarchy_v2/main.py's batch_skills_sql, already filtered
 * server-side to Approved/Pre-Approved, matching `activeSkillsCount`) into
 * one flat list of individually held skills. `helper/hierarchyUtils.js`'s
 * own domain-count walk sums this same 4-level shape down to a number per
 * domain; this instead keeps every actual skill — for a caller that needs
 * to show real names (the Skills badge's hover preview), not just a count.
 * Only `name`/`level`/`levelLabel` are surfaced — the domain/discipline/
 * skill-area path each framework sits under is walked to build a stable
 * `key` but deliberately not returned, since the one current caller shows
 * name + level only (a quick hover scan, not a taxonomy browser).
 */
export function flattenSkillArray(skillArray) {
  const result = [];
  (skillArray || []).forEach((domain) => {
    const domainName = domain.domainName || "Other";
    (domain.disciplines || []).forEach((discipline) => {
      (discipline.skillAreas || []).forEach((skillArea) => {
        (skillArea.frameworks || []).forEach((framework) => {
          if (!framework.frameworkName) return;
          result.push({
            key:
              framework.id ??
              framework.skillHierarchyId ??
              `${domainName}-${discipline.disciplineName}-${skillArea.skillArea}-${framework.frameworkName}`,
            name: framework.frameworkName,
            level: framework.levelSelected,
            levelLabel: SKILL_LEVEL_LABELS[framework.levelSelected] || framework.levelSelected || "Unspecified level",
          });
        });
      });
    });
  });
  return result.sort(
    (a, b) => (LEVEL_SORT_ORDER[a.level] ?? 3) - (LEVEL_SORT_ORDER[b.level] ?? 3) || a.name.localeCompare(b.name)
  );
}
