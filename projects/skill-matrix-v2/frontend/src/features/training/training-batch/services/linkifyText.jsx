import React from "react";

const URL_REGEX = /https?:\/\/[^\s<>"']+/g;
// Characters at the end that are usually punctuation, not part of the link
// (e.g. "see http://x.com." or "(http://x.com)").
const TRAILING_PUNCTUATION = /[.,!?;:)\]}'"]+$/;

/* ── Renders free text with any http(s) URLs turned into clickable links.
   Used for all user-typed text (Notes, Description, Content, Resources…),
   so links look the same everywhere. It only changes how text is shown,
   not what is saved. */
export default function linkifyText(text) {
  if (typeof text !== "string" || !text) return text;
  const matches = text.match(URL_REGEX);
  if (!matches) return text;

  const parts = text.split(URL_REGEX);
  const nodes = [];
  parts.forEach((part, i) => {
    if (part) nodes.push(<React.Fragment key={`t${i}`}>{part}</React.Fragment>);
    const rawUrl = matches[i];
    if (!rawUrl) return;
    const trailing = rawUrl.match(TRAILING_PUNCTUATION)?.[0] || "";
    const url = trailing ? rawUrl.slice(0, -trailing.length) : rawUrl;
    nodes.push(
      <a
        key={`u${i}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 dark:text-blue-400 hover:underline break-all"
      >
        {url}
      </a>
    );
    if (trailing) nodes.push(<React.Fragment key={`p${i}`}>{trailing}</React.Fragment>);
  });
  return nodes;
}
