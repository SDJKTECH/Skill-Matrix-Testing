import { useMemo } from "react";
import { isBatchOpenForEnrollment } from "../../shared/config/batchStatusColors";
import { isNewBatch } from "../services/batchNewIndicator";
import { filterOpenBatchesBySearch } from "../services/openEnrollmentSearch";
import { getRequestActionForStatus, getSeatsAvailable } from "../services/batchCardAdapter";
import { firstDefined } from "../../shared/config/firstDefined";

function compareByStartDate(a, b) {
  const aTime = new Date(a.startDate || 0).getTime() || Infinity;
  const bTime = new Date(b.startDate || 0).getTime() || Infinity;
  const byStart = aTime - bTime;
  if (byStart) return byStart;
  return String(a.moduleName || "").localeCompare(String(b.moduleName || ""));
}

/**
 * Turns batches the page already loaded into the Open for Enrollment cards.
 * It does not fetch again, so the title count and the cards stay the same list.
 * Cards are ordered by start date, earliest first. A missing date goes last.
 * `count` is that list after search. `actionableCount` is how many of those
 * the employee can still request.
 */
export default function useOpenEnrollmentBatches({ batches, myTrainings, searchQuery }) {
  const statusFor = useMemo(() => {
    const map = new Map();
    for (const request of myTrainings || []) {
      // The API uses batch_num or batch_id depending on the call, so check both.
      const key = String(firstDefined(request, "batch_num", "batchNum", "batch_id", "batchId") ?? "");
      if (!key) continue;
      map.set(key, request.training_status || request.trainingStatus || null);
    }
    return (batchNum) => map.get(String(batchNum)) ?? null;
  }, [myTrainings]);

  const items = useMemo(() => {
    // One card per batch number. A repeated row would show the same batch twice.
    const seenBatchNums = new Set();
    const openBatches = (batches || [])
      .filter(isBatchOpenForEnrollment)
      .filter((batch) => {
        const key = String(batch.batch_num || batch.batchNum || "");
        if (!key) return true; // keep a batch that has no number
        if (seenBatchNums.has(key)) return false;
        seenBatchNums.add(key);
        return true;
      })
      .map((batch) => {
        const batchNum = batch.batch_num || batch.batchNum;
        const personalStatus = statusFor(batchNum);
        return {
          batchNum,
          moduleName: batch.module_name || batch.moduleName || batch.module || "Training",
          areaName: batch.area_name || batch.areaName || null,
          subAreaName: batch.sub_area_name || batch.subAreaName || null,
          courseLevel: batch.course_level || batch.courseLevel || null,
          trainer: batch.trainer || null,
          batchStatus: batch.batch_status || batch.batchStatus || null,
          batchSize: batch.batch_size ?? batch.batchSize ?? null,
          seatsAvailable: getSeatsAvailable(batch, personalStatus),
          // Duration and mode live on the batch, not on the employee's own row.
          duration: batch.duration || null,
          trainingMode: batch.training_mode || batch.trainingMode || null,
          startDate: batch.start_date || batch.startDate || null,
          createdAt: batch.created_at || batch.createdAt || null,
          updatedAt: batch.updated_at || batch.updatedAt || null,
          isNew: isNewBatch(batch),
          personalStatus,
        };
      })
      .sort(compareByStartDate);

    return filterOpenBatchesBySearch(openBatches, searchQuery);
  }, [batches, statusFor, searchQuery]);

  const actionableCount = useMemo(
    () => items.filter((item) => getRequestActionForStatus(item.personalStatus, item.seatsAvailable).interactive).length,
    [items]
  );

  return { items, count: items.length, actionableCount };
}
