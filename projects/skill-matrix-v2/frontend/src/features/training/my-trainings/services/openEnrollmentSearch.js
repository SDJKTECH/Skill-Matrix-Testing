import { filterBySearchQuery } from "../../shared/config/searchMatch";
import { formatDate } from "../../training-batch/services/trainingUtils";

// Fields the Open for Enrollment search box matches. Add a field here. The start date is the date printed on the card.
export const OPEN_ENROLLMENT_SEARCH_FIELDS = [
  (item) => item.moduleName,
  (item) => item.areaName,
  (item) => item.subAreaName,
  (item) => item.courseLevel,
  (item) => item.trainer,
  (item) => item.batchNum,
  (item) => item.batchStatus,
  (item) => item.trainingMode,
  (item) => item.duration,
  (item) => formatDate(item.startDate),
  (item) => item.personalStatus,
];

// Same search as the other pages, using the field list above.
export function filterOpenBatchesBySearch(items, query) {
  return filterBySearchQuery(items, query, OPEN_ENROLLMENT_SEARCH_FIELDS);
}
