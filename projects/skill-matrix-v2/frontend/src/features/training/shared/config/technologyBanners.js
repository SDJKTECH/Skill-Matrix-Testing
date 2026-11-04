// Reusable technology banner system for the My Trainings course cards.
// One shared design language (gradient + icon + label), one lookup table —
// add a new technology by adding one entry here, never in TrainingCard.jsx.
//
// Icons: brand marks come from react-icons/si (Simple Icons) — this is the
// SAME react-icons package this app already depends on for react-icons/fi
// everywhere else, just a different icon subset within it, so this isn't a
// new dependency. A few product marks Simple Icons doesn't carry a logo
// for (Azure, Power BI, Excel — Microsoft-owned, commonly excluded) and
// every non-brand category (Security, Agile, Leadership, Healthcare, ...)
// fall back to a themed react-icons/fi icon instead — still one shared
// system, just not always a literal logo.
//
// Matching is a case-insensitive keyword search across the training's own
// module + sub-area + area text (getTechBanner), not a single-field key —
// the exact technology name usually lives in the MODULE title (e.g.
// module "Kubernetes Fundamentals", subArea only "Containers"), so a
// single-field lookup would miss it. Order matters: more specific
// keywords are listed before broad/generic ones (e.g. "python" before the
// catch-all "data") so a specific match always wins over a vague one.
import {
  SiReact, SiAngular, SiVuedotjs, SiSpringboot, SiOpenjdk, SiDotnet, SiPython, SiNodedotjs,
  SiPostgresql, SiMongodb, SiOracle, SiAmazonwebservices, SiGooglecloud, SiDocker, SiKubernetes,
  SiTerraform, SiGithub, SiTableau, SiOpenai, SiSap, SiScrumalliance,
} from "react-icons/si";
import {
  FiCloud, FiShield, FiTrendingUp, FiMessageCircle, FiHeart, FiUmbrella, FiShoppingBag,
  FiUserPlus, FiBarChart2, FiFileText, FiCpu, FiDatabase, FiBookOpen,
} from "react-icons/fi";

