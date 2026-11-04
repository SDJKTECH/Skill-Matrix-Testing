/** First-level-only reportees (direct reports), no recursion into their own associates. */
export function getDirectReportsFromHierarchy(node) {
  if (!node || typeof node !== "object") return [];
  const associates = node.associates || {};
  return Object.keys(associates)
    .filter((k) => k.startsWith("associateArray"))
    .map((k) => associates[k])
    .filter(Array.isArray)
    .flat();
}

/**
 * Finds the node for `employeeId` anywhere in the tree rooted at `node`
 * (matches the root itself too) — the foundation for the Manager
 * Dashboard's hierarchy drill-down (row -> that person's own sub-team).
 * No network call: the whole tree a manager can see is already resident
 * client-side from the one get_combined_hierarchy_v2 fetch, so drilling is
 * instant. Once found, the match IS a fully valid subtree root — every
 * other function in this file (getDirectReportsFromHierarchy,
 * flattenTeamFromHierarchy, computeStatsFromTeam-based stats) can be
 * called on it directly, no new traversal logic needed beyond this lookup.
 */
export function findNodeById(node, employeeId) {
  if (!node || typeof node !== "object") return null;
  if (String(node.id) === String(employeeId)) return node;
  for (const reportee of getDirectReportsFromHierarchy(node)) {
    const match = findNodeById(reportee, employeeId);
    if (match) return match;
  }
  return null;
}

/** Flatten hierarchy tree into list of all reportee nodes (excluding root manager). */
export function flattenTeamFromHierarchy(node) {
  if (!node || typeof node !== "object") return [];
  const list = [];
  const associates = node.associates || {};
  const associateArrays = Object.keys(associates)
    .filter((k) => k.startsWith("associateArray"))
    .map((k) => associates[k])
    .filter(Array.isArray);
  for (const arr of associateArrays) {
    for (const child of arr) {
      list.push(child);
      list.push(...flattenTeamFromHierarchy(child));
    }
  }
  return list;
}

/**
 * Same walk as flattenTeamFromHierarchy, but each reportee is annotated
 * with `managerGroup` — "<name>'s team" for every reportee, where <name> is
 * whoever they report to directly (the currently-viewed root manager for
 * their own direct reports, or the relevant nested manager otherwise). No
 * special-cased generic label for the root's own direct reports — a fixed
 * "Direct report" string sitting next to the Manager Dashboard's own
 * "Direct Reports" scope toggle read as a confusing echo of it, so every
 * group now uses the same "<name>'s team" shape regardless of depth.
 * Powers the Team Alerts detail views' "grouped by manager/team"
 * presentation — every alert's affected-employee/-record list groups under
 * these labels so a manager can see where an issue is organizationally
 * concentrated, not just who's affected.
 */
function flattenTeamWithManagerContext(node, managerGroup = `${node?.name || "Unknown"}'s team`) {
  if (!node || typeof node !== "object") return [];
  const list = [];
  for (const child of getDirectReportsFromHierarchy(node)) {
    list.push({ ...child, managerGroup });
    list.push(...flattenTeamWithManagerContext(child, `${child.name || "Unknown"}'s team`));
  }
  return list;
}

/**
 * Shared aggregation core behind both getManagerStatsFromHierarchy (team =
 * every reportee, recursive) and getDirectReportStatsFromHierarchy (team =
 * immediate reports only) — one implementation, two entry points, so the
 * Manager Dashboard's "Direct" vs "Entire Team" scope toggle can switch
 * between them without duplicating this whole walk. Also exported directly
 * for callers that need stats for an arbitrary ALREADY-filtered team subset
 * (e.g. ManagerDashboard.jsx recomputing the KPI row for whatever
 * search/status filter is currently narrowing the visible employee list, or
 * for a drilled-into sub-team).
 *
 * Totals are always a raw sum of each member's own counts. Previously
 * "entire team" scope substituted the backend's deduplicated
 * reportee_summary totals instead — but that summary only ever covered the
 * FULL fetched tree, so both "direct reports" scope and any drilled-into
 * sub-team fell back to the raw sum anyway, and a team could show a SMALLER
 * "Total Skills" than one of its own subsets purely from which of the two
 * methods happened to run. Always summing locally keeps the number
 * consistent across every scope and drill position.
 */
