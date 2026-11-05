import React, { useRef, useState } from "react";
import { FiUploadCloud } from "react-icons/fi";

export default function FileDropzone({ accept, hint, error, onFileSelect }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    onFileSelect(e.dataTransfer.files?.[0]);
  };

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-1 py-8 rounded-xl border-2 border-dashed cursor-pointer transition-colors text-center ${
          dragging
            ? "border-blue-400 bg-blue-50 dark:bg-blue-900/20"
            : error
            ? "border-red-300 dark:border-red-500/60"
            : "border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700"
        }`}
      >
        <div className="w-9 h-9 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mb-1">
          <FiUploadCloud className="h-4 w-4 text-blue-500 dark:text-blue-400" />
        </div>
        <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">
          Drag and drop your file here, or click to browse
        </p>
        <p className="text-[10px] text-gray-400 dark:text-gray-500">{hint}</p>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            inputRef.current?.click();
          }}
          className="mt-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          Choose File
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            onFileSelect(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {error && <p className="mt-1 text-[10px] text-red-500">{error}</p>}
    </div>
  );
}