const TECH_BANNERS = [
  { keywords: ["react"], label: "React", icon: SiReact, gradient: "from-sky-500 to-sky-600" },
  { keywords: ["angular"], label: "Angular", icon: SiAngular, gradient: "from-red-600 to-red-700" },
  { keywords: ["vue"], label: "Vue", icon: SiVuedotjs, gradient: "from-emerald-500 to-emerald-600" },
  { keywords: ["spring boot", "springboot"], label: "Spring Boot", icon: SiSpringboot, gradient: "from-green-600 to-green-700" },
  { keywords: ["java"], label: "Java", icon: SiOpenjdk, gradient: "from-orange-600 to-red-700" },
  { keywords: [".net", "dotnet", "c#"], label: ".NET", icon: SiDotnet, gradient: "from-purple-600 to-purple-700" },
  { keywords: ["node"], label: "Node.js", icon: SiNodedotjs, gradient: "from-green-600 to-green-700" },
  { keywords: ["python"], label: "Python", icon: SiPython, gradient: "from-blue-600 to-yellow-500" },
  { keywords: ["mongodb", "mongo"], label: "MongoDB", icon: SiMongodb, gradient: "from-green-600 to-green-700" },
  { keywords: ["oracle"], label: "Oracle", icon: SiOracle, gradient: "from-red-600 to-red-700" },
  { keywords: ["postgres", "sql"], label: "SQL", icon: SiPostgresql, gradient: "from-indigo-500 to-indigo-600" },
  { keywords: ["aws", "amazon web"], label: "AWS", icon: SiAmazonwebservices, gradient: "from-orange-500 to-orange-600" },
  { keywords: ["azure"], label: "Azure", icon: FiCloud, gradient: "from-blue-500 to-blue-600" },
  { keywords: ["google cloud", "gcp"], label: "Google Cloud", icon: SiGooglecloud, gradient: "from-blue-500 to-red-500" },
  { keywords: ["docker"], label: "Docker", icon: SiDocker, gradient: "from-sky-500 to-sky-600" },
  { keywords: ["kubernetes", "k8s"], label: "Kubernetes", icon: SiKubernetes, gradient: "from-blue-600 to-blue-700" },
  { keywords: ["terraform"], label: "Terraform", icon: SiTerraform, gradient: "from-violet-600 to-purple-700" },
  { keywords: ["github", "git"], label: "GitHub", icon: SiGithub, gradient: "from-gray-700 to-gray-900" },
  { keywords: ["power bi", "powerbi"], label: "Power BI", icon: FiBarChart2, gradient: "from-yellow-500 to-amber-600" },
  { keywords: ["tableau"], label: "Tableau", icon: SiTableau, gradient: "from-blue-700 to-indigo-800" },
  { keywords: ["excel"], label: "Excel", icon: FiFileText, gradient: "from-green-600 to-green-700" },
  { keywords: ["security", "compliance"], label: "Security", icon: FiShield, gradient: "from-rose-600 to-rose-700" },
  { keywords: ["agile", "scrum"], label: "Agile", icon: SiScrumalliance, gradient: "from-teal-500 to-teal-600" },
  { keywords: ["leadership", "management"], label: "Leadership", icon: FiTrendingUp, gradient: "from-amber-500 to-amber-600" },
  { keywords: ["soft skill", "communication"], label: "Soft Skills", icon: FiMessageCircle, gradient: "from-pink-500 to-pink-600" },
  { keywords: ["healthcare", "health"], label: "Healthcare", icon: FiHeart, gradient: "from-red-500 to-red-600" },
  { keywords: ["insurance"], label: "Insurance", icon: FiUmbrella, gradient: "from-cyan-600 to-cyan-700" },
  { keywords: ["retail"], label: "Retail", icon: FiShoppingBag, gradient: "from-fuchsia-600 to-fuchsia-700" },
  { keywords: ["fresher", "onboarding"], label: "Freshers", icon: FiUserPlus, gradient: "from-lime-600 to-green-700" },
  { keywords: ["sap"], label: "SAP", icon: SiSap, gradient: "from-blue-600 to-sky-700" },
  { keywords: ["prompt engineering"], label: "Prompt Engineering", icon: FiCpu, gradient: "from-purple-600 to-violet-700" },
  { keywords: ["gen ai", "generative ai"], label: "Gen AI", icon: SiOpenai, gradient: "from-violet-600 to-fuchsia-700" },
  { keywords: ["machine learning", " ml "], label: "Machine Learning", icon: FiCpu, gradient: "from-indigo-600 to-blue-700" },
  { keywords: ["data science", "data analysis", "data"], label: "Data Science", icon: FiDatabase, gradient: "from-indigo-500 to-indigo-600" },
];

const DEFAULT_BANNER = { label: "Training", icon: FiBookOpen, gradient: "from-gray-500 to-gray-600" };

// Matches against {moduleName, subAreaName, areaName} — a training record's
// own field names. certRecordAdapter.jsx reuses this same keyword table for
// certifications by mapping certName->moduleName/certProvider->areaName
// before calling in (a real cert name like "AWS Certified Solutions
// Architect" hits the existing "aws" keyword for free) rather than
// maintaining a second banner table — but a non-matching CERT falling back
// to a banner literally labeled "Training" would be wrong, hence
// `fallbackLabel` instead of the DEFAULT_BANNER's own label being hardcoded
// into the return value.
export function getTechBanner(training, { fallbackLabel = DEFAULT_BANNER.label } = {}) {
  const haystack = ` ${training?.moduleName || ""} ${training?.subAreaName || ""} ${training?.areaName || ""} `.toLowerCase();
  const match = TECH_BANNERS.find((b) => b.keywords.some((k) => haystack.includes(k)));
  const banner = match || { ...DEFAULT_BANNER, label: fallbackLabel };
  // Accent (tint/border/icon classes) bundled onto the same object so every
  // caller gets it for free — EntityCard/NominationCard consume these
  // directly (caller-supplied styling; neither component derives domain
  // styling itself, matching EntityCard's "carries zero domain knowledge"
  // contract).
  return { ...banner, ...getCardHeaderAccent(banner.gradient) };
}

