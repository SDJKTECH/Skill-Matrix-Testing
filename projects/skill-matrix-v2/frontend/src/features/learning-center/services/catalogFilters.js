export function filterCatalog(courses, { search, type, duration }) {
  const q = search.trim().toLowerCase();
  return courses.filter((course) => {
    if (q && !course.title.toLowerCase().includes(q) && !course.description.toLowerCase().includes(q)) {
      return false;
    }
    if (type && course.type !== type) return false;
    if (duration && course.durationMinutes !== Number(duration)) return false;
    return true;
  });
}

// Raw passthrough — whatever duration_minutes holds in the DB, shown as-is.
export function formatDuration(minutes) {
  return `${minutes} min`;
}
