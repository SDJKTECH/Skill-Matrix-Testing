// Search code shared by all pages. It does not know about trainings or
// batches. Each page gives a list of small functions that read the fields
// to search (e.g. name, status). To search a new field, add it to that list.

/**
 * Splits the search text into lowercase words and drops extra spaces.
 * Example: "python  developer" -> ["python", "developer"].
 * @param {string} query
 * @returns {string[]}
 */
export function tokenizeQuery(query) {
  return String(query || "")
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

/**
 * Reads every search field from `record` and joins them into one lowercase
 * string. A field can be text, a number or a list (lists are joined too).
 * Empty fields are skipped.
 * @param {unknown} record
 * @param {Array<(record: unknown) => unknown>} fieldGetters
 * @returns {string}
 */
export function buildSearchHaystack(record, fieldGetters) {
  const parts = [];
  for (const getField of fieldGetters) {
    let value;
    try {
      value = getField(record);
    } catch {
      continue; // data may not be loaded yet; skip it instead of breaking search
    }
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry != null && entry !== "") parts.push(String(entry));
      }
      continue;
    }
    if (value === "") continue;
    parts.push(String(value));
  }
  return parts.join(" ␟ ").toLowerCase(); // ␟ keeps text from two fields from joining into one word
}

/**
 * True when every search word is found somewhere in the record, in any order
 * ("python advanced" matches both words anywhere). Case does not matter, and
 * part of a word also matches. An empty search matches everything.
 * @param {unknown} record
 * @param {string} query
 * @param {Array<(record: unknown) => unknown>} fieldGetters
 */
export function matchesSearchQuery(record, query, fieldGetters) {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return true;
  const haystack = buildSearchHaystack(record, fieldGetters);
  return tokens.every((token) => haystack.includes(token));
}

/**
 * Returns only the records that match the search. For an empty search it
 * returns the same list it was given, so React can see that nothing changed.
 * @template T
 * @param {T[]} records
 * @param {string} query
 * @param {Array<(record: T) => unknown>} fieldGetters
 * @returns {T[]}
 */
export function filterBySearchQuery(records, query, fieldGetters) {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return records;
  const list = records || [];
  return list.filter((record) => {
    const haystack = buildSearchHaystack(record, fieldGetters);
    return tokens.every((token) => haystack.includes(token));
  });
}

/**
 * Splits `text` into parts, marking which parts match the search, so the UI
 * can highlight them. It uses the same words as the search itself. Longer
 * words are checked first, so "reactjs" is marked as one part, not "react".
 * @param {unknown} text
 * @param {string} query
 * @returns {Array<{text: string, match: boolean}>}
 */
export function getMatchSegments(text, query) {
  const value = text == null ? "" : String(text);
  const tokens = tokenizeQuery(query);
  if (!value || tokens.length === 0) return [{ text: value, match: false }];

  const pattern = [...new Set(tokens)]
    .sort((a, b) => b.length - a.length)
    .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const re = new RegExp(`(${pattern})`, "gi");

  const segments = [];
  let lastIndex = 0;
  let match = re.exec(value);
  while (match !== null) {
    if (match.index > lastIndex) segments.push({ text: value.slice(lastIndex, match.index), match: false });
    segments.push({ text: match[0], match: true });
    lastIndex = match.index + match[0].length;
    if (match.index === re.lastIndex) re.lastIndex += 1; // stop an endless loop on an empty match
    match = re.exec(value);
  }
  if (lastIndex < value.length) segments.push({ text: value.slice(lastIndex), match: false });
  return segments;
}
