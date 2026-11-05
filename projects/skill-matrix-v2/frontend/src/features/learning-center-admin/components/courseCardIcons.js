import {
  FiBookOpen,
  FiCloud,
  FiCode,
  FiHeart,
  FiShield,
  FiUsers,
} from "react-icons/fi";

export const COURSE_CARD_ICONS = [
  { key: "book-open", label: "Book", icon: FiBookOpen },
  { key: "shield", label: "Shield", icon: FiShield },
  { key: "code", label: "Code", icon: FiCode },
  { key: "cloud", label: "Cloud", icon: FiCloud },
  { key: "users", label: "People", icon: FiUsers },
  { key: "heart", label: "Heart", icon: FiHeart },
];

export const getCourseCardIcon = (key, courseType) => {
  const fallback = String(courseType || "").toLowerCase() === "policy"
    ? "shield"
    : "book-open";

  return (
    COURSE_CARD_ICONS.find((item) => item.key === (key || fallback)) ||
    COURSE_CARD_ICONS[0]
  );
};
