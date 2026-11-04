// Pure aggregation helpers for the Training Analytics dashboard.

import { HOME_PROGRESS_BUCKET_CONFIG, getHomeProgressBucket } from "../../shared/config/trainingStatusBuckets";

const OTHER_LABEL = "Other";
// Categorical palette caps at 8 slots — a 9th distinct series folds into
// "Other" instead of cycling colors.
const MAX_CATEGORICAL_SLICES = 8;

// Groups records by field and counts occurrences, sorted descending; foldOthers caps at MAX_CATEGORICAL_SLICES for pie charts.
export function countByField(records, field, { foldOthers = false } = {}) {
  const counts = new Map();
  for (const record of records) {
    const key = record[field];
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const sorted = Array.from(counts.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  if (!foldOthers || sorted.length <= MAX_CATEGORICAL_SLICES) {
    return sorted;
  }

  const head = sorted.slice(0, MAX_CATEGORICAL_SLICES - 1);
  const tail = sorted.slice(MAX_CATEGORICAL_SLICES - 1);
  const otherValue = tail.reduce((sum, entry) => sum + entry.value, 0);
  return [...head, { name: OTHER_LABEL, value: otherValue }];
}

// Applies the Quarter/Area/Sub Area/Module multi-select filters; an empty array per dimension means no restriction.
export function filterRecords(records, { quarters = [], areas = [], subAreas = [], modules = [] } = {}) {
  return records.filter((record) => {
    if (quarters.length > 0 && !quarters.includes(record.training_quarter)) return false;
    if (areas.length > 0 && !areas.includes(record.area_name)) return false;
    if (subAreas.length > 0 && !subAreas.includes(record.sub_area_name)) return false;
    if (modules.length > 0 && !modules.includes(record.module_name)) return false;
    return true;
  });
}

// Distinct values for a field, sorted alphabetically, to populate a filter dropdown's option list.
export function getUniqueValues(records, field) {
  const values = new Set();
  for (const record of records) {
    if (record[field]) values.add(record[field]);
  }
  return Array.from(values).sort((a, b) => a.localeCompare(b));
}

// Maps each module_name to its Area name(s), joined with ", " on the rare module that spans more than one Area.
export function buildModuleAreaMap(records) {
  const areasByModule = new Map();
  for (const record of records) {
    if (!record.module_name || !record.area_name) continue;
    if (!areasByModule.has(record.module_name)) areasByModule.set(record.module_name, new Set());
    areasByModule.get(record.module_name).add(record.area_name);
  }

  const result = {};
  for (const [module, areas] of areasByModule) {
    result[module] = Array.from(areas).sort((a, b) => a.localeCompare(b)).join(", ");
  }
  return result;
}

// Parses a training_quarter string ("YYYY-Qn", "Qn-YYYY", or "YYYY-MM") into a sortable year+fraction, or null if unrecognized.
export function parseQuarterSortKey(value) {
  const yearThenQuarterMatch = /(\d{4})\D*Q(\d)/i.exec(value);
  if (yearThenQuarterMatch) return Number(yearThenQuarterMatch[1]) + (Number(yearThenQuarterMatch[2]) - 1) / 4;

  const quarterThenYearMatch = /Q(\d)\D*(\d{4})/i.exec(value);
  if (quarterThenYearMatch) return Number(quarterThenYearMatch[2]) + (Number(quarterThenYearMatch[1]) - 1) / 4;

  const yearMonthMatch = /^(\d{4})-(\d{1,2})$/.exec(value.trim());
  if (yearMonthMatch) return Number(yearMonthMatch[1]) + (Number(yearMonthMatch[2]) - 1) / 12;

  return null;
}

// Distinct training_quarter values sorted chronologically; unrecognized values sort last instead of being dropped.
export function getUniqueQuarters(records, desc = false) {
  const values = new Set();
  for (const record of records) {
    if (record.training_quarter) values.add(record.training_quarter);
  }

  const parsed = [];
  const unparsed = [];
  for (const value of values) {
    const key = parseQuarterSortKey(value);
    if (key === null) unparsed.push(value);
    else parsed.push({ value, key });
  }

  parsed.sort((a, b) => (desc ? b.key - a.key : a.key - b.key));
  unparsed.sort((a, b) => a.localeCompare(b));

  return [...parsed.map((p) => p.value), ...unparsed];
}

// One row per distinct batch (not per enrollment), with enrollment_count and a per-status breakdown — the canonical batch-level view other aggregations/exports build on.
export function buildBatchRows(records) {
  const batches = new Map();
  for (const record of records) {
    if (record.batch_id == null) continue;
    if (!batches.has(record.batch_id)) {
      batches.set(record.batch_id, {
        batch_id: record.batch_id,
        batch_num: record.batch_num,
        batch_desc: record.batch_desc,
        training_quarter: record.training_quarter,
        area_name: record.area_name,
        sub_area_name: record.sub_area_name,
        module_name: record.module_name,
        batch_status: record.batch_status,
        enrollment_count: 0,
        // Per-status enrollment counts within this batch.
        status_counts: Object.fromEntries(HOME_PROGRESS_BUCKET_CONFIG.map((b) => [b.key, 0])),
      });
    }
    const batch = batches.get(record.batch_id);
    batch.enrollment_count += 1;
    const bucketKey = getHomeProgressBucket(record.training_status);
    batch.status_counts[bucketKey] = (batch.status_counts[bucketKey] || 0) + 1;
  }
  return Array.from(batches.values());
}

// Distinct batch counts per quarter, broken down by Area; `areas` lists every Area seen overall so a caller can render a column even where a quarter's count is 0.
export function countDistinctBatchesByQuarter(records) {
  const countsByQuarter = new Map();
  const areas = new Set();
  for (const row of buildBatchRows(records)) {
    if (!row.training_quarter) continue;
    if (!countsByQuarter.has(row.training_quarter)) {
      countsByQuarter.set(row.training_quarter, { count: 0, byArea: {} });
    }
    const entry = countsByQuarter.get(row.training_quarter);
    entry.count += 1;
    if (row.area_name) {
      areas.add(row.area_name);
      entry.byArea[row.area_name] = (entry.byArea[row.area_name] || 0) + 1;
    }
  }

  const rows = Array.from(countsByQuarter.entries()).map(([quarter, { count, byArea }]) => ({ quarter, count, byArea }));
  rows.sort((a, b) => {
    const keyA = parseQuarterSortKey(a.quarter);
    const keyB = parseQuarterSortKey(b.quarter);
    if (keyA !== null && keyB !== null) return keyA - keyB;
    if (keyA !== null) return -1;
    if (keyB !== null) return 1;
    return a.quarter.localeCompare(b.quarter);
  });

  return { rows, areas: Array.from(areas).sort((a, b) => a.localeCompare(b)) };
}

// One row per (employee, status bucket) — feeds the status chart/stat tiles, not the Employees table (see buildEmployeeBatchRows).
export function buildEmployeeStatusRows(records) {
  const bucketLabels = new Map(HOME_PROGRESS_BUCKET_CONFIG.map((b) => [b.key, b.label]));
  const seen = new Set();
  const rows = [];

  for (const record of records) {
    if (record.employee_id == null) continue;
    const bucketKey = getHomeProgressBucket(record.training_status);
    const dedupeKey = `${record.employee_id}::${bucketKey}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    rows.push({
      employee_id: record.employee_id,
      employee_name: record.employee_name ?? null,
      employee_email: record.employee_email ?? null,
      department: record.department ?? null,
      manager_name: record.manager_name ?? null,
      status_bucket: bucketLabels.get(bucketKey) ?? bucketKey,
    });
  }

  return rows;
}

// One row per (employee, batch) enrollment — the Employees table's grain, so its per-batch fields reflect the actual batch.
export function buildEmployeeBatchRows(records) {
  const bucketLabels = new Map(HOME_PROGRESS_BUCKET_CONFIG.map((b) => [b.key, b.label]));
  const seen = new Set();
  const rows = [];

  for (const record of records) {
    if (record.employee_id == null || record.batch_id == null) continue;
    const dedupeKey = `${record.employee_id}::${record.batch_id}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const bucketKey = getHomeProgressBucket(record.training_status);
    rows.push({
      employee_id: record.employee_id,
      employee_name: record.employee_name ?? null,
      employee_email: record.employee_email ?? null,
      manager_name: record.manager_name ?? null,
      department: record.department ?? null,
      employee_type: record.employee_type ?? null,
      batch_id: record.batch_id,
      batch_num: record.batch_num ?? null,
      batch_desc: record.batch_desc ?? null,
      area_name: record.area_name ?? null,
      status_remarks: record.status_remarks ?? null,
      status_bucket: bucketLabels.get(bucketKey) ?? bucketKey,
    });
  }

  return rows;
}

// Distinct employee counts per status bucket, from buildEmployeeStatusRows' output; notCompletedCount is employees with no Completed row at all.
export function countEmployeesByTrainingStatus(rows) {
  const completedLabel = HOME_PROGRESS_BUCKET_CONFIG.find((b) => b.key === "completed")?.label;

  const countsByLabel = new Map();
  const completedEmployeeIds = new Set();
  const allEmployeeIds = new Set();

  for (const row of rows) {
    allEmployeeIds.add(row.employee_id);
    countsByLabel.set(row.status_bucket, (countsByLabel.get(row.status_bucket) || 0) + 1);
    if (row.status_bucket === completedLabel) completedEmployeeIds.add(row.employee_id);
  }

  const buckets = HOME_PROGRESS_BUCKET_CONFIG.map(({ key, label }) => ({
    key,
    label,
    count: countsByLabel.get(label) || 0,
  }));

  let notCompletedCount = 0;
  for (const employeeId of allEmployeeIds) {
    if (!completedEmployeeIds.has(employeeId)) notCompletedCount += 1;
  }

  return { buckets, totalEmployees: allEmployeeIds.size, notCompletedCount };
}

// Enrollment counts per status bucket (buildEmployeeBatchRows grain), unlike countEmployeesByTrainingStatus.
export function countEnrollmentsByTrainingStatus(rows) {
  const completedLabel = HOME_PROGRESS_BUCKET_CONFIG.find((b) => b.key === "completed")?.label;
  const countsByLabel = new Map();
  let notCompletedCount = 0;
  for (const row of rows) {
    countsByLabel.set(row.status_bucket, (countsByLabel.get(row.status_bucket) || 0) + 1);
    if (row.status_bucket !== completedLabel) notCompletedCount += 1;
  }
  const buckets = HOME_PROGRESS_BUCKET_CONFIG.map(({ key, label }) => ({ key, label, count: countsByLabel.get(label) || 0 }));
  return { buckets, totalEnrollments: rows.length, notCompletedCount };
}

// Enrollment counts per (status bucket, Area), from buildEmployeeBatchRows' output — same
// grain as countEnrollmentsByTrainingStatus/the Employees grid, no employee dedup.
export function countEnrollmentsByStatusAndArea(rows) {
  const keyByLabel = new Map(HOME_PROGRESS_BUCKET_CONFIG.map((b) => [b.label, b.key]));
  const counts = Object.fromEntries(HOME_PROGRESS_BUCKET_CONFIG.map((b) => [b.key, {}]));

  for (const row of rows) {
    if (!row.area_name) continue;
    const bucketKey = keyByLabel.get(row.status_bucket);
    counts[bucketKey][row.area_name] = (counts[bucketKey][row.area_name] || 0) + 1;
  }

  return counts;
}

// Distinct Area names ordered by area_id ascending — a stable master-data order, unlike
// sorting by record count, which would reshuffle (and repaint) as data volume changes over
// time. Areas beyond MAX_CATEGORICAL_SLICES fold into "Other" via areaOrder's last slot.
export function getAreaOrderById(records) {
  const idByArea = new Map();
  for (const record of records) {
    if (!record.area_name || record.area_id == null) continue;
    if (!idByArea.has(record.area_name)) idByArea.set(record.area_name, record.area_id);
  }

  const sorted = Array.from(idByArea.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([name]) => name);

  if (sorted.length <= MAX_CATEGORICAL_SLICES) return sorted;
  return [...sorted.slice(0, MAX_CATEGORICAL_SLICES - 1), OTHER_LABEL];
}

// One row per status bucket with one extra key per Area — grouped-bar-ready; Areas outside areaOrder fold into "Other".
export function buildEnrollmentStatusAreaGroupedData(rows, areaOrder) {
  const breakdown = countEnrollmentsByStatusAndArea(rows);
  const keptAreas = new Set(areaOrder.filter((area) => area !== OTHER_LABEL));
  const hasOtherSlot = areaOrder.includes(OTHER_LABEL);

  return HOME_PROGRESS_BUCKET_CONFIG.map(({ key, label }) => {
    const row = { key, label };
    let otherCount = 0;
    for (const [area, count] of Object.entries(breakdown[key] || {})) {
      if (keptAreas.has(area)) row[area] = count;
      else otherCount += count;
    }
    if (hasOtherSlot) row[OTHER_LABEL] = otherCount;
    return row;
  });
}
