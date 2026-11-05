import {
  FiBookOpen,
  FiClipboard,
  FiFileText,
  FiMonitor,
  FiPlayCircle,
  FiShield,
} from "react-icons/fi";

const isPolicy = (type) => String(type).toLowerCase() === "policy";

export function TypePill({ type }) {
  const Icon = isPolicy(type) ? FiShield : FiBookOpen;
  const tone = isPolicy(type)
    ? "bg-violet-50 text-violet-700 ring-violet-600/10 dark:bg-violet-900/20 dark:text-violet-300 dark:ring-violet-400/20"
    : "bg-blue-50 text-blue-700 ring-blue-600/10 dark:bg-blue-900/20 dark:text-blue-300 dark:ring-blue-400/20";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone}`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {type}
    </span>
  );
}

export function LessonMaterialIcon({ type }) {
  const normalized = String(type || "document").toLowerCase();
  const Icon =
    normalized === "video"
      ? FiPlayCircle
      : normalized === "text"
        ? FiFileText
        : normalized === "quiz"
          ? FiClipboard
          : FiMonitor;

  return (
    <Icon
      className="mt-0.5 h-4 w-4 shrink-0 text-gray-400"
      aria-hidden="true"
    />
  );
}
