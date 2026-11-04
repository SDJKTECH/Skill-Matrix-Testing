/**
 * Canonical L1/L2/L3 → human label mapping. Single source of truth — was
 * previously only defined locally inside
 * manager-dashboard/components/SkillLevelDistributionCard.jsx (which still
 * owns its own bar colors; those stay presentation-only and local to that
 * card, only the label text moved here for reuse by the Skills badge's
 * hover preview in EmployeeRow.jsx).
 */
export const SKILL_LEVEL_LABELS = { L1: "Beginner", L2: "Intermediate", L3: "Advanced" };
