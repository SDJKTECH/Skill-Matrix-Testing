export const plural = (count, word) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

const formatDate = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

export const formatRelative = (iso) => {
  if (!iso) return "—";

  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

  if (days < 0) return formatDate(iso);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;

  return formatDate(iso);
};

export const formatDuration = (minutes) => {
  const value = Number(minutes) || 0;

  if (value < 60) return `${value} min`;

  const hours = Math.floor(value / 60);
  const remainder = value % 60;

  return remainder ? `${hours} h ${remainder} min` : `${hours} h`;
};
