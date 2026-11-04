import React, { useState, useEffect, useRef } from "react";
import { getApiUrl } from "../config/apiConfig";

// Same-origin path in both Vite (local proxy) and production (Cloud Run proxy)
const ASK_QUESTION_V2_BASE = getApiUrl("ask_question_v2");

const CHAT_HISTORY_KEY = "skill-matrix-chat-recent-queries";
const MAX_RECENT_QUERIES = 30;

function loadRecentQueries() {
  try {
    const raw = localStorage.getItem(CHAT_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT_QUERIES) : [];
  } catch {
    return [];
  }
}

function saveRecentQueries(queries) {
  try {
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(queries.slice(0, MAX_RECENT_QUERIES)));
  } catch {
    // ignore
  }
}

export default function ChatPanel({ open, onClose, fullScreen = false, embeddedInContent = false }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [sending, setSending] = useState(false);
  const [recentQueries, setRecentQueries] = useState(loadRecentQueries);
  const endRef = useRef(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    saveRecentQueries(recentQueries);
  }, [recentQueries]);

  useEffect(() => {
    try {
      if (window.innerWidth >= 1024) {
        setHistoryOpen(true);
      }
    } catch {
      // window not available (SSR) - keep default
    }
  }, []);

  const formatTableAsCSV = (columns, rows) => {
    if (!columns || columns.length === 0 || !rows || rows.length === 0) {
      return "";
    }

    const escapeCell = (value) => {
      const s = value == null ? "" : String(value);
      if (/[",\n]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const header = columns.map(escapeCell).join(",");
    const body = rows
      .map((row) => columns.map((col) => escapeCell(row[col])).join(","))
      .join("\n");

    return `${header}\n${body}`;
  };

  const formatTableAsHTML = (columns, rows) => {
    if (!columns || columns.length === 0 || !rows || rows.length === 0) {
      return "";
    }
    const escape = (s) => {
      const str = s == null ? "" : String(s);
      return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    };
    const headerCells = columns
      .map((col) => `<th style="border:1px solid #888;padding:6px 8px;text-align:left;background:#e2e8f0;font-weight:600;">${escape(col)}</th>`)
      .join("");
    const bodyRows = rows
      .map(
        (row) =>
          `<tr>${columns
            .map(
              (col) =>
                `<td style="border:1px solid #ccc;padding:4px 8px;">${escape(row[col] != null ? String(row[col]) : "—")}</td>`
            )
            .join("")}</tr>`
      )
      .join("");
    return (
      `<table style="border-collapse:collapse;font-size:12px;">` +
      `<thead><tr>${headerCells}</tr></thead>` +
      `<tbody>${bodyRows}</tbody></table>`
    );
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg = { role: "user", text, id: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setRecentQueries((prev) =>
      [{ id: Date.now(), text, createdAt: new Date().toISOString() }, ...prev].slice(0, MAX_RECENT_QUERIES)
    );
    setInput("");
    setSending(true);

    const loadingId = Date.now() + 1;
    setMessages((prev) => [
      ...prev,
      { role: "bot", text: "", id: loadingId, loading: true },
    ]);

    try {
      // Always use root path - same for local dev and deployed Cloud Function
      const endpoint = ASK_QUESTION_V2_BASE;
      const authToken = localStorage.getItem("authToken");
      const headers = { "Content-Type": "application/json" };
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          question: text,
          ...(sessionId && { session_id: sessionId }),
        }),
      });

      if (!res.ok) {
        let errorMessage = "Something went wrong. Please try again or rephrase your question.";
        try {
          const errorData = await res.json();
          const rawError = errorData?.error || "";
          const isTechnical =
            res.status >= 500 ||
            /sql|syntax|psycopg2|line \d+:|sqlalche|traceback/i.test(rawError);
          errorMessage = isTechnical || !rawError
            ? "Something went wrong. Please try again or rephrase your question."
            : rawError;
        } catch {
          if (res.status === 500) {
            errorMessage = "Server error. Please check if the backend is running or try again later.";
          } else if (res.status === 404) {
            errorMessage = "The assistant service is not available. Please check if the backend is running.";
          }
        }
        
        setMessages((prev) =>
          prev.map((m) =>
            m.id === loadingId
              ? {
                  ...m,
                  loading: false,
                  text: errorMessage,
                }
              : m
          )
        );
        return;
      }

      const data = await res.json();

      if (data.session_id) setSessionId(data.session_id);

      const hasRows = data.rows && data.rows.length > 0;
      const summary = hasRows
        ? `Found ${data.rows.length} row(s).`
        : "No rows returned.";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === loadingId
            ? {
                ...m,
                loading: false,
                text: summary,
                columns: data.columns,
                rows: data.rows,
              }
            : m
        )
      );
    } catch (err) {
      console.error("Error sending message:", err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === loadingId
            ? {
                ...m,
                loading: false,
                text: "Something went wrong. Please try again or check your connection.",
              }
            : m
        )
      );
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  const panelClasses = fullScreen && embeddedInContent
    ? "flex-1 min-h-0 min-w-0 flex flex-col bg-white dark:bg-slate-900 shadow-inner rounded-lg border border-slate-200 dark:border-slate-700"
    : fullScreen
    ? "fixed inset-0 z-[200] flex flex-col bg-white dark:bg-slate-900 shadow-2xl"
    : "w-[360px] shrink-0 flex flex-col border-l border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl h-full min-h-0";

  const showHistorySidebar = (fullScreen || embeddedInContent) && historyOpen;

  const handleNewChat = () => {
    setMessages([]);
    setSessionId(null);
    setInput("");
  };

  const formatQueryDate = (iso) => {
    try {
      const d = new Date(iso);
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      if (isToday) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      return d.toLocaleDateString([], { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  };

  return (
    <div className={panelClasses}>
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        <div className="flex items-center gap-3 flex-wrap">
          {(fullScreen || embeddedInContent) && (
            <button
              type="button"
              onClick={() => setHistoryOpen((open) => !open)}
              className="inline-flex items-center justify-center px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white/80 dark:bg-slate-800/80 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              aria-label={historyOpen ? "Hide quick queries" : "Show quick queries"}
            >
              <svg
                className="w-4 h-4 mr-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h10M4 18h7"
                />
              </svg>
            </button>
          )}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
              <svg
                className="w-4 h-4 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            </div>
            <div>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Assistant
              </span>
              <p className="text-xs text-slate-500 dark:text-slate-400">Online</p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-sm font-medium shadow-sm hover:shadow transition-colors"
          aria-label="Back to Skill Matrix"
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          <span>Back to Matrix</span>
        </button>
      </div>

      <div className="flex-1 min-h-0 flex overflow-hidden">
        {showHistorySidebar && (
          <aside className="w-56 sm:w-60 shrink-0 flex flex-col border-r border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800/50">
            <div className="p-3 border-b border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={handleNewChat}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 text-sm font-medium transition-colors shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New chat
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              <h3 className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Recent queries
              </h3>
              <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
                {recentQueries.length === 0 ? (
                  <p className="px-2 py-4 text-xs text-slate-500 dark:text-slate-400 text-center">
                    No recent queries yet. Ask something to see them here.
                  </p>
                ) : (
                  recentQueries.map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setInput(q.text)}
                      className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600/80 transition-colors block border border-transparent hover:border-slate-200 dark:hover:border-slate-600"
                      title={q.text}
                    >
                      <span className="line-clamp-2 block break-words">{q.text}</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 block">
                        {formatQueryDate(q.createdAt)}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </aside>
        )}

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden min-w-0">
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px] bg-slate-50/50 dark:bg-slate-900/50">
          <div className={fullScreen ? "w-full max-w-3xl mx-auto space-y-3" : "space-y-3"}>
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center mb-3">
                <svg
                  className="w-6 h-6 text-slate-500 dark:text-slate-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                How can I help you?
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Send a message to start the conversation.
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                    msg.role === "user"
                      ? "bg-blue-500 text-white rounded-br-md"
                      : "bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-600 rounded-bl-md"
                  }`}
                >
                  {msg.loading ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-slate-400 animate-pulse" />
                      <span className="w-2 h-2 rounded-full bg-slate-400 animate-pulse [animation-delay:0.2s]" />
                      <span className="w-2 h-2 rounded-full bg-slate-400 animate-pulse [animation-delay:0.4s]" />
                    </span>
                  ) : (
                    <>
                      {msg.text}
                      {msg.rows && msg.rows.length > 0 && (() => {
                        const cols =
                          msg.columns && msg.columns.length > 0
                            ? msg.columns
                            : Object.keys(msg.rows[0] || {});
                        if (cols.length === 0) return null;

                        const getCell = (row, col) => {
                          const val = row[col];
                          return val != null ? String(val) : "—";
                        };

                        const handleCopyTable = async () => {
                          try {
                            const html = formatTableAsHTML(cols, msg.rows);
                            const plain = formatTableAsCSV(cols, msg.rows);
                            if (!html) return;
                            if (navigator.clipboard?.write) {
                              const blob = new Blob(
                                ["\uFEFF<html><body>" + html + "</body></html>"],
                                { type: "text/html;charset=utf-8" }
                              );
                              await navigator.clipboard.write([
                                new ClipboardItem({
                                  "text/html": blob,
                                  "text/plain": new Blob([plain], {
                                    type: "text/plain;charset=utf-8",
                                  }),
                                }),
                              ]);
                            } else if (navigator.clipboard?.writeText) {
                              await navigator.clipboard.writeText(plain);
                            } else {
                              const textarea = document.createElement("textarea");
                              textarea.value = plain;
                              textarea.style.position = "fixed";
                              textarea.style.left = "-9999px";
                              document.body.appendChild(textarea);
                              textarea.select();
                              document.execCommand("copy");
                              document.body.removeChild(textarea);
                            }
                          } catch (error) {
                            console.error("Failed to copy table", error);
                          }
                        };

                        const handleDownloadCSV = () => {
                          try {
                            const csv = formatTableAsCSV(cols, msg.rows);
                            const blob = new Blob([csv], {
                              type: "text/csv;charset=utf-8;",
                            });
                            const url = URL.createObjectURL(blob);
                            const link = document.createElement("a");
                            const timestamp = new Date()
                              .toISOString()
                              .slice(0, 19)
                              .replace(/[:T]/g, "-");
                            link.href = url;
                            link.download = `query-results-${timestamp}.csv`;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            URL.revokeObjectURL(url);
                          } catch (error) {
                            console.error("Failed to download CSV", error);
                          }
                        };

                        return (
                          <div className="mt-2 -mx-1 rounded border border-slate-300 dark:border-slate-500 bg-slate-50 dark:bg-slate-800/50">
                            <div className="flex justify-end gap-2 px-2 pt-1 pb-2 border-b border-slate-200 dark:border-slate-600 text-[11px]">
                              <button
                                type="button"
                                onClick={handleCopyTable}
                                className="inline-flex items-center justify-center rounded-full border border-slate-300 dark:border-slate-500 bg-white/80 dark:bg-slate-800/80 px-2.5 py-1 font-medium text-slate-700 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                              >
                                Copy
                              </button>
                              <button
                                type="button"
                                onClick={handleDownloadCSV}
                                className="inline-flex items-center justify-center rounded-full border border-blue-500/70 bg-blue-500/90 px-2.5 py-1 font-medium text-white hover:bg-blue-600 transition-colors"
                              >
                                Download CSV
                              </button>
                            </div>
                            <div style={{ maxHeight: "320px", overflow: "auto" }}>
                              <table className="w-full text-xs border-collapse min-w-[240px]">
                                <thead className="sticky top-0 z-10 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm">
                                  <tr>
                                    {cols.map((col) => (
                                      <th
                                        key={col}
                                        className="text-left py-2 px-2 border-b border-r border-slate-400 dark:border-slate-500 font-semibold last:border-r-0 whitespace-nowrap"
                                      >
                                        {col}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {msg.rows.map((row, i) => (
                                    <tr
                                      key={i}
                                      className="border-b border-slate-200 dark:border-slate-600 last:border-b-0 hover:bg-slate-100 dark:hover:bg-slate-700/50"
                                    >
                                      {cols.map((col) => (
                                        <td
                                          key={col}
                                          className="py-1.5 px-2 border-r border-slate-200 dark:border-slate-600 last:border-r-0 align-top break-words"
                                        >
                                          {getCell(row, col)}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              {msg.rows.length > 20 && (
                                <p className="sticky bottom-0 text-[10px] text-slate-500 dark:text-slate-400 py-1 px-2 border-t border-slate-200 dark:border-slate-600 bg-slate-100 dark:bg-slate-800/80 text-right">
                                  Scroll to see all {msg.rows.length} rows
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={endRef} />
          </div>
        </div>

        <div className="shrink-0 p-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <div className={`flex items-center gap-2 ${fullScreen ? "max-w-3xl mx-auto" : ""}`}>
            <div className="relative flex-1 min-w-0">
              <button
                type="button"
                onClick={handleNewChat}
                className="absolute inset-y-0 left-3 my-1 flex items-center justify-center text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-slate-100"
                aria-label="Start new chat"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </button>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && !e.shiftKey && sendMessage()
                }
                placeholder="Type a message..."
                className="w-full pl-10 pr-4 py-2.5 text-sm rounded-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <button
              onClick={sendMessage}
              disabled={!input.trim() || sending}
              className="shrink-0 w-10 h-10 rounded-full bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors"
              aria-label="Send message"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            </button>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
