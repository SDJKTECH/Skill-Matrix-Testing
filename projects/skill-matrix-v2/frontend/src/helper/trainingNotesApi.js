// API calls for training batch notes. Notes are saved by the backend
// manage_comments_v2 function. Its field names are changed below to the
// names BatchNotesPanel uses (e.g. commentText -> note_text).
import axios from "axios";
import { BASE_URL } from "../config/apiConfig";

const COMMENTS_URL = `${BASE_URL}manage_comments_v2`;

/**
 * Get all notes of a batch, newest first (the backend sorts them).
 * @param {number} batchId
 * @returns {Promise<Array<{ id, batch_id, author_id, author_role, author_name, author_department, note_text, created_at }>>}
 */
export const fetchBatchNotes = async (batchId) => {
  const response = await axios.get(COMMENTS_URL, { params: { batch_id: batchId } });
  const results = response.data?.results ?? [];
  return results.map((r) => ({
    id: r.commentId,
    batch_id: r.batchId,
    author_id: r.commentedById,
    author_role: r.commentType,
    author_name: r.commentedByName,
    author_department: r.commentedByDepartment,
    note_text: r.commentText,
    created_at: r.commentedAt,
  }));
};

/**
 * Add a note to a batch. The backend sets comment_type from the writer's role;
 * the frontend cannot choose it.
 * @param {{ batch_id: number, author_id: number, note_text: string }} payload
 * @returns {Promise<Object>} the created note, in the same shape as fetchBatchNotes' entries
 */
export const createBatchNote = async ({ batch_id, author_id, note_text }) => {
  const response = await axios.post(
    COMMENTS_URL,
    { commentBy: author_id, entityId: batch_id, entityType: "batch", comment: note_text },
    { headers: { "Content-Type": "application/json" } }
  );
  const data = response.data;
  return {
    id: data.commentId,
    batch_id: data.entityId,
    author_id: data.commentBy,
    author_role: data.commentType,
    note_text, // the API does not send the text back, so use the text we just sent
    created_at: data.commentedAt,
  };
};
