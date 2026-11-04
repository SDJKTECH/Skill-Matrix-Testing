import React from "react";
import { FiBarChart2 } from "react-icons/fi";
import BarListRow from "./BarListRow";
import { SKILL_LEVEL_LABELS } from "../../shared/config/skillLevels";

const LEVEL_BAR_COLORS = { L1: "#93c5fd", L2: "#99f6e4", L3: "#ddd6fe" };

/**
 * "Skill Level Distribution" card. Fixes a real overflow bug from the
 * previous inline version: the level-label span is `w-28 shrink-0` (e.g.
 * "L2 Intermediate") but was missing `truncate` — unlike this card's
 * sibling (Top Skill Domains), which already truncates its own row label.
 * `title=` gives the full text an accessible fallback for whenever it does
 * clip.
 *
 * Props: { distribution: { L1, L2, L3 } }
 */
export default function SkillLevelDistributionCard({ distribution }) {
  const maxLevel = Math.max(distribution.L1 ?? 0, distribution.L2 ?? 0, distribution.L3 ?? 0, 1);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-2.5 flex flex-col cursor-default">
      <div className="flex items-center gap-1.5 mb-2 shrink-0">
        <FiBarChart2 className="h-3.5 w-3.5 text-violet-500 shrink-0" />
        <h2 className="text-xs font-semibold text-gray-900 dark:text-white">Skill Level Distribution</h2>
      </div>
      <div className="space-y-1.5">
        {["L1", "L2", "L3"].map((level) => {
          const count = distribution[level] ?? 0;
          const fullLabel = `${level} ${SKILL_LEVEL_LABELS[level]}`;
          return (
            <BarListRow
              key={level}
              label={fullLabel}
              value={count.toLocaleString()}
              widthPercent={(count / maxLevel) * 100}
              color={LEVEL_BAR_COLORS[level]}
              labelClassName="w-24"
              valueClassName="w-8"
            />
          );
        })}
      </div>
    </div>
  );
}
