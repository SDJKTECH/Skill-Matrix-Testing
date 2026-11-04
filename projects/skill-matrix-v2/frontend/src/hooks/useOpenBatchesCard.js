import { useMemo } from "react";
import useOpenEnrollmentBatches from "../features/training/my-trainings/hooks/useOpenEnrollmentBatches";
import { toOpenBatchesCardItem, sortOpenBatchesCardItems } from "../features/training/shared/config/openBatchesAdapter";

/**
 * Home Screen's "Open Batches" card data. Reuses My Trainings' own
 * useOpenEnrollmentBatches (batch filtering + this employee's personal
 * request status per batch, already correct and tested there) instead of a
 * second hand-rolled derivation, then maps to this card's row shape. Same
 * cross-feature reach into my-trainings/ that this folder's sibling
 * useOpenEnrollmentView.js already has.
 *
 * Returns BOTH `unrequestedItems` (default view — never-requested only)
 * and `allItems` (every open batch, any personal status) so the card's own
 * "Not Applied / All" toggle can switch between them with no re-fetch —
 * `totalOpenCount` is `allItems.length`, shown on the "All" toggle option
 * so it visibly matches the same total Quick Actions' "Nominate for
 * Training" badge already counts.
 *
 * @param {{ batches: object[], myTrainings: object[] }} args
 */
export default function useOpenBatchesCard({ batches, myTrainings }) {
  const { items } = useOpenEnrollmentBatches({ batches, myTrainings, searchQuery: "" });
  return useMemo(() => {
    const allItems = sortOpenBatchesCardItems(items.map(toOpenBatchesCardItem));
    return {
      unrequestedItems: allItems.filter((item) => item.isUnrequested),
      allItems,
      totalOpenCount: allItems.length,
    };
  }, [items]);
}
