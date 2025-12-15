// src/utils/formatDate.js
export function formatJST(isoString) {
  if (!isoString) return "—";

  const date = new Date(isoString);

  return date.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
