// Minimal client-side CSV generation for the "Export" button on each
// Training Analytics chart.

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/** @param {Array<object>} rows @returns {string} */
export function toCsv(rows) {
  if (!rows || rows.length === 0) return "";
  const columns = Array.from(rows.reduce((cols, row) => {
    Object.keys(row).forEach((key) => cols.add(key));
    return cols;
  }, new Set()));

  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(columns.map((col) => csvEscape(row[col])).join(","));
  }
  return lines.join("\n");
}

/** Builds a CSV file client-side and triggers a browser download for it. */
export function downloadCsv(filename, rows) {
  const csv = toCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
