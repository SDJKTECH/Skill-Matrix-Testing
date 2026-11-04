// Names of every action on the Training Batch page that changes data.
// Kept in its own file so batchPermissions.js and batchViewOrigin.js can
// both use it without importing each other.
export const BATCH_ACTIONS = {
  CREATE_BATCH: "createBatch",
  EDIT_BATCH: "editBatch",
  DELETE_BATCH: "deleteBatch",
  ADD_ENROLLMENT: "addEnrollment",
  EDIT_ENROLLMENT: "editEnrollment",
  DELETE_ENROLLMENT: "deleteEnrollment",
  ADD_NOTE: "addNote",
  // See every employee's enrollment, not just your own. This is checked only
  // in the frontend for now; the backend still sends all rows.
  VIEW_ALL_ENROLLMENTS: "viewAllEnrollments",
};
