// Chart color tokens for Training Analytics. Categorical order is fixed
// (never cycled/reordered) — the ordering is the colorblind-safety mechanism.

// Muted/pastel vs the skill's stock reference palette — same hue order, raised
// lightness + reduced chroma; re-validated with scripts/validate_palette.js (all pass).
export const CATEGORICAL_LIGHT = [
  "#5287c8", // 1 blue
  "#da825f", // 2 orange
  "#32b184", // 3 aqua
  "#e1a525", // 4 yellow
  "#e597b5", // 5 magenta
  "#68b468", // 6 green
  "#776db7", // 7 violet
  "#d66f6e", // 8 red
];

export const CATEGORICAL_DARK = [
  "#4e8ad3",
  "#c6633c",
  "#28916d",
  "#b57f16",
  "#c76186",
  "#387e38",
  "#8378dc",
  "#d56b6b",
];

// Single-hue sequential blue — used for the Module bar chart (one series,
// no per-bar identity needed).
export const SEQUENTIAL_BAR_LIGHT = "#5287c8";
export const SEQUENTIAL_BAR_DARK = "#4e8ad3";

// Fixed status palette, never themed — same hex values in light and dark,
// distinct from the categorical slots. Every bar these paint is still
// direct-labeled, never color alone. Lighter/softer than a flat desaturation
// (raised lightness, not lowered) so the bars read as pastel, not muddy.
export const STATUS_COLORS = {
  notStarted: "#e29d83", // serious
  inProgress: "#dcb050", // warning
  completed: "#68b468", // good — same green as the pie charts' categorical slot 6
  notCompleted: "#cb9696", // critical
};

// Same status palette, mapped onto the cert expiry vocabulary (see
// certRecordAdapter.jsx's getCertExpiryStatus).
export const CERT_STATUS_COLORS = {
  Valid: "#68b468", // good — same green as the pie charts' categorical slot 6
  "Expiring Soon": "#dcb050", // warning
  Expired: "#cb9696", // critical
};

export const CHROME = {
  light: {
    surface: "#fcfcfb",
    textPrimary: "#0b0b0b",
    textSecondary: "#52514e",
    muted: "#898781",
    gridline: "#e1e0d9",
    baseline: "#c3c2b7",
  },
  dark: {
    surface: "#1a1a19",
    textPrimary: "#ffffff",
    textSecondary: "#c3c2b7",
    muted: "#898781",
    gridline: "#2c2c2a",
    baseline: "#383835",
  },
};

/**
 * @param {boolean} dark
 * @returns {{ categorical: string[], barFill: string, chrome: object }}
 */
export function getChartTheme(dark) {
  return {
    categorical: dark ? CATEGORICAL_DARK : CATEGORICAL_LIGHT,
    barFill: dark ? SEQUENTIAL_BAR_DARK : SEQUENTIAL_BAR_LIGHT,
    chrome: dark ? CHROME.dark : CHROME.light,
  };
}