export function computeStatsFromTeam(team, hierarchyData) {
  const teamMembers = team.length;
  let totalSkills = 0;
  let totalCertifications = 0;
  let totalTrainings = 0;
  const domainCounts = {};
  let l1 = 0, l2 = 0, l3 = 0;
  const employeesWithCounts = [];
  let noCertCount = 0, noTrainingCount = 0, noSkillsCount = 0;
  let undergoingTrainingCount = 0;
  const noCertEmployees = [];
  const noSkillsEmployees = [];
  const noTrainingEmployees = [];
  const undergoingTrainingRecords = [];

  for (const emp of team) {
    const skills = emp.skills || {};
    const certs = emp.certifications || {};
    const trainings = emp.trainings || {};
    const activeSkills = skills.activeSkillsCount ?? 0;
    const certCount = certs.certificationCount ?? (certs.certificationArray?.length ?? 0);
    const trainingCount = trainings.trainingCount ?? (trainings.trainingArray?.length ?? 0);

    totalSkills += activeSkills;
    totalCertifications += certCount;
    totalTrainings += trainingCount;
    l1 += skills.l1Count ?? 0;
    l2 += skills.l2Count ?? 0;
    l3 += skills.l3Count ?? 0;

    employeesWithCounts.push({
      id: emp.id,
      name: emp.name || "Unknown",
      role: emp.role || "Employee",
      empId: emp.empId,
      skillCount: activeSkills,
      certCount,
      trainingCount,
    });

    // Every reportee already carries `managerGroup` when the caller flattened
    // via flattenTeamWithManagerContext (both entry points below now do) —
    // this is the safe fallback for anything that doesn't (there is none
    // today, but this keeps the function from producing an undefined group
    // label if it's ever called on a plain, untagged team).
    const managerGroup = emp.managerGroup || `${hierarchyData?.name || "Unknown"}'s team`;

    // `trainings: trainingArray` below is raw/unfiltered, same precedent as
    // undergoingTrainingRecords further down — this file only ever imports
    // from helper/, never component/ (see trainingProgressAggregation.js's
    // note on import direction), so the seed/QA-fixture filter and
    // normalizeTrainingRecord (both in component/training-progress/) can't
    // be applied here; the caller (TeamTrainingStatusCard.jsx) applies them
    // when it turns these into a training-status breakdown.
    const rawTrainingArray = trainings.trainingArray || [];
    if (certCount === 0) {
      noCertCount += 1;
      noCertEmployees.push({ id: emp.id, name: emp.name || "Unknown", role: emp.role || "Employee", managerGroup, trainings: rawTrainingArray });
    }
    if (trainingCount === 0) {
      noTrainingCount += 1;
      noTrainingEmployees.push({ id: emp.id, name: emp.name || "Unknown", role: emp.role || "Employee", managerGroup, trainings: rawTrainingArray });
    }
    if (activeSkills === 0) {
      noSkillsCount += 1;
      noSkillsEmployees.push({ id: emp.id, name: emp.name || "Unknown", role: emp.role || "Employee", managerGroup, trainings: rawTrainingArray });
    }

    const trainingArray = trainings.trainingArray || [];
    const inProgressTrainings = trainingArray.filter((t) => (t.trainingStatus || "").toLowerCase() === "in progress");
    if (inProgressTrainings.length > 0) {
      undergoingTrainingCount += 1;
      // Raw records, NOT normalized/filtered here — this file only ever
      // imports from helper/, never from component/ (see
      // trainingProgressAggregation.js's own note on import direction), so
      // the seed-data filter and normalizeTrainingRecord (both living in
      // component/training-progress/) are applied by the caller
      // (ManagerDashboard.jsx) once it turns these into cards.
      for (const t of inProgressTrainings) {
        undergoingTrainingRecords.push({ ...t, employeeName: emp.name || "Unknown", employeeId: emp.id, managerGroup });
      }
    }
  }

  for (const emp of team) {
    const skillArray = emp.skills?.skillArray || [];
    for (const domain of skillArray) {
      const name = domain.domainName || "Other";
      let count = 0;
      (domain.disciplines || []).forEach((d) => {
        (d.skillAreas || []).forEach((sa) => {
          count += (sa.frameworks || []).length;
        });
      });
      if (count > 0) domainCounts[name] = (domainCounts[name] || 0) + count;
    }
  }

  const topDomains = Object.entries(domainCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  const topSkilledEmployees = [...employeesWithCounts]
    .sort((a, b) => b.skillCount - a.skillCount)
    .slice(0, 5);

  return {
    teamMembers,
    totalSkills,
    totalCertifications,
    totalTrainings,
    topDomains,
    skillLevelDistribution: { L1: l1, L2: l2, L3: l3 },
    topSkilledEmployees,
    alerts: {
      noCertifications: noCertCount,
      // Detail behind every alert — TeamAlertsCard.jsx's rows all reveal
      // inline (in TeamTrainingStatusCard.jsx) rather than jumping the
      // manager off the dashboard: the three "absence" alerts
      // (noCertifications/noTrainings/noSkills) reveal the affected
      // EMPLOYEE list, since there's no concrete per-person record to show
      // for something someone doesn't have. associatesUndergoingTraining
      // is the one alert backed by real records (actual in-progress
      // trainings), so it reveals those as TRAINING CARDS instead —
      // clicking a specific card is what navigates to that training's
      // batch page, not the alert row itself.
      noCertificationsEmployees: noCertEmployees,
      noTrainings: noTrainingCount,
      noTrainingsEmployees: noTrainingEmployees,
      noSkills: noSkillsCount,
      noSkillsEmployees: noSkillsEmployees,
      associatesUndergoingTraining: undergoingTrainingCount,
      associatesUndergoingTrainingRecords: undergoingTrainingRecords,
    },
  };
}

/**
 * The same "team" (with managerGroup attached) computeStatsFromTeam's two
 * entry points below already build internally — exposed directly for
 * callers that need every team member for a scope, not just aggregated
 * stats or an alert's flagged subset (e.g. rendering the full team with
 * some rows highlighted, see ManagerDashboard.jsx's alert-highlight flow).
 */
export function getScopedTeamFromHierarchy(hierarchyData, scope = "direct") {
  // Every entry here IS a direct report by definition (scope has no
  // recursion), so managerGroup is trivially "<root manager>'s team" for
  // all of them — no need for the recursive walk flattenTeamWithManagerContext
  // does. Not that this ever renders as a visible group header today (a
  // single group never shows one — see TeamTrainingStatusCard.jsx), but
  // kept consistent with flattenTeamWithManagerContext's labeling rather
  // than a separate hardcoded string.
  const rootManagerGroup = `${hierarchyData?.name || "Unknown"}'s team`;
  return scope === "all"
    ? flattenTeamWithManagerContext(hierarchyData)
    : getDirectReportsFromHierarchy(hierarchyData).map((emp) => ({ ...emp, managerGroup: rootManagerGroup }));
}

/** Aggregate manager dashboard stats from hierarchy (team = every reportee, recursive). */
export function getManagerStatsFromHierarchy(hierarchyData) {
  return computeStatsFromTeam(getScopedTeamFromHierarchy(hierarchyData, "all"), hierarchyData);
}

/** Same stats, scoped to the manager's DIRECT reports only (no recursion). */
export function getDirectReportStatsFromHierarchy(hierarchyData) {
  return computeStatsFromTeam(getScopedTeamFromHierarchy(hierarchyData, "direct"), hierarchyData);
}

