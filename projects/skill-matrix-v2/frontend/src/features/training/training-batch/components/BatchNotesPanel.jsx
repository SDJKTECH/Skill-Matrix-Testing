import React, { useState, useEffect, useCallback, useRef } from "react";
import { FiChevronRight, FiPlus } from "react-icons/fi";
import toast from "react-hot-toast";
import { useAuth } from "../../../../hooks/useAuth";
import { getCurrentEmployeeId } from "../../../../helper/accessRoles";
import { fetchBatchNotes, createBatchNote } from "../../../../helper/trainingNotesApi";
import Collapse from "../../shared/components/Collapse";
import linkifyText from "../services/linkifyText";

// Turns a note time into short text like "5m ago" or "2d ago".
// Notes older than 7 days show the full date.
function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function initials(name) {
  const parts = (name || "").trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

// Circle color for each kind of note writer, so you can see who wrote a note
// without reading the name. "you" = the logged-in user's own notes. Any
// other role not listed here gets gray.
const NOTE_AUTHOR_COLORS = {
  you: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  manager: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  department: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  employee: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
};
const NOTE_AUTHOR_FALLBACK_COLOR = "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300";

/* ── Notes — third section of an expanded batch row ───────────────────────────
   Users can read and add notes (no edit or delete; the backend does not
   support them). Notes are saved through trainingNotesApi.js.
   Each note shows "You" for your own notes, else the writer's name (and
   department), or only their role if the name is not found.
   This section opens and closes by itself; it only needs batchId, and
   isExpanded to close it again when the batch row closes. */
export default function BatchNotesPanel({ batchId, isExpanded }) {
  const { user } = useAuth();
  const currentUserId = getCurrentEmployeeId(user);

  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const hasFetchedRef = useRef(false);

  const [addOpen, setAddOpen] = useState(false); // is the "+ Add Note" box open
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  // The row stays on the page after it is closed, so close Notes too.
  // Otherwise it would still be open the next time the batch is opened.
  useEffect(() => {
    if (!isExpanded) { setOpen(false); setAddOpen(false); }
  }, [isExpanded]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setNotes(await fetchBatchNotes(batchId));
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
      hasFetchedRef.current = true;
    }
  }, [batchId]);

  // Load the notes only once, the first time the section is opened.
  useEffect(() => {
    if (open && !hasFetchedRef.current) load();
  }, [open, load]);

  const handleAdd = async () => {
    const note_text = text.trim();
    if (!note_text || saving) return;
    setSaving(true);
    try {
      const created = await createBatchNote({
        batch_id: batchId,
        author_id: currentUserId,
        note_text,
      });
      setNotes((prev) => [created, ...prev]);
      setText("");
      setAddOpen(false);
    } catch {
      toast.error("Failed to save note — please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {/* Header, same style as the other two sections. The note count shows
          only after the notes are loaded once. */}
      <div
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((v) => !v); } }}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        className="group flex items-center justify-between gap-2 -mx-1.5 px-1.5 py-1 rounded-md cursor-pointer hover:bg-blue-50/70 dark:hover:bg-blue-900/10 transition-colors"
      >
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
          <FiChevronRight className={`h-3 w-3 transition-transform duration-150 ${open ? "rotate-90 text-blue-500 dark:text-blue-400" : ""}`} />
          Notes{notes.length > 0 ? ` (${notes.length})` : ""}
        </span>
        {open && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setAddOpen((v) => !v); }}
            aria-expanded={addOpen}
            title="Add a note about this batch"
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
          >
            <FiPlus className="h-3 w-3" />
            Add Note
          </button>
        )}
      </div>

      <Collapse open={open}>
        <div className="mt-1.5 space-y-3">
          {/* Box to write a note; hidden until "+ Add Note" is clicked. */}
          {addOpen && (
            <div>
              <textarea
                rows={2}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); handleAdd(); }
                  else if (e.key === "Escape") { setAddOpen(false); setText(""); }
                }}
                placeholder="Add a note about this batch…"
                aria-label="Add a note"
                autoFocus
                className="w-full px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-blue-400 dark:focus:border-blue-500 resize-none"
              />
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[10px] text-gray-400 dark:text-gray-500">Ctrl+Enter to save</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setAddOpen(false); setText(""); }} disabled={saving} className="text-xs text-gray-500 dark:text-gray-400 hover:underline disabled:opacity-50">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAdd}
                    disabled={!text.trim() || saving}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {saving && (
                      <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                    )}
                    {saving ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-xs text-gray-400 dark:text-gray-500 py-3 flex items-center gap-1.5">
              <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              Loading notes…
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center justify-center gap-1.5 py-4 text-center text-xs">
              <p className="text-gray-500 dark:text-gray-400">Couldn't load notes.</p>
              <button type="button" onClick={load} className="text-blue-600 dark:text-blue-400 hover:underline">
                Retry
              </button>
            </div>
          ) : notes.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-3">No notes yet.</p>
          ) : (
            // The list has its own scrollbar (max 450px tall), because the page's own
            // scrollbar is hidden and users would not know they can scroll.
            <div className="space-y-2 max-h-[450px] overflow-y-auto">
              {notes.map((n) => {
                // Compare as text, so the number 5 and the text "5" both match. If no user
                // is logged in, no note is marked as "own".
                const isOwnNote = currentUserId != null && String(n.author_id) === String(currentUserId);
                // "You" for your own notes; else the writer's name; else their role if the
                // name is not found (e.g. the employee was removed).
                const authorLabel = isOwnNote ? "You" : (n.author_name || n.author_role || "Unknown");
                const avatarColor = NOTE_AUTHOR_COLORS[isOwnNote ? "you" : (n.author_role || "").toLowerCase()] || NOTE_AUTHOR_FALLBACK_COLOR;
                const exactTime = new Date(n.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
                return (
                  // Your own notes get a light background, so you can find them quickly.
                  // No negative margin here: it would make the list scroll sideways.
                  <div key={n.id} className={`flex gap-2 items-start rounded-lg px-2 py-1.5 ${isOwnNote ? "bg-blue-50/60 dark:bg-blue-900/10" : ""}`}>
                    <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold ${avatarColor}`}>
                      {initials(isOwnNote ? user?.displayName : authorLabel)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="font-medium text-gray-900 dark:text-gray-100">{authorLabel}</span>
                        {!isOwnNote && n.author_department && (
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">{n.author_department}</span>
                        )}
                        <span className="text-gray-400 dark:text-gray-500" title={exactTime}>· {timeAgo(n.created_at)}</span>
                      </div>
                      <p className="mt-0.5 text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap break-words">{linkifyText(n.note_text)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Collapse>
    </div>
  );
}
