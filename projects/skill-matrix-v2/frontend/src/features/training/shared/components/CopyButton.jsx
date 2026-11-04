import React, { useState } from "react";
import { FiCopy, FiCheck } from "react-icons/fi";

/**
 * Small button that copies `text` when you click it. After copying, it shows
 * a tick mark for 1.5 seconds. If `text` is empty, the button is not shown.
 */
const DEFAULT_CLASS_NAME =
  "shrink-0 p-0.5 rounded cursor-pointer text-gray-400 opacity-40 group-hover:opacity-100 hover:!opacity-100 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 focus:opacity-100 transition-opacity";

export default function CopyButton({ text, label = "Copy", className = DEFAULT_CLASS_NAME, icon }) {
  const [copied, setCopied] = useState(false);
  const Icon = icon || FiCopy;
  if (!text) return null;

  const handleCopy = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(String(text));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Copy can fail (for example, the browser does not allow it). We do not
      // show an error; the icon just does not change to a tick mark.
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? `${label} copied` : label}
      title={copied ? "Copied!" : label}
      className={className}
    >
      {copied ? <FiCheck className="h-3 w-3 text-green-600 dark:text-green-400" /> : <Icon className="h-3 w-3" />}
    </button>
  );
}
