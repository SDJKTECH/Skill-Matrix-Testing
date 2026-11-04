import { bucketTrainings, getTrainingStatus } from "../../shared/config/trainingStatusBuckets";
import { ALL_YEARS, filterTrainingsByYear } from "../../shared/config/trainingYearFilter";
import { normalizeTrainingRecord, mergeBatchDetails } from "../../shared/config/trainingRecordAdapter";
import { filterBySearchQuery } from "../../shared/config/searchMatch";
import { firstDefined as firstOf } from "../../shared/config/firstDefined";

// Fields the My Trainings search box matches. Add a field here. These read the raw record, before it is normalized.
export const TRAINING_SEARCH_FIELDS = [
  (t) => firstOf(t, "moduleName", "module_name", "module", "name", "Name"),
  (t) => firstOf(t, "areaName", "area_name", "area"),
  (t) => firstOf(t, "subAreaName", "sub_area_name", "subArea"),
  (t) => firstOf(t, "courseLevel", "course_level"),
  (t) => getTrainingStatus(t),
  (t) => firstOf(t, "batch", "batch_num", "batch_id"),
  (t) => firstOf(t, "startDate", "start_date"),
  (t) => firstOf(t, "endDate", "end_date"),
  (t) => firstOf(t, "trainer"),
  (t) => firstOf(t, "training_mode", "trainingMode"),
  (t) => firstOf(t, "training_quarter", "trainingQuarter"),
  (t) => firstOf(t, "nominatedBy", "nominated_by"),
  (t) => firstOf(t, "reviewedByName", "reviewed_by_name"),
  (t) => firstOf(t, "statusRemarks", "status_remarks"),
  (t) => firstOf(t, "employeeComment", "employee_comment"),
  (t) => firstOf(t, "managerComment", "manager_comment"),
  (t) => firstOf(t, "departmentComment", "department_comment"),
  (t) => firstOf(t, "employeeType", "employee_type"),
];

export const CARDS_PER_PAGE = 6;

// Separate from CARDS_PER_PAGE so this page can show one row without changing My Trainings.
export const OPEN_ENROLLMENT_PAGE_SIZE = 4;

/** Maps UI bucket tabs to a single backend `status` query param when possible. */
const BUCKET_STATUS_PARAM = {
  completed: "Completed",
  inProgress: "In Progress",
};

// Query params for GET /add_training_v2. The backend ignores most of them, so the list is filtered again below.
export function buildMyTrainingsQuery({
  employeeId,
  search,
  selectedYear,
  activeBucket,
  advFilters,
  page,
  pageSize,
  useServerPagination,
}) {
  const params = { employee_id: employeeId };
  const q = search.trim();
  if (q) params.q = q;

  // The backend ignores these dates. The year filter is applied again in applyClientPostFilters.
  if (selectedYear !== ALL_YEARS && selectedYear != null) {
    params.start_from = `${selectedYear}-01-01`;
    params.start_to = `${selectedYear}-12-31`;
  }

  if (advFilters.status.length === 1) {
    params.status = advFilters.status[0];
  } else if (!advFilters.status.length && BUCKET_STATUS_PARAM[activeBucket]) {
    params.status = BUCKET_STATUS_PARAM[activeBucket];
  }

  if (advFilters.mode.length === 1) {
    params.mode = advFilters.mode[0];
  }

  if (useServerPagination) {
    params.page = page;
    params.page_size = pageSize;
  }

  return params;
}

export function needsClientPostFilter(activeBucket, advFilters, selectedYear, search = "") {
  return (
    // The backend ignores status, so every tab except All is filtered here.
    activeBucket !== "assigned" ||
    advFilters.status.length > 0 ||
    advFilters.mode.length > 0 ||
    // Quarter has no server param, so any selection is filtered here.
    advFilters.quarter.length > 0 ||
    (selectedYear !== ALL_YEARS && selectedYear != null) ||
    // The backend ignores q, so search is filtered here or the list never narrows.
    Boolean(String(search || "").trim())
  );
}

export function applyClientPostFilters(trainings, { activeBucket, advFilters, selectedYear, search = "" }) {
  let list = trainings;
  // Year first, then the status tab, so a training outside the year cannot land in a tab.
  if (selectedYear !== ALL_YEARS && selectedYear != null) {
    list = filterTrainingsByYear(list, selectedYear);
  }
  // Same status groups as the tab badges, not a second comparison.
  if (activeBucket !== "assigned") {
    list = bucketTrainings(list)[activeBucket] || [];
  }
  if (advFilters.status.length > 0) {
    list = list.filter((t) => advFilters.status.includes(getTrainingStatus(t)));
  }
  if (advFilters.mode.length > 0) {
    list = list.filter((t) => {
      const mode = t.training_mode || t.trainingMode || "";
      return advFilters.mode.includes(mode);
    });
  }
  if (advFilters.quarter.length > 0) {
    list = list.filter((t) => advFilters.quarter.includes(t.training_quarter || t.trainingQuarter || ""));
  }
  // Search runs last, so it narrows the filters above instead of replacing them.
  list = filterBySearchQuery(list, search, TRAINING_SEARCH_FIELDS);
  return list;
}

/** Sort is not a backend query param — applied client-side on the current result set. */
export function sortMyTrainings(trainings, sortBy) {
  const sorted = [...trainings];
  if (sortBy === "oldest") sorted.sort((a, b) => new Date(a.startDate || a.start_date || 0) - new Date(b.startDate || b.start_date || 0));
  else if (sortBy === "az") sorted.sort((a, b) => String(a.moduleName || a.module_name || "").localeCompare(String(b.moduleName || b.module_name || "")));
  else sorted.sort((a, b) => new Date(b.startDate || b.start_date || 0) - new Date(a.startDate || a.start_date || 0));
  return sorted;
}

export function paginateClient(trainings, page, pageSize) {
  const total = trainings.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    page: safePage,
    totalPages,
    total,
    items: trainings.slice(start, start + pageSize),
  };
}

// Turns the raw training list into the page the panel shows. Trainer, duration, mode, and batch size are joined on first, or search and the cards see them as empty.
export function processTrainingsResponse(results, { clientPostFilter, activeBucket, advFilters, selectedYear, search = "", sortBy, currentPage, batchByNum }) {
  let list = (results || []).map((t) => mergeBatchDetails(t, batchByNum));
  if (clientPostFilter) {
    list = applyClientPostFilters(list, { activeBucket, advFilters, selectedYear, search });
    list = sortMyTrainings(list, sortBy);
    const paged = paginateClient(list, currentPage, CARDS_PER_PAGE);
    return {
      trainings: paged.items.map((t) => normalizeTrainingRecord(t)),
      total: paged.total,
      totalPages: paged.totalPages,
      page: paged.page,
      hasMore: false,
      // Every matching id, all pages, so next/prev can open the right page.
      allIds: list.map((t) => firstOf(t, "employeeTrainingId", "employee_training_id", "id") ?? null),
    };
  }
  list = sortMyTrainings(list, sortBy);
  const pageCount = list.length;
  const knownTotal = (currentPage - 1) * CARDS_PER_PAGE + pageCount;
  return {
    trainings: list.map((t) => normalizeTrainingRecord(t)),
    total: knownTotal,
    totalPages: pageCount === CARDS_PER_PAGE ? currentPage + 1 : currentPage,
    page: currentPage,
    hasMore: pageCount === CARDS_PER_PAGE,
    allIds: [],
  };
}
