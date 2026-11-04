// Walks up from `el` to find the nearest ancestor with overflow-y:auto/
// scroll — in this app that resolves to whichever page-level container is
// the real scroll region for the current tab (window itself never scrolls
// in this layout). Matched structurally by computed CSS property rather
// than a class name/ref threaded down through props, so it keeps working
// regardless of how deep `el` sits in the tree. Shared by every place that
// needs to reset or restore a scroll position on a content swap — originally
// local to BatchTable.jsx's create/edit panel, promoted here so
// TeamTrainingStatusCard.jsx and EmployeeTrainingPanel.jsx can reuse the
// same convention instead of re-deriving their own.
//
// Requires actual vertical overflow (scrollHeight > clientHeight), not just
// a matching computed style — an ancestor with only overflow-x set (e.g. a
// table's horizontal-scroll wrapper) computes overflowY as "auto" too, per
// the CSS spec's overflow-x/overflow-y coupling rule (either axis set to a
// non-visible value forces the other off "visible"), even though it never
// actually scrolls vertically. Without this check the walk can stop one
// level too early at that wrapper and silently no-op on the real container
// further up (confirmed via a live repro: BatchTable.jsx's table-wrapper
// div matched overflowY:auto with scrollTop permanently stuck at 0, while
// the actual scrolled ancestor two levels up sat untouched).
export function getScrollContainer(el) {
  let node = el?.parentElement;
  while (node && node !== document.body && node !== document.documentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}

export function getChar() {
  // const emojis = ["😀", "🎉", "🚀", "✨", "🔥", "🍕", "🐱", "🌍", "💡", "🎶"];
  const emojis = [
    // Faces & Reactions
    "😀",
    "😁",
    "😊",
    "😎",

    // Celebration & Energy
    "🎉",
    "🥳",
    "✨",
    "🌟",
    "🔥",

    // Work & Ideas
    "💡",
    "📊",
    "💻",

    // Food & Fun
    "🍕",
    "☕",
    "🍩",
    "🍔",
    "🍪",
    "🥗",
    "🥤",

    //  Nature
    "🌞",
    "🌝",

    // Music & Creativity
    "🎶",
    "🎨",
    "🎤",
    "🎧",
  ];

  const randomIndex = Math.floor(Math.random() * emojis.length);
  return emojis[randomIndex];
}

export function getHeaderName(header) {
  const headerMap = {
    // Field names (direct from database)
    domain_name: "Domain",
    discipline_name: "Discipline",
    skill_name: "Skill Area",
    framework_name: "Framework",
    // Level fields
    L1: "Basic",
    L2: "Intermediate",
    L3: "Expert",
    // Certificate fields
    certProvider: "Cert. Provider",
    certName: "Certificate Name",
    certLevel: "Cert. Level",
    validYears: "Validity (in yrs)",
  };
  return headerMap[header] || header;
}
