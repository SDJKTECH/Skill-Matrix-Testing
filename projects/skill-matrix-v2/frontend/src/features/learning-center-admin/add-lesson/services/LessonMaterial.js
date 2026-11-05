import { FiVideo, FiFileText, FiAlignLeft, FiHelpCircle } from "react-icons/fi";

// Single source of truth for the material types shown in the selector.
// `accept` / `maxMB` / `hint` only apply to types that upload a file.
export const MATERIAL_TYPES = [
  {
    key: "video",
    label: "Video",
    icon: FiVideo,
    accept: "video/mp4,video/webm",
    maxMB: 500,
    hint: "MP4 or WebM, up to 500MB",
  },
  {
    key: "document",
    label: "Document",
    icon: FiFileText,
    accept: ".pdf,.doc,.docx,.ppt,.pptx",
    maxMB: 50,
    hint: "PDF, DOC or PPT, up to 50MB",
  },
  { key: "text", label: "Text", icon: FiAlignLeft },
  { key: "quiz", label: "Quiz", icon: FiHelpCircle },
];

export const FILE_TYPES = ["video", "document"];

export const getMaterialType = (key) => MATERIAL_TYPES.find((t) => t.key === key);

export function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}