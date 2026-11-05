import React from "react";

export default function TextMaterialEditor({ value, error, onChange }) {
  return (
    <div className="flex flex-col gap-1">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={8}
        placeholder="Write or paste the lesson content here..."
        className={`w-full rounded-lg border bg-white dark:bg-gray-900 px-3 py-2 text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          error ? "border-red-400 dark:border-red-500" : "border-gray-200 dark:border-gray-700"
        }`}
      />
      {error && <p className="text-[10px] text-red-500">{error}</p>}
    </div>
  );
}