// Card-header accent (UX addendum §3.1 — "desaturate for large surfaces,
// saturate for small accents"): every TECH_BANNERS entry's `gradient`
// string already encodes one hue ("from-{hue}-NNN to-{hue}-NNN") — this
// derives a soft-tint background + full-saturation left-border/icon accent
// from THAT hue at lookup time, rather than hand-writing a second 34-entry
// table that could drift out of sync with the gradient one. Literal class
// strings only (Tailwind's JIT scanner needs them to physically appear as
// text somewhere in a scanned file — `bg-${hue}-50` built by runtime string
// interpolation would silently produce no CSS at all), so this is a fixed
// lookup keyed by hue name, not a template.
const HUE_ACCENT_STYLES = {
  sky: { tint: "bg-sky-50 dark:bg-sky-950/40", border: "border-sky-500 dark:border-sky-400", iconColor: "text-sky-600 dark:text-sky-400" },
  red: { tint: "bg-red-50 dark:bg-red-950/40", border: "border-red-500 dark:border-red-400", iconColor: "text-red-600 dark:text-red-400" },
  emerald: { tint: "bg-emerald-50 dark:bg-emerald-950/40", border: "border-emerald-500 dark:border-emerald-400", iconColor: "text-emerald-600 dark:text-emerald-400" },
  green: { tint: "bg-green-50 dark:bg-green-950/40", border: "border-green-500 dark:border-green-400", iconColor: "text-green-600 dark:text-green-400" },
  orange: { tint: "bg-orange-50 dark:bg-orange-950/40", border: "border-orange-500 dark:border-orange-400", iconColor: "text-orange-600 dark:text-orange-400" },
  purple: { tint: "bg-purple-50 dark:bg-purple-950/40", border: "border-purple-500 dark:border-purple-400", iconColor: "text-purple-600 dark:text-purple-400" },
  blue: { tint: "bg-blue-50 dark:bg-blue-950/40", border: "border-blue-500 dark:border-blue-400", iconColor: "text-blue-600 dark:text-blue-400" },
  indigo: { tint: "bg-indigo-50 dark:bg-indigo-950/40", border: "border-indigo-500 dark:border-indigo-400", iconColor: "text-indigo-600 dark:text-indigo-400" },
  gray: { tint: "bg-gray-50 dark:bg-gray-800/60", border: "border-gray-400 dark:border-gray-500", iconColor: "text-gray-600 dark:text-gray-400" },
  yellow: { tint: "bg-yellow-50 dark:bg-yellow-950/40", border: "border-yellow-500 dark:border-yellow-400", iconColor: "text-yellow-600 dark:text-yellow-400" },
  rose: { tint: "bg-rose-50 dark:bg-rose-950/40", border: "border-rose-500 dark:border-rose-400", iconColor: "text-rose-600 dark:text-rose-400" },
  teal: { tint: "bg-teal-50 dark:bg-teal-950/40", border: "border-teal-500 dark:border-teal-400", iconColor: "text-teal-600 dark:text-teal-400" },
  amber: { tint: "bg-amber-50 dark:bg-amber-950/40", border: "border-amber-500 dark:border-amber-400", iconColor: "text-amber-600 dark:text-amber-400" },
  pink: { tint: "bg-pink-50 dark:bg-pink-950/40", border: "border-pink-500 dark:border-pink-400", iconColor: "text-pink-600 dark:text-pink-400" },
  cyan: { tint: "bg-cyan-50 dark:bg-cyan-950/40", border: "border-cyan-500 dark:border-cyan-400", iconColor: "text-cyan-600 dark:text-cyan-400" },
  fuchsia: { tint: "bg-fuchsia-50 dark:bg-fuchsia-950/40", border: "border-fuchsia-500 dark:border-fuchsia-400", iconColor: "text-fuchsia-600 dark:text-fuchsia-400" },
  lime: { tint: "bg-lime-50 dark:bg-lime-950/40", border: "border-lime-500 dark:border-lime-400", iconColor: "text-lime-600 dark:text-lime-400" },
  violet: { tint: "bg-violet-50 dark:bg-violet-950/40", border: "border-violet-500 dark:border-violet-400", iconColor: "text-violet-600 dark:text-violet-400" },
};
const DEFAULT_ACCENT = HUE_ACCENT_STYLES.gray;

/** Derives {tint, border, iconColor} soft-accent classes from a banner's existing gradient string. */
export function getCardHeaderAccent(gradient) {
  const hue = gradient?.match(/from-([a-z]+)-/)?.[1];
  return HUE_ACCENT_STYLES[hue] || DEFAULT_ACCENT;
